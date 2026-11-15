import { readFile } from "node:fs/promises";

export async function evaluateReleaseGate({ tasksPath, caseVerification = null } = {}) {
  if (!tasksPath) return { status: "blocked", reason: "openspec_tasks_path_required" };
  let content;
  try {
    content = await readFile(tasksPath, "utf8");
  } catch {
    return { status: "blocked", reason: "openspec_tasks_missing" };
  }
  const unchecked = [...content.matchAll(/^- \[ \] (.+)$/gmu)].map((match) => match[1]);
  const evidence = caseVerification && caseVerification.status !== "passed" ? { status: "blocked", reason: "release_evidence_gate_failed", issues: caseVerification.issues ?? [] } : null;
  if (unchecked.length > 0) return { status: "blocked", reason: "openspec_tasks_incomplete", unchecked, evidence };
  if (evidence) return evidence;
  return { status: "passed", tasksPath };
}
