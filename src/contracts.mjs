import { resolve } from "node:path";

export const PIPELINE_STAGES = Object.freeze([
  "discover",
  "implementation",
  "verify",
  "build",
  "package",
  "commit",
  "push",
  "merge",
  "tag",
  "publish",
  "smoke",
]);

export const PROJECT_METHOD_STAGES = Object.freeze([
  "implementation",
  "verify",
  "build",
  "package",
  "smoke",
]);

const METHOD_KINDS = new Set(["package-script", "command", "workflow", "manual", "playwright"]);
const DEFAULT_REQUIRED = new Set(["implementation", "verify", "build", "package", "smoke"]);
export const LIFECYCLE_STAGES = Object.freeze([
  "intake", "triage", "discover", "clarification", "requirement-review", "research", "spec", "planning",
  "implementation", "review", "verify", "security", "release-candidate", "acceptance", "release-approval",
  "commit", "push", "merge", "tag", "publish", "deploy", "smoke", "observe", "iteration", "closed",
]);
export const RESULT_STATUSES = Object.freeze(["passed", "failed", "blocked", "needs_human", "planned", "skipped"]);
export const FAILURE_CLASSIFICATIONS = Object.freeze([
  "product",
  "environment",
  "dependency/provider",
  "test-script",
  "policy",
  "human-required",
]);

function fail(message) {
  throw new Error(`project_contract_invalid:${message}`);
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label}_required`);
  return value.trim();
}

function normalizeMethod(stage, raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${stage}_method_${index}_invalid`);
  const kind = nonEmpty(raw.kind, `${stage}_method_${index}_kind`);
  if (!METHOD_KINDS.has(kind)) fail(`${stage}_method_${index}_kind_unsupported`);
  const method = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `${stage}-${index + 1}`,
    kind,
    required: raw.required !== false,
    timeoutMs: Number.isInteger(raw.timeoutMs) && raw.timeoutMs > 0 ? raw.timeoutMs : 30 * 60 * 1000,
    retryLimit: Number.isInteger(raw.retryLimit) && raw.retryLimit >= 0 && raw.retryLimit <= 5 ? raw.retryLimit : 0,
  };
  if (kind === "package-script") method.script = nonEmpty(raw.script, `${stage}_method_${index}_script`);
  if (kind === "workflow") method.workflow = nonEmpty(raw.workflow, `${stage}_method_${index}_workflow`);
  if (kind === "workflow") {
    method.waitForCompletion = raw.waitForCompletion === true;
    method.workflowTimeoutMs = Number.isInteger(raw.workflowTimeoutMs) && raw.workflowTimeoutMs > 0 ? raw.workflowTimeoutMs : method.timeoutMs;
  }
  if (kind === "playwright") {
    method.script = raw.script === undefined ? null : nonEmpty(raw.script, `${stage}_method_${index}_script`);
    method.assertions = Array.isArray(raw.assertions) ? raw.assertions.map((value) => nonEmpty(String(value), `${stage}_method_${index}_assertion`)) : [];
    method.evidence = Array.isArray(raw.evidence) ? raw.evidence.map((value) => nonEmpty(String(value), `${stage}_method_${index}_evidence`)) : [];
  }
  if (kind === "command") {
    method.command = nonEmpty(raw.command, `${stage}_method_${index}_command`);
    method.args = Array.isArray(raw.args) ? raw.args.map((value) => String(value)) : [];
  }
  if (kind === "manual") {
    method.completed = raw.completed === true;
    if (raw.evidence !== undefined) method.evidence = nonEmpty(raw.evidence, `${stage}_method_${index}_evidence`);
  }
  if (raw.env !== undefined) {
    if (!raw.env || typeof raw.env !== "object" || Array.isArray(raw.env)) fail(`${stage}_method_${index}_env_invalid`);
    method.env = Object.fromEntries(Object.entries(raw.env).map(([key, value]) => [String(key), String(value)]));
  }
  if (raw.envRefs !== undefined) {
    if (!Array.isArray(raw.envRefs)) fail(`${stage}_method_${index}_env_refs_invalid`);
    method.envRefs = raw.envRefs.map((value) => nonEmpty(String(value), `${stage}_method_${index}_env_ref`));
  }
  if (raw.allowedPaths !== undefined) {
    if (!Array.isArray(raw.allowedPaths)) fail(`${stage}_method_${index}_allowed_paths_invalid`);
    method.allowedPaths = raw.allowedPaths.map((value) => nonEmpty(String(value), `${stage}_method_${index}_allowed_path`));
  }
  if (raw.allowedApps !== undefined) {
    if (!Array.isArray(raw.allowedApps)) fail(`${stage}_method_${index}_allowed_apps_invalid`);
    method.allowedApps = raw.allowedApps.map((value) => nonEmpty(String(value), `${stage}_method_${index}_allowed_app`));
  }
  if (raw.evidence !== undefined && kind !== "manual") {
    if (!Array.isArray(raw.evidence)) fail(`${stage}_method_${index}_evidence_invalid`);
    method.evidence = raw.evidence.map((value) => nonEmpty(String(value), `${stage}_method_${index}_evidence`));
  }
  if (raw.successCondition !== undefined) method.successCondition = nonEmpty(raw.successCondition, `${stage}_method_${index}_success_condition`);
  if (raw.riskLevel !== undefined) method.riskLevel = nonEmpty(raw.riskLevel, `${stage}_method_${index}_risk_level`);
  return Object.freeze(method);
}

function normalizeMethods(rawMethods = {}) {
  if (!rawMethods || typeof rawMethods !== "object" || Array.isArray(rawMethods)) fail("methods_invalid");
  return Object.fromEntries(PROJECT_METHOD_STAGES.map((stage) => {
    const raw = rawMethods[stage];
    const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    return [stage, Object.freeze(entries.map((value, index) => normalizeMethod(stage, value, index)))];
  }));
}

function normalizeRelease(rawRelease = {}) {
  if (!rawRelease || typeof rawRelease !== "object" || Array.isArray(rawRelease)) fail("release_invalid");
  const merge = rawRelease.merge ?? {};
  const commit = rawRelease.commit ?? {};
  const push = rawRelease.push ?? {};
  const tag = rawRelease.tag ?? {};
  const publish = rawRelease.publish ?? {};
  if ([commit, push, merge, tag, publish].some((value) => !value || typeof value !== "object" || Array.isArray(value))) fail("release_step_invalid");
  const versionSource = tag.versionSource ?? "project";
  if (!new Set(["project", "explicit"]).has(versionSource)) fail("release_tag_version_source_unsupported");
  return Object.freeze({
    commit: Object.freeze({
      enabled: commit.enabled !== false,
      message: commit.message ?? "chore: autotest pipeline commit",
      paths: Array.isArray(commit.paths) ? commit.paths.map((value) => nonEmpty(String(value), "release_commit_path")) : [],
    }),
    push: Object.freeze({
      enabled: push.enabled !== false,
      remote: push.remote ?? "origin",
    }),
    merge: Object.freeze({
      enabled: merge.enabled !== false,
      strategy: merge.strategy ?? "squash",
      deleteBranch: merge.deleteBranch !== false,
      createIfMissing: merge.createIfMissing !== false,
      requiredChecks: Array.isArray(merge.requiredChecks) ? merge.requiredChecks.map((value) => nonEmpty(String(value), "release_merge_required_check")) : [],
    }),
    tag: Object.freeze({
      enabled: tag.enabled !== false,
      prefix: tag.prefix ?? "v",
      versionSource,
      version: tag.version,
    }),
    publish: Object.freeze({
      enabled: publish.enabled !== false,
      provider: publish.provider ?? "github",
      generateNotes: publish.generateNotes !== false,
      timeoutMs: Number.isInteger(publish.timeoutMs) && publish.timeoutMs > 0 ? publish.timeoutMs : 30 * 60 * 1000,
      assets: Array.isArray(publish.assets) ? publish.assets.map((value) => nonEmpty(String(value), "release_publish_asset")) : [],
      requiredArtifacts: Array.isArray(publish.requiredArtifacts) ? publish.requiredArtifacts.map((value) => nonEmpty(String(value), "release_publish_required_artifact")) : [],
      artifactChecksums: publish.artifactChecksums && typeof publish.artifactChecksums === "object" && !Array.isArray(publish.artifactChecksums) ? Object.fromEntries(Object.entries(publish.artifactChecksums).map(([path, checksum]) => [nonEmpty(path, "release_publish_artifact_path"), nonEmpty(String(checksum), "release_publish_artifact_checksum")])) : {},
      signaturePaths: Array.isArray(publish.signaturePaths) ? publish.signaturePaths.map((value) => nonEmpty(String(value), "release_publish_signature_path")) : [],
      notarizationEvidence: Array.isArray(publish.notarizationEvidence) ? publish.notarizationEvidence.map((value) => nonEmpty(String(value), "release_publish_notarization_evidence")) : [],
      metadataPath: publish.metadataPath === undefined ? null : nonEmpty(publish.metadataPath, "release_publish_metadata_path"),
    }),
  });
}

export function normalizeProjectDefinition(raw, { projectRoot = process.cwd() } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("root_invalid");
  if (![1, 2].includes(raw.schemaVersion)) fail("schema_version_unsupported");
  const project = raw.project;
  if (!project || typeof project !== "object" || Array.isArray(project)) fail("project_invalid");
  const id = nonEmpty(project.id, "project_id");
  const root = resolve(projectRoot, project.root ?? ".");
  const repository = project.repository === undefined || project.repository === null ? null : nonEmpty(project.repository, "project_repository");
  const defaultBranch = nonEmpty(project.defaultBranch ?? "main", "project_default_branch");
  const methods = normalizeMethods(raw.methods);
  const required = Object.fromEntries(PROJECT_METHOD_STAGES.map((stage) => [stage, raw.required?.[stage] ?? DEFAULT_REQUIRED.has(stage)]));
  if (raw.required !== undefined && (!raw.required || typeof raw.required !== "object" || Array.isArray(raw.required))) fail("required_invalid");
  return Object.freeze({
    schemaVersion: raw.schemaVersion,
    project: Object.freeze({ id, root, repository, defaultBranch }),
    required: Object.freeze(required),
    methods: Object.freeze(methods),
    release: normalizeRelease(raw.release),
    lifecycle: Object.freeze(raw.lifecycle && typeof raw.lifecycle === "object" && !Array.isArray(raw.lifecycle) ? { ...raw.lifecycle } : {}),
    environment: Object.freeze(raw.environment && typeof raw.environment === "object" && !Array.isArray(raw.environment) ? { ...raw.environment } : {}),
  });
}

export function assertStage(stage) {
  if (!PIPELINE_STAGES.includes(stage)) fail(`stage_unsupported:${stage}`);
  return stage;
}
