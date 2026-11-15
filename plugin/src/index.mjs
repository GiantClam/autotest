import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const name = "autotest-project-lifecycle";
export const inject = ["tools"];

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["status"],
  properties: {
    status: { type: "string" },
    projectRoot: { type: "string" },
    configPath: { type: "string" },
    stoppedAt: { type: "string" },
    reason: { type: "string" },
    result: { type: "object", additionalProperties: true },
  },
};

function objectParameters(properties, required = []) {
  return { type: "object", additionalProperties: false, properties, ...(required.length > 0 ? { required } : {}) };
}
function jsonOutput() {
  return {
    schema: RESULT_SCHEMA,
    render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
  };
}

function requiredPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return resolve(value);
}

async function ensureDirectory(root) {
  try {
    const stat = await access(root, constants.F_OK);
    return stat;
  } catch {
    throw new Error(`project_root does not exist: ${root}`);
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function redact(value) {
  return String(value)
    .replace(/apikey_[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]")
    .replace(/(token|secret|password|key)=([^\s&]+)/giu, "$1=[REDACTED]");
}

async function runCli(config, projectRoot, command, args, signal) {
  const autotestRoot = resolve(config.autotestRoot ?? PACKAGE_ROOT);
  const cliPath = join(autotestRoot, "src", "cli.mjs");
  await ensureDirectory(projectRoot);
  const fullArgs = [cliPath, command, "--project-root", projectRoot, ...args];
  try {
    const result = await execFileAsync(process.execPath, fullArgs, {
      cwd: autotestRoot,
      env: { ...process.env },
      timeout: config.timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      signal,
      windowsHide: true,
    });
    return parseJson(result.stdout) ?? {
      status: "failed",
      reason: "autotest_output_invalid_json",
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
    };
  } catch (error) {
    const stdout = redact(error?.stdout ?? "");
    const parsed = parseJson(stdout);
    if (parsed) return parsed;
    return {
      status: "failed",
      reason: "autotest_cli_failed",
      error: redact(error instanceof Error ? error.message : String(error)),
      stdout,
      stderr: redact(error?.stderr ?? ""),
    };
  }
}

function register(ctx, config, name, description, parameters, handler) {
  ctx.tools.register({
    name,
    description,
    parameters,
    output: jsonOutput(),
    async execute(args, exec) {
      return handler(args, exec, config);
    },
  });
}

export function apply(ctx, config = {}) {
  register(ctx, config, "autotest_project_discover", "Discover a project root's package scripts, workflows, version, repository, and branch without writing files or running project commands.", objectParameters({
    project_root: { type: "string", description: "Absolute path to the target Git project." },
  }, ["project_root"]), async (args) => {
    const projectRoot = requiredPath(args.project_root, "project_root");
    const result = await runCli(config, projectRoot, "discover", []);
    return result.status === undefined ? { status: "passed", ...result } : result;
  });

  register(ctx, config, "autotest_project_init", "Create or refresh .autotest/project.json from the target project's discovered standard entry points. Set write=true to modify the target project.", objectParameters({
    project_root: { type: "string", description: "Absolute path to the target Git project." },
    write: { type: "boolean", description: "Write .autotest/project.json. Defaults to false." },
    force: { type: "boolean", description: "Replace an existing generated definition when write is true." },
  }, ["project_root"]), async (args) => {
    const projectRoot = requiredPath(args.project_root, "project_root");
    await ensureDirectory(projectRoot);
    if (args.write !== true) {
      return { status: "write_required", projectRoot, reason: "set_write_true_to_create_or_refresh_autotest_definition" };
    }
    return runCli(config, projectRoot, "init", [...(args.force === true ? ["--force"] : [])]);
  });

  register(ctx, config, "autotest_desktop_goal_register", "Register a bounded desktop goal for a project case. This tool never calls JEV; the Agent may invoke JEV separately within the returned app, window, action, timeout, and evidence limits.", objectParameters({
    project_root: { type: "string", description: "Absolute path to the target Git project." },
    case_id: { type: "string", description: "Safe case identifier used for the persisted desktop goal record." },
    goal_id: { type: "string", description: "Stable desktop goal identifier." },
    purpose: { type: "string", description: "One concrete user-visible desktop objective." },
    allowed_apps: { type: "array", items: { type: "string" }, description: "Application identifiers the Agent Desktop operation may use." },
    allowed_windows: { type: "array", items: { type: "string" }, description: "Window titles or patterns the operation may use." },
    required_evidence: { type: "array", items: { type: "string" }, description: "Evidence names required when the Agent reports completion." },
    max_actions: { type: "integer", description: "Maximum desktop actions, from 1 to 1000. Defaults to 20." },
    timeout_ms: { type: "integer", description: "Maximum desktop operation time, from 1 to 86400000 ms. Defaults to 120000." },
    write: { type: "boolean", description: "Persist the registration under .autotest/cases/<case_id>. Defaults to false." },
  }, ["project_root", "case_id", "goal_id", "purpose"]), async (args) => {
    const projectRoot = requiredPath(args.project_root, "project_root");
    const commandArgs = ["--case-id", args.case_id, "--goal-id", args.goal_id, "--purpose", args.purpose];
    for (const app of args.allowed_apps ?? []) commandArgs.push("--allowed-app", app);
    for (const window of args.allowed_windows ?? []) commandArgs.push("--allowed-window", window);
    for (const evidence of args.required_evidence ?? []) commandArgs.push("--required-evidence", evidence);
    if (args.max_actions !== undefined) commandArgs.push("--max-actions", String(args.max_actions));
    if (args.timeout_ms !== undefined) commandArgs.push("--timeout-ms", String(args.timeout_ms));
    if (args.write === true) commandArgs.push("--write");
    return runCli(config, projectRoot, "desktop-goal", commandArgs);
  });

  register(ctx, config, "autotest_project_plan", "Plan the complete discover, implement, verify, build, package, smoke, commit, push, merge, tag, and publish lifecycle for a target project without executing it.", objectParameters({
    project_root: { type: "string", description: "Absolute path to the target Git project." },
    config_path: { type: "string", description: "Optional project definition path; defaults to .autotest/project.json." },
  }, ["project_root"]), async (args) => {
    const projectRoot = requiredPath(args.project_root, "project_root");
    const configArgs = args.config_path === undefined ? [] : ["--config", requiredPath(args.config_path, "config_path")];
    return runCli(config, projectRoot, "plan", configArgs);
  });

  register(ctx, config, "autotest_project_run", "Execute the target project's own methods and, when execute=true, the configured Git and GitHub release actions. Use plan first; execution can modify, push, merge, tag, and publish.", objectParameters({
    project_root: { type: "string", description: "Absolute path to the target Git project." },
    config_path: { type: "string", description: "Optional project definition path; defaults to .autotest/project.json." },
    execute: { type: "boolean", description: "Run project methods and release actions. Defaults to false (plan only)." },
    case_dir: { type: "string", description: "Optional Delivery Case directory for durable stage events and evidence." },
    resume: { type: "boolean", description: "Resume from passed case stages without repeating their side effects." },
  }, ["project_root"]), async (args, exec) => {
    const projectRoot = requiredPath(args.project_root, "project_root");
    const configArgs = args.config_path === undefined ? [] : ["--config", requiredPath(args.config_path, "config_path")];
    return runCli(config, projectRoot, args.resume === true ? "resume" : "run", [...configArgs, ...(args.case_dir === undefined ? [] : ["--case", requiredPath(args.case_dir, "case_dir")]), ...(args.execute === true || args.resume === true ? ["--execute"] : [])], exec.signal);
  });
}
