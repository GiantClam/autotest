import { normalizeProjectDefinition } from "./contracts.mjs";
import { discoverProject } from "./discovery.mjs";
import { executeProjectMethod } from "./method-runner.mjs";
import { executeReleaseAction } from "./release.mjs";

const PRE_RELEASE_PROJECT_STAGES = ["implementation", "verify", "build", "package", "smoke"];
const POST_RELEASE_PROJECT_STAGES = [];
const PROJECT_STAGES = [...PRE_RELEASE_PROJECT_STAGES, ...POST_RELEASE_PROJECT_STAGES];
const RELEASE_STAGES = ["commit", "push", "merge", "tag", "publish"];

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
  if (definition.release.merge.enabled) actions.push({ stage: "merge", kind: "github-pr-merge", repository: definition.project.repository, baseBranch: definition.project.defaultBranch, headBranch: discovery.branch, strategy: definition.release.merge.strategy, deleteBranch: definition.release.merge.deleteBranch, createIfMissing: definition.release.merge.createIfMissing });
  if (definition.release.tag.enabled) actions.push({ stage: "tag", kind: "git-tag", repository: definition.project.repository, baseBranch: definition.project.defaultBranch, tag: tagFor(definition, discovery), versionSource: definition.release.tag.versionSource });
  if (definition.release.publish.enabled) actions.push({ stage: "publish", kind: "github-release", repository: definition.project.repository, tag: tagFor(definition, discovery), versionSource: definition.release.tag.versionSource, generateNotes: definition.release.publish.generateNotes, timeoutMs: definition.release.publish.timeoutMs, assets: definition.release.publish.assets });
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

async function runReleaseAction(action, { discovery, execute, releaseExecutor }) {
  if (["github-pr-merge", "github-release"].includes(action.kind) && !action.repository) return { status: "manual_required", reason: "project_repository_required" };
  if (!execute) return { status: "planned", action };
  return releaseExecutor(action, { discovery, execute });
}

export async function executePipeline(rawDefinition, discovery, { execute = false, methodExecutor = executeProjectMethod, releaseExecutor = executeReleaseAction } = {}) {
  const plan = createPipelinePlan(rawDefinition, discovery);
  if (!execute) {
    return { status: "planned", results: plan.stages, plan };
  }
  const results = [];
  for (const stage of plan.stages) {
    if (stage.id === "discover") {
      results.push(stage);
      continue;
    }
    if (stage.status === "skipped") {
      results.push(stage);
      continue;
    }
    if (stage.status === "manual_required") {
      results.push({ ...stage, status: "manual_required", reason: stage.id === "tag" ? "project_version_or_explicit_tag_required" : "project_method_required" });
      return { status: "blocked", stoppedAt: stage.id, results, plan };
    }
    if (PROJECT_STAGES.includes(stage.id)) {
      const methods = plan.definition.methods[stage.id];
      const methodResults = [];
      for (const method of methods) {
        const result = await methodExecutor(method, { discovery, execute });
        methodResults.push({ method: method.id, ...result });
        if (!['passed', 'planned'].includes(result.status) && method.required) {
          results.push({ ...stage, status: result.status, methodResults });
          return { status: result.status === "manual_required" ? "blocked" : "failed", stoppedAt: stage.id, results, plan };
        }
      }
      results.push({ ...stage, status: execute ? "passed" : "planned", methodResults });
      continue;
    }
    let action = stage.action;
    if (action && ["git-tag", "github-release"].includes(action.kind) && action.versionSource === "project") {
      const refreshed = await discoverProject(discovery.projectRoot);
      action = { ...action, tag: tagFor(plan.definition, refreshed) };
    }
    const result = await runReleaseAction(action, { discovery, execute, releaseExecutor });
    results.push({ ...stage, action, status: result.status, result });
    if (!['passed', 'planned'].includes(result.status)) return { status: result.status === "manual_required" ? "blocked" : "failed", stoppedAt: stage.id, results, plan };
  }
  return { status: execute ? "passed" : "planned", results, plan };
}
