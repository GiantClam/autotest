import { access, readFile, readdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function gitValue(root, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, timeout: 10_000, maxBuffer: 64 * 1024 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function packageManagerFrom(packageJson, root) {
  const declared = typeof packageJson?.packageManager === "string" ? packageJson.packageManager.split("@")[0] : null;
  if (declared) return declared;
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

function classifyScript(name) {
  const lower = name.toLowerCase();
  const stages = [];
  if (/(^|:)(test|check|lint|typecheck|verify|regression|smoke)(:|$)/.test(lower) || /test|check|lint|verify|regression|smoke/.test(lower)) stages.push("verify");
  if (/(^|:)(build|compile|bundle)(:|$)/.test(lower) || /build|compile|bundle/.test(lower)) stages.push("build");
  if (/(^|:)(package|pack|dist|release)(:|$)/.test(lower) || /package|pack|dist|release/.test(lower)) stages.push("package");
  if (/(^|:)(deploy|publish)(:|$)/.test(lower) || /deploy|publish/.test(lower)) stages.push("smoke");
  return [...new Set(stages)];
}

async function workflowCandidates(root) {
  const directory = join(root, ".github", "workflows");
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ya?ml)$/i.test(entry.name)) continue;
    const content = await readFile(join(directory, entry.name), "utf8");
    files.push({
      name: entry.name,
      workflowDispatch: /(^|\n)\s+workflow_dispatch\s*:/m.test(content),
      push: /(^|\n)\s+push\s*:/m.test(content),
      pullRequest: /(^|\n)\s+pull_request\s*:/m.test(content),
      deployLike: /deploy|release|publish|package/i.test(`${entry.name}\n${content}`),
    });
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

export async function discoverProject(projectRoot) {
  const root = resolve(projectRoot);
  const packageJson = await readJson(join(root, "package.json"));
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? { ...packageJson.scripts } : {};
  const scriptCandidates = Object.fromEntries(["verify", "build", "package", "smoke"].map((stage) => [stage, Object.keys(scripts).filter((name) => classifyScript(name).includes(stage))]));
  const files = {
    packageJson: packageJson !== null,
    cargoToml: await exists(join(root, "Cargo.toml")),
    pyprojectToml: await exists(join(root, "pyproject.toml")),
    makefile: await exists(join(root, "Makefile")),
  };
  const version = typeof packageJson?.version === "string" ? packageJson.version : null;
  return Object.freeze({
    projectRoot: root,
    projectId: packageJson?.name ?? root.split("/").pop(),
    repository: await gitValue(root, ["config", "--get", "remote.origin.url"]),
    branch: await gitValue(root, ["branch", "--show-current"]),
    packageManager: packageManagerFrom(packageJson, root),
    packageManagerVersion: typeof packageJson?.packageManager === "string" ? packageJson.packageManager : null,
    version,
    scripts,
    scriptCandidates,
    workflows: await workflowCandidates(root),
    files,
  });
}
