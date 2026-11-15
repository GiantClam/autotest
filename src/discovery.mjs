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

function defaultBranchFrom(value) {
  if (!value) return null;
  const match = value.match(/refs\/remotes\/origin\/([^\s]+)/u);
  return match?.[1] ?? null;
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
    goMod: await exists(join(root, "go.mod")),
    gradle: await exists(join(root, "build.gradle")) || await exists(join(root, "build.gradle.kts")),
    maven: await exists(join(root, "pom.xml")),
  };
  const makefileText = files.makefile ? await readFile(join(root, "Makefile"), "utf8").catch(() => "") : "";
  const makeTargets = [...makefileText.matchAll(/^([A-Za-z0-9_.-]+):/gmu)].map((match) => match[1]);
  const ecosystems = [
    files.packageJson ? "node" : null,
    files.pyprojectToml ? "python" : null,
    files.cargoToml ? "rust" : null,
    files.goMod ? "go" : null,
    files.makefile ? "make" : null,
    files.gradle ? "jvm-gradle" : null,
    files.maven ? "jvm-maven" : null,
  ].filter(Boolean);
  const standardMethods = {};
  if (files.pyprojectToml) Object.assign(standardMethods, {
    verify: { id: "python-pytest", kind: "command", command: "python", args: ["-m", "pytest"] },
    build: { id: "python-build", kind: "command", command: "python", args: ["-m", "build"] },
    package: { id: "python-build-package", kind: "command", command: "python", args: ["-m", "build"] },
  });
  if (files.cargoToml) Object.assign(standardMethods, {
    verify: { id: "cargo-test", kind: "command", command: "cargo", args: ["test"] },
    build: { id: "cargo-build", kind: "command", command: "cargo", args: ["build"] },
    package: { id: "cargo-package", kind: "command", command: "cargo", args: ["package", "--allow-dirty"] },
  });
  if (files.goMod) Object.assign(standardMethods, {
    verify: { id: "go-test", kind: "command", command: "go", args: ["test", "./..."] },
    build: { id: "go-build", kind: "command", command: "go", args: ["build", "./..."] },
  });
  if (files.gradle) Object.assign(standardMethods, {
    verify: { id: "gradle-test", kind: "command", command: "./gradlew", args: ["test"] },
    build: { id: "gradle-build", kind: "command", command: "./gradlew", args: ["build"] },
    package: { id: "gradle-package", kind: "command", command: "./gradlew", args: ["jar"] },
  });
  if (files.maven) Object.assign(standardMethods, {
    verify: { id: "maven-test", kind: "command", command: "mvn", args: ["test"] },
    build: { id: "maven-build", kind: "command", command: "mvn", args: ["package", "-DskipTests"] },
    package: { id: "maven-package", kind: "command", command: "mvn", args: ["package"] },
  });
  if (files.makefile) {
    if (makeTargets.includes("test")) standardMethods.verify = { id: "make-test", kind: "command", command: "make", args: ["test"] };
    if (makeTargets.includes("build")) standardMethods.build = { id: "make-build", kind: "command", command: "make", args: ["build"] };
    if (makeTargets.includes("package")) standardMethods.package = { id: "make-package", kind: "command", command: "make", args: ["package"] };
  }
  const version = typeof packageJson?.version === "string" ? packageJson.version : null;
  const branch = await gitValue(root, ["branch", "--show-current"]);
  const gitSha = await gitValue(root, ["rev-parse", "HEAD"]);
  const defaultBranch = defaultBranchFrom(await gitValue(root, ["symbolic-ref", "refs/remotes/origin/HEAD"]));
  const worktreeStatus = await gitValue(root, ["status", "--porcelain"]);
  return Object.freeze({
    projectRoot: root,
    projectId: packageJson?.name ?? root.split("/").pop(),
    repository: await gitValue(root, ["config", "--get", "remote.origin.url"]),
    branch,
    gitSha,
    defaultBranch: defaultBranch ?? "main",
    worktreeClean: worktreeStatus === "",
    runtime: { node: process.version },
    lockfiles: ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "Cargo.lock", "poetry.lock", "go.sum"].filter((name) => existsSync(join(root, name))),
    packageManager: packageManagerFrom(packageJson, root),
    packageManagerVersion: typeof packageJson?.packageManager === "string" ? packageJson.packageManager : null,
    version,
    scripts,
    scriptCandidates,
    ecosystems,
    standardMethods,
    missingCapabilities: ["verify", "build", "package", "smoke"].filter((stage) => !scriptCandidates[stage]?.length && !standardMethods[stage]),
    workflows: await workflowCandidates(root),
    files,
  });
}
