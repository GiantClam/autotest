import { spawn } from "node:child_process";
import { runPlaywrightMethod } from "./browser.mjs";

function redact(value) {
  return String(value)
    .replace(/apikey_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(/(token|secret|password|key)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function packageInvocation(method, discovery) {
  const manager = discovery.packageManager ?? "npm";
  if (!discovery.scripts || typeof discovery.scripts[method.script] !== "string") {
    return { error: `project_method_not_found:${method.script}` };
  }
  if (manager === "pnpm") return { command: "pnpm", args: ["run", method.script] };
  if (manager === "yarn") return { command: "yarn", args: [method.script] };
  if (manager === "bun") return { command: "bun", args: ["run", method.script] };
  return { command: "npm", args: ["run", method.script] };
}

export function resolveMethodInvocation(method, discovery) {
  if (method.kind === "package-script") return packageInvocation(method, discovery);
  if (method.kind === "command") return { command: method.command, args: method.args ?? [] };
  if (method.kind === "workflow") return { command: "gh", args: ["workflow", "run", method.workflow] };
  return null;
}

function runProcess({ command, args, cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const append = (target, chunk) => {
      const next = `${target}${chunk}`;
      return next.length > 16_000 ? next.slice(-16_000) : next;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ status: "failed", exitCode: null, signal: "SIGTERM", stdout: redact(stdout), stderr: redact(`${stderr}\nmethod_timeout`) });
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "failed", classification: "environment", exitCode: null, error: redact(error.message), stdout: redact(stdout), stderr: redact(stderr) });
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ status: exitCode === 0 ? "passed" : "failed", ...(exitCode === 0 ? {} : { classification: "test-script" }), exitCode, signal, stdout: redact(stdout), stderr: redact(stderr) });
    });
  });
}

export async function executeProjectMethod(method, { discovery, execute = false, playwrightRunner } = {}) {
  if (method.kind === "playwright") {
    if (!execute) return { status: "planned", plan: { assertions: method.assertions ?? [], evidence: method.evidence ?? [] } };
    return runPlaywrightMethod({ runner: playwrightRunner, assertions: method.assertions ?? [], evidence: method.evidence ?? [] });
  }
  if (method.kind === "manual") {
    return method.completed
      ? { status: "passed", evidence: method.evidence ?? null }
      : { status: "manual_required", reason: "implementation_or_project_method_requires_agent_or_operator" };
  }
  const invocation = resolveMethodInvocation(method, discovery);
  if (!invocation || invocation.error) return { status: "failed", reason: invocation?.error ?? "method_invocation_missing" };
  const plan = { command: invocation.command, args: invocation.args, cwd: discovery.projectRoot };
  if (!execute) return { status: "planned", plan };
  const result = await runProcess({
    ...invocation,
    cwd: discovery.projectRoot,
    env: { ...process.env, ...(method.env ?? {}) },
    timeoutMs: method.timeoutMs,
  });
  if (method.kind === "workflow" && method.waitForCompletion && result.status === "passed") {
    const runId = result.stdout.match(/\/runs\/(\d+)/u)?.[1];
    if (!runId) return { status: "blocked", classification: "dependency/provider", reason: "workflow_run_id_missing", plan };
    const deadline = Date.now() + method.workflowTimeoutMs;
    while (Date.now() <= deadline) {
      const observed = await runProcess({ command: "gh", args: ["run", "view", runId, "--json", "status,conclusion,headSha"], cwd: discovery.projectRoot, env: process.env, timeoutMs: Math.min(method.timeoutMs, 120_000) });
      if (observed.status !== "passed") return { ...observed, classification: "dependency/provider", plan };
      try {
        const payload = JSON.parse(observed.stdout);
        if (payload.status === "completed") return payload.conclusion === "success" ? { ...result, workflowRun: payload, plan } : { status: "failed", classification: "dependency/provider", reason: "workflow_failed", workflowRun: payload, plan };
      } catch {
        return { status: "failed", classification: "dependency/provider", reason: "workflow_payload_invalid", plan };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return { status: "blocked", classification: "dependency/provider", reason: "workflow_timeout", plan };
  }
  return { ...result, plan };
}
