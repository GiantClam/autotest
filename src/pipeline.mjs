import { normalizeProjectDefinition } from "./contracts.mjs";
import { discoverProject } from "./discovery.mjs";
import { executeProjectMethod } from "./method-runner.mjs";
import { executeReleaseAction } from "./release.mjs";
import { appendEvent, loadResumeState } from "./artifacts.mjs";

const PRE_RELEASE_PROJECT_STAGES = ["implementation", "verify", "build", "package", "smoke"];
const POST_RELEASE_PROJECT_STAGES = [];
const PROJECT_STAGES = [...PRE_RELEASE_PROJECT_STAGES, ...POST_RELEASE_PROJECT_STAGES];

function stageRecord(id, status, extra = {}) {
  return { id, status, ...extra };
}

function tagFor(definition, discovery) {
  if (definition.release.tag.versionSource === "explicit") {
    if (!definition.release.tag.version) return null;
    return `${definition.release.tag.prefix}${definition.release.tag.version}`;
  }
  if (!discovery.version) return null;
  return `${definition.release.tag.prefix}${discovery.version}`;
}

function releaseActions(definition, discovery) {
  const actions = [];
  if (definition.release.commit.enabled) actions.push({ stage: "commit", kind: "git-commit", message: definition.release.commit.message, paths: definition.release.commit.paths });
  if (definition.release.push.enabled) actions.push({ stage: "push", kind: "git-push", remote: definition.release.push.remote, branch: discovery.branch, baseBranch: definition.project.defaultBranch });
  if (definition.release.merge.enabled) actions.push({ stage: "merge", kind: "github-pr-merge", repository: definition.project.repository, baseBranch: definition.project.defaultBranch, headBranch: discovery.branch, expectedHeadSha: discovery.gitSha, requiredChecks: definition.release.merge.requiredChecks, captureMergeSha: true, strategy: definition.release.merge.strategy, deleteBranch: definition.release.merge.deleteBranch, createIfMissing: definition.release.merge.createIfMissing });
  if (definition.release.tag.enabled) actions.push({ stage: "tag", kind: "git-tag", repository: definition.project.repository, baseBranch: definition.project.defaultBranch, tag: tagFor(definition, discovery), versionSource: definition.release.tag.versionSource, strictRelease: true });
  if (definition.release.publish.enabled) actions.push({ stage: "publish", kind: "github-release", repository: definition.project.repository, tag: tagFor(definition, discovery), versionSource: definition.release.tag.versionSource, generateNotes: definition.release.publish.generateNotes, timeoutMs: definition.release.publish.timeoutMs, assets: definition.release.publish.assets, requiredArtifacts: definition.release.publish.requiredArtifacts, artifactChecksums: definition.release.publish.artifactChecksums, signaturePaths: definition.release.publish.signaturePaths, notarizationEvidence: definition.release.publish.notarizationEvidence, metadataPath: definition.release.publish.metadataPath, strictRelease: true });
  return actions;
}

export function createPipelinePlan(rawDefinition, discovery) {
  const definition = normalizeProjectDefinition(rawDefinition, { projectRoot: discovery.projectRoot });
  const stages = [stageRecord("discover", "passed", { project: discovery.projectId })];
  for (const stage of PRE_RELEASE_PROJECT_STAGES) {
    const methods = definition.methods[stage];
    stages.push(stageRecord(stage, methods.length > 0 ? "ready" : definition.required[stage] ? "manual_required" : "skipped", {
      methods: methods.map((method) => ({ id: method.id, kind: method.kind })),
      required: definition.required[stage],
    }));
  }
  for (const action of releaseActions(definition, discovery)) {
    const missing = (action.kind === "git-tag" && !action.tag) || (action.kind === "git-push" && !action.branch) || (action.kind === "github-pr-merge" && (!action.headBranch || action.headBranch === action.baseBranch));
    stages.push(stageRecord(action.stage, missing ? "manual_required" : "ready", { action }));
  }
  for (const stage of POST_RELEASE_PROJECT_STAGES) {
    const methods = definition.methods[stage];
    stages.push(stageRecord(stage, methods.length > 0 ? "ready" : definition.required[stage] ? "manual_required" : "skipped", {
      methods: methods.map((method) => ({ id: method.id, kind: method.kind })),
      required: definition.required[stage],
    }));
  }
  return { schemaVersion: 1, project: definition.project, stages, definition };
}

async function runReleaseAction(action, { discovery, execute, releaseExecutor, releaseContext }) {
  if (["github-pr-merge", "github-release"].includes(action.kind) && !action.repository) return { status: "manual_required", reason: "project_repository_required" };
  if (!execute) return { status: "planned", action };
  return releaseExecutor(action, { discovery, execute, releaseContext });
}

async function recordStage(caseDir, stage, status, payload, sequence) {
  if (!caseDir) return;
  const allowed = new Set(["passed", "failed", "blocked", "needs_human", "planned", "skipped"]);
  await appendEvent(caseDir, {
    eventId: `stage-${sequence}-${stage}`,
    stage,
    status: allowed.has(status) ? status : "blocked",
    actor: { type: "autotest", id: "pipeline" },
    inputArtifacts: payload.inputArtifacts ?? [],
    outputArtifacts: payload.outputArtifacts ?? [],
    classification: payload.classification,
    result: payload.result,
    error: payload.reason,
    resumable: payload.resumable,
  });
}

export async function executePipeline(rawDefinition, discovery, { execute = false, methodExecutor = executeProjectMethod, releaseExecutor = executeReleaseAction, releaseGate, playwrightRunner, caseDir = null, resume = false } = {}) {
  const plan = createPipelinePlan(rawDefinition, discovery);
  if (!execute) return { status: "planned", results: plan.stages, plan };
  const resumeState = caseDir && resume ? await loadResumeState(caseDir) : { events: [], resumable: true };
  if (!resumeState.resumable) return { status: "blocked", reason: "non_resumable_failure", results: [], plan };
  const completedStages = new Set(resumeState.events.filter((event) => event.status === "passed").map((event) => event.stage));
  const releaseContext = {};
  const results = [];
  let sequence = resumeState.events.length + 1;

  for (const stage of plan.stages) {
    if (resume && completedStages.has(stage.id)) {
      results.push({ ...stage, status: "passed", resumed: true });
      continue;
    }
    if (stage.id === "discover") {
      results.push(stage);
      await recordStage(caseDir, stage.id, "passed", { result: stage }, sequence++);
      continue;
    }
    if (stage.status === "skipped") {
      results.push(stage);
      await recordStage(caseDir, stage.id, "skipped", { result: stage }, sequence++);
      continue;
    }
    if (stage.status === "manual_required") {
      const blocked = { ...stage, status: "manual_required", reason: stage.id === "tag" ? "project_version_or_explicit_tag_required" : "project_method_required" };
      results.push(blocked);
      await recordStage(caseDir, stage.id, "blocked", { result: blocked, reason: blocked.reason, classification: "human-required", resumable: true }, sequence++);
      return { status: "blocked", stoppedAt: stage.id, results, plan };
    }
    if (PROJECT_STAGES.includes(stage.id)) {
      const methods = plan.definition.methods[stage.id];
      const methodResults = [];
      for (const method of methods) {
        let result;
        let attempts = 0;
        do {
          result = await methodExecutor(method, { discovery, execute, playwrightRunner, attempt: attempts + 1 });
          attempts += 1;
        } while (result.status !== "passed" && result.status !== "planned" && attempts <= method.retryLimit);
        result = { ...result, attempts };
        methodResults.push({ method: method.id, ...result });
        if (!["passed", "planned"].includes(result.status) && method.required) {
          const failed = { ...stage, status: result.status, methodResults, classification: result.classification };
          results.push(failed);
          await recordStage(caseDir, stage.id, result.status === "manual_required" ? "blocked" : result.status, { result: failed, reason: result.reason, classification: result.classification, resumable: result.status === "manual_required" }, sequence++);
          return { status: result.status === "manual_required" ? "blocked" : "failed", stoppedAt: stage.id, results, plan };
        }
      }
      const completed = { ...stage, status: "passed", methodResults };
      results.push(completed);
      await recordStage(caseDir, stage.id, "passed", { result: completed }, sequence++);
      continue;
    }
    if (stage.id === "commit" && typeof releaseGate === "function") {
      const gate = await releaseGate({ stage, caseDir });
      if (gate.status !== "passed") {
        const blocked = { ...stage, status: "blocked", reason: gate.reason, gate };
        results.push(blocked);
        await recordStage(caseDir, stage.id, "blocked", { result: blocked, reason: gate.reason, classification: "policy", resumable: true }, sequence++);
        return { status: "blocked", stoppedAt: stage.id, results, plan };
      }
    }
    let action = stage.action;
    if (action && ["git-tag", "github-release"].includes(action.kind) && action.versionSource === "project") {
      const refreshed = await discoverProject(discovery.projectRoot);
      action = { ...action, tag: tagFor(plan.definition, refreshed) };
    }
    if (action.kind === "github-pr-merge") {
      const refreshed = await discoverProject(discovery.projectRoot);
      action = { ...action, headBranch: refreshed.branch ?? action.headBranch, expectedHeadSha: refreshed.gitSha ?? action.expectedHeadSha };
    }
    if (action.kind === "git-tag" && releaseContext.mergeCommitSha) action = { ...action, targetSha: releaseContext.mergeCommitSha };
    const result = await runReleaseAction(action, { discovery, execute, releaseExecutor, releaseContext });
    results.push({ ...stage, action, status: result.status, result });
    if (result.status === "passed") {
      if (stage.id === "merge" && result.mergeCommitSha) releaseContext.mergeCommitSha = result.mergeCommitSha;
      await recordStage(caseDir, stage.id, "passed", { result }, sequence++);
    } else {
      await recordStage(caseDir, stage.id, result.status === "manual_required" ? "blocked" : result.status, { result, reason: result.reason, classification: result.classification, resumable: result.status === "manual_required" }, sequence++);
      return { status: result.status === "manual_required" ? "blocked" : "failed", stoppedAt: stage.id, results, plan };
    }
  }
  return { status: "passed", results, plan };
}
