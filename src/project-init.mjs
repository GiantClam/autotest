import { mkdir, access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";

const CONFIG_DIRECTORY = ".autotest";
const CONFIG_FILE = "project.json";

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function repositoryName(remote) {
  if (typeof remote !== "string" || remote.trim() === "") return null;
  const normalized = remote.trim().replace(/\.git$/u, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/u);
  return match ? `${match[1]}/${match[2]}` : normalized;
}

function firstCandidate(discovery, stage, preferred = []) {
  const candidates = discovery.scriptCandidates?.[stage] ?? [];
  return preferred.find((name) => candidates.includes(name)) ?? candidates[0] ?? null;
}

function scriptMethod(stage, script, standardMethod = null) {
  return script
    ? { id: `${stage}-${script}`, kind: "package-script", script }
    : standardMethod
      ? { ...standardMethod }
    : { id: `${stage}-agent-created`, kind: "manual", completed: false };
}

function workflowMethod(stage, workflow) {
  return workflow
    ? { id: `${stage}-${workflow.name}`, kind: "workflow", workflow: workflow.name }
    : null;
}

function chooseSmoke(discovery) {
  const workflow = discovery.workflows?.find((candidate) => candidate.workflowDispatch && candidate.deployLike);
  if (workflow) return workflowMethod("smoke", workflow);
  return scriptMethod("smoke", firstCandidate(discovery, "smoke", ["smoke", "deploy", "publish"]));
}

function generatedDefinition(discovery) {
  return {
    schemaVersion: 1,
    project: {
      id: discovery.projectId,
      root: ".",
      repository: repositoryName(discovery.repository),
      defaultBranch: "main",
    },
    required: {
      implementation: true,
      verify: true,
      build: true,
      package: true,
      smoke: true,
    },
    methods: {
      implementation: { id: "agent-implementation", kind: "manual", completed: false },
      verify: scriptMethod("verify", firstCandidate(discovery, "verify", ["test", "check", "lint", "typecheck", "verify"]), discovery.standardMethods?.verify),
      build: scriptMethod("build", firstCandidate(discovery, "build", ["build", "compile", "bundle"]), discovery.standardMethods?.build),
      package: scriptMethod("package", firstCandidate(discovery, "package", ["package", "pack", "dist", "release"]), discovery.standardMethods?.package),
      smoke: chooseSmoke(discovery),
    },
    release: {
      commit: {
        enabled: true,
        message: "chore: prepare project release",
        paths: [CONFIG_DIRECTORY],
      },
      push: { enabled: true, remote: "origin" },
      merge: { enabled: true, strategy: "squash", deleteBranch: true, createIfMissing: true },
      tag: { enabled: true, prefix: "v", versionSource: "project" },
      publish: { enabled: true, provider: "github", generateNotes: true, assets: [] },
    },
  };
}

export function projectConfigPath(projectRoot) {
  return join(resolve(projectRoot), CONFIG_DIRECTORY, CONFIG_FILE);
}

export async function initializeProject(projectRoot, { force = false } = {}) {
  const root = resolve(projectRoot);
  const configPath = projectConfigPath(root);
  if (!force && await exists(configPath)) {
    return {
      status: "exists",
      projectRoot: root,
      configPath,
      definition: JSON.parse(await readFile(configPath, "utf8")),
    };
  }
  const { discoverProject } = await import("./discovery.mjs");
  const discovery = await discoverProject(root);
  const definition = generatedDefinition(discovery);
  await mkdir(join(root, CONFIG_DIRECTORY), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  return { status: "created", projectRoot: root, configPath, definition, discovery };
}
