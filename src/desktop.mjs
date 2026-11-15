const adapters = new Map();
const STOP_REASONS = new Set(["unknown-dialog", "mfa", "captcha", "payment", "deletion", "deploy", "secret", "timeout", "action-limit"]);

function fail(message) {
  throw new Error(`desktop_adapter_invalid:${message}`);
}

export function registerDesktopAdapter(name, adapter) {
  if (typeof name !== "string" || name.trim() === "" || !adapter || typeof adapter.run !== "function") fail("adapter_invalid");
  adapters.set(name, adapter);
  return () => adapters.delete(name);
}

export function listDesktopAdapters() {
  return [...adapters.keys()];
}

function boundedGoal(goal) {
  if (!goal || typeof goal !== "object") fail("goal_required");
  if (typeof goal.goalId !== "string" || goal.goalId.trim() === "") fail("goal_id_required");
  if (!Number.isInteger(goal.maxActions) || goal.maxActions < 1 || goal.maxActions > 1000) fail("max_actions_invalid");
  if (!Number.isInteger(goal.timeoutMs) || goal.timeoutMs < 1 || goal.timeoutMs > 86_400_000) fail("timeout_ms_invalid");
  if (!Array.isArray(goal.allowedApps) || !Array.isArray(goal.allowedWindows)) fail("allowlist_invalid");
  return goal;
}

export async function runDesktopGoal({ adapter, goal, signal } = {}) {
  const bounded = boundedGoal(goal);
  const implementation = typeof adapter === "string" ? adapters.get(adapter) : adapter;
  if (!implementation || typeof implementation.run !== "function") fail("adapter_not_registered");
  const mode = implementation.mode ?? "bounded-operation";
  if (!["inspect-only", "bounded-operation", "human-assisted"].includes(mode)) fail("adapter_mode_invalid");
  const result = await implementation.run(bounded, { signal, mode });
  if (!result || typeof result !== "object" || result.receipt === undefined) return { status: "failed", reason: "desktop_receipt_missing" };
  if (STOP_REASONS.has(result.stopReason)) return { status: "blocked", reason: result.stopReason, receipt: result.receipt };
  if (Number.isInteger(result.actions) && result.actions > bounded.maxActions) return { status: "blocked", reason: "desktop_action_limit_exceeded", receipt: result.receipt };
  return { status: "passed", goalId: bounded.goalId, receipt: result.receipt, actions: result.actions ?? null };
}

export const DESKTOP_STOP_REASONS = Object.freeze([...STOP_REASONS]);

export async function verifyDesktopReceipt(receipt, verifier) {
  if (!receipt || typeof verifier !== "function") return { status: "blocked", reason: "desktop_verifier_required" };
  const result = await verifier(receipt);
  return result === true || result?.status === "passed" ? { status: "passed", receipt } : { status: "blocked", reason: result?.reason ?? "desktop_independent_verification_failed", receipt };
}
