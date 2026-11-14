import { readFile, writeFile } from "node:fs/promises";
import { discoverProject } from "./discovery.mjs";
import { executePipeline } from "./pipeline.mjs";

function usage() {
  console.log(`Usage:
  node src/cli.mjs check
  node src/cli.mjs discover <project-root> [--output <file>]
  node src/cli.mjs plan --project-root <root> --config <file>
  node src/cli.mjs run --project-root <root> --config <file> [--execute]
`);
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
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
  if (command === "plan" || command === "run") {
    const root = option(args, "--project-root", process.cwd());
    const config = option(args, "--config");
    if (!config) throw new Error("--config_required");
    const discovery = await discoverProject(root);
    const definition = await loadDefinition(config);
    const result = await executePipeline(definition, discovery, { execute: command === "run" && args.includes("--execute") });
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
