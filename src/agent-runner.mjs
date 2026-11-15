import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

function fail(message) {
  throw new Error(`agent_runner_invalid:${message}`);
}

function inside(root, path) {
  const relativePath = relative(root, resolve(root, path));
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.split(sep).includes("..")) fail("path_outside_project");
  return relativePath || ".";
}

function allowed(path, allowlist) {
  return allowlist.some((prefix) => {
    const normalized = String(prefix).replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

export async function previewProjectChanges({ projectRoot, generatedFiles = {}, allowedPaths = [".autotest"] }) {
  const root = resolve(projectRoot);
  const changes = [];
  for (const [file, content] of Object.entries(generatedFiles)) {
    const relativePath = inside(root, file).split(sep).join("/");
    if (!allowed(relativePath, allowedPaths)) fail(`path_not_allowlisted:${relativePath}`);
    const target = resolve(root, relativePath);
    let prior = null;
    try {
      prior = await readFile(target, "utf8");
    } catch {
      prior = null;
    }
    if (prior !== content) changes.push({ path: relativePath, action: prior === null ? "create" : "update", bytes: Buffer.byteLength(String(content)) });
  }
  return { projectRoot: root, allowedPaths, changes, writeRequired: changes.length > 0 };
}

export async function writeProjectChanges({ projectRoot, generatedFiles = {}, allowedPaths = [".autotest"], allowProjectEdits = false }) {
  if (!allowProjectEdits) return { status: "write_required", preview: await previewProjectChanges({ projectRoot, generatedFiles, allowedPaths }) };
  const preview = await previewProjectChanges({ projectRoot, generatedFiles, allowedPaths });
  for (const [file, content] of Object.entries(generatedFiles)) {
    const relativePath = inside(resolve(projectRoot), file).split(sep).join("/");
    if (!allowed(relativePath, allowedPaths)) fail(`path_not_allowlisted:${relativePath}`);
    const target = resolve(projectRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, String(content), "utf8");
  }
  return { status: "written", ...preview, changedPaths: preview.changes.map((change) => change.path) };
}

export async function acceptProjectChanges(options) {
  const result = await writeProjectChanges(options);
  if (result.status !== "written") return result;
  const { discoverProject } = await import("./discovery.mjs");
  return { ...result, discovery: await discoverProject(options.projectRoot) };
}

export async function createProjectMethod({ projectRoot, stage, taskArtifact, allowedPaths = [".autotest"], allowProjectEdits = false }) {
  if (typeof stage !== "string" || stage.trim() === "") fail("stage_required");
  const file = `.autotest/tasks/${stage.trim()}.json`;
  const artifact = taskArtifact && typeof taskArtifact === "object" ? taskArtifact : {};
  const content = `${JSON.stringify({ schemaVersion: 1, stage: stage.trim(), ecosystem: artifact.ecosystem ?? "unknown", taskArtifact: artifact, allowedPaths, successCondition: artifact.successCondition ?? `stage ${stage.trim()} exits successfully`, requiredEvidence: artifact.requiredEvidence ?? ["method-result", "diff"], writeAuthorization: allowProjectEdits }, null, 2)}\n`;
  return writeProjectChanges({ projectRoot, generatedFiles: { [file]: content }, allowedPaths, allowProjectEdits });
}

export async function projectPathExists(projectRoot, path) {
  try {
    await access(resolve(projectRoot, inside(resolve(projectRoot), path)), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
