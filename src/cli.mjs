import { readFile, writeFile } from "node:fs/promises";
import { discoverProject } from "./discovery.mjs";
import { initializeProject, projectConfigPath } from "./project-init.mjs";
import { registerDesktopGoal } from "./desktop-goal.mjs";
import { executePipeline } from "./pipeline.mjs";
import { doctorProject } from "./doctor.mjs";
import { createDeliveryCase } from "./delivery-case.mjs";
import { verifyDeliveryCase } from "./verify.mjs";
import { evaluateReleaseGate } from "./release-gate.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  console.log(`Usage:
  node src/cli.mjs check
  node src/cli.mjs discover <project-root> [--output <file>]
  node src/cli.mjs doctor --project-root <root> [--output <file>]
  node src/cli.mjs init --project-root <root> [--force] [--output <file>]
  node src/cli.mjs case-init --project-root <root> --work-item-id <id> --project <id> --repository <repo> --target-sha <sha> --branch <branch>
  node src/cli.mjs desktop-goal --project-root <root> --case-id <id> --goal-id <id> --purpose <text> [--write]
  node src/cli.mjs plan --project-root <root> [--config <file>]
  node src/cli.mjs run --project-root <root> [--config <file>] [--case <dir>] [--execute]
  node src/cli.mjs resume --project-root <root> --case <dir> [--config <file>]
  node src/cli.mjs verify --case <dir> [--project-root <root>] [--release <sha>]
  node src/cli.mjs release-gate [--tasks <tasks.md>] [--case <dir>]
`);
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1] !== undefined) values.push(args[index + 1]);
  }
  return values;
}

async function loadDefinition(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "check") {
    console.log(JSON.stringify({ status: "passed", stages: ["implementation", "verify", "build", "package", "commit", "push", "merge", "tag", "publish", "smoke"] }, null, 2));
    return;
  }
  if (command === "discover") {
    const root = args.find((value) => !value.startsWith("-")) ?? process.cwd();
    const discovery = await discoverProject(root);
    const output = option(args, "--output");
    const payload = JSON.stringify(discovery, null, 2);
    if (output) await writeFile(output, `${payload}\n`, "utf8");
    else console.log(payload);
    return;
  }
  if (command === "doctor") {
    const root = option(args, "--project-root", process.cwd());
    const result = await doctorProject(root);
    const payload = JSON.stringify(result, null, 2);
    const output = option(args, "--output");
    if (output) await writeFile(output, `${payload}\n`, "utf8");
    else console.log(payload);
    if (result.status !== "passed") process.exitCode = 2;
    return;
  }
  if (command === "init") {
    const root = option(args, "--project-root", process.cwd());
    const result = await initializeProject(root, { force: args.includes("--force") });
    const payload = JSON.stringify(result, null, 2);
    const output = option(args, "--output");
    if (output) await writeFile(output, `${payload}\n`, "utf8");
    else console.log(payload);
    return;
  }
  if (command === "desktop-goal") {
    const root = option(args, "--project-root", process.cwd());
    const caseId = option(args, "--case-id");
    const goalId = option(args, "--goal-id");
    const purpose = option(args, "--purpose");
    if (!caseId || !goalId || !purpose) throw new Error("--case-id_--goal-id_--purpose_required");
    const result = await registerDesktopGoal(root, caseId, {
      goalId,
      purpose,
      allowedApps: options(args, "--allowed-app"),
      allowedWindows: options(args, "--allowed-window"),
      requiredEvidence: options(args, "--required-evidence"),
      maxActions: Number(option(args, "--max-actions", "20")),
      timeoutMs: Number(option(args, "--timeout-ms", "120000")),
    }, { write: args.includes("--write") });
    const payload = JSON.stringify(result, null, 2);
    const output = option(args, "--output");
    if (output) await writeFile(output, `${payload}\n`, "utf8");
    else console.log(payload);
    return;
  }
  if (command === "case-init") {
    const root = option(args, "--project-root", process.cwd());
    const required = ["--work-item-id", "--project", "--repository", "--target-sha", "--branch"];
    const values = Object.fromEntries(required.map((name) => [name, option(args, name)]));
    if (Object.values(values).some((value) => !value)) throw new Error(`${required.join("_")}_required`);
    const result = await createDeliveryCase({ projectRoot: root, workItemId: values["--work-item-id"], project: values["--project"], repository: values["--repository"], targetSha: values["--target-sha"], branch: values["--branch"], environment: { node: process.version }, policy: { requiredEvidence: options(args, "--required-evidence") } });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "verify") {
    const caseDir = option(args, "--case");
    if (!caseDir) throw new Error("--case_required");
    const result = await verifyDeliveryCase(caseDir, { projectRoot: option(args, "--project-root"), releaseSha: option(args, "--release") });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "passed") process.exitCode = 2;
    return;
  }
  if (command === "release-gate") {
    const tasksPath = option(args, "--tasks", join(fileURLToPath(new URL("..", import.meta.url)), "openspec/changes/generic-autotest-harness-plugin/tasks.md"));
    const caseDir = option(args, "--case");
    const caseVerification = caseDir ? await verifyDeliveryCase(caseDir, { projectRoot: option(args, "--project-root"), releaseSha: option(args, "--release") }) : null;
    const result = await evaluateReleaseGate({ tasksPath, caseVerification });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "passed") process.exitCode = 2;
    return;
  }
  if (["plan", "run", "resume"].includes(command)) {
    const root = option(args, "--project-root", process.cwd());
    const config = option(args, "--config", projectConfigPath(root));
    const discovery = await discoverProject(root);
    const definition = await loadDefinition(config);
    const caseDir = option(args, "--case");
    if (command === "resume" && !caseDir) throw new Error("resume_--case_required");
    const execute = command === "resume" || (command === "run" && args.includes("--execute"));
    const result = await executePipeline(definition, discovery, { execute, caseDir, resume: command === "resume" });
    const payload = JSON.stringify(result, null, 2);
    const output = option(args, "--output");
    if (output) await writeFile(output, `${payload}\n`, "utf8");
    else console.log(payload);
    if (["failed", "blocked"].includes(result.status)) process.exitCode = 2;
    return;
  }
  usage();
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
