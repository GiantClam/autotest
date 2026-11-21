function parseJson(stdout, reason) {
  try {
    return JSON.parse(stdout ?? "");
  } catch {
    return { error: reason };
  }
}

export async function verifyPullRequestChecks({ repository, pullRequest, expectedHeadSha, requiredChecks = [], commandRunner } = {}) {
  if (!repository || !pullRequest || typeof commandRunner !== "function") return { status: "blocked", reason: "pull_request_check_context_required" };
  const result = await commandRunner("gh", ["pr", "view", String(pullRequest), "--repo", repository, "--json", "headRefOid,statusCheckRollup"]);
  if (result.status !== "passed") return result;
  const data = parseJson(result.stdout, "pull_request_check_payload_invalid");
  if (data.error) return { status: "failed", reason: data.error };
  if (expectedHeadSha && data.headRefOid !== expectedHeadSha) return { status: "blocked", reason: "pull_request_head_sha_mismatch", expectedHeadSha, actualHeadSha: data.headRefOid };
  const checks = Array.isArray(data.statusCheckRollup) ? data.statusCheckRollup : [];
  const failed = checks.filter((check) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT"].includes(String(check.conclusion ?? check.state).toUpperCase()));
  if (failed.length > 0) return { status: "failed", reason: "required_check_failed", checks: failed.map((check) => check.name ?? check.context ?? "unknown") };
  const names = new Set(checks.map((check) => check.name ?? check.context));
  const missing = requiredChecks.filter((name) => !names.has(name));
  if (missing.length > 0) return { status: "blocked", reason: "required_check_missing", checks: missing };
  const pending = checks.filter((check) => !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(String(check.conclusion || check.state || "").toUpperCase()));
  if (pending.length > 0) return { status: "blocked", reason: "pull_request_checks_pending", checks: pending.map((check) => check.name ?? check.context ?? "unknown") };
  return { status: "passed", headSha: data.headRefOid, checks };
}

export async function waitForWorkflowRun({ repository, runId, timeoutMs = 30 * 60 * 1000, pollMs = 1000, commandRunner } = {}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const result = await commandRunner("gh", ["run", "view", String(runId), "--repo", repository, "--json", "status,conclusion,headSha"]);
    if (result.status !== "passed") return result;
    const data = parseJson(result.stdout, "workflow_payload_invalid");
    if (data.error) return { status: "failed", reason: data.error };
    if (data.status === "completed") return data.conclusion === "success" ? { status: "passed", ...data } : { status: "failed", ...data };
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - started)))));
  }
  return { status: "blocked", reason: "workflow_timeout" };
}
