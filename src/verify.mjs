import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverProject } from "./discovery.mjs";
import { loadEvents } from "./artifacts.mjs";

async function verifyManifest(caseDir, manifest) {
  const issues = [];
  for (const entry of manifest?.entries ?? []) {
    const path = resolve(caseDir, entry.path);
    if (!path.startsWith(`${resolve(caseDir)}/`)) {
      issues.push(`evidence_path_outside_case:${entry.path}`);
      continue;
    }
    try {
      const [info, bytes] = await Promise.all([stat(path), readFile(path)]);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (info.size !== entry.bytes || sha256 !== entry.sha256) issues.push(`evidence_mismatch:${entry.path}`);
    } catch {
      issues.push(`evidence_missing:${entry.path}`);
    }
  }
  return issues;
}

export async function verifyDeliveryCase(caseDir, { projectRoot, releaseSha } = {}) {
  const root = resolve(caseDir);
  let deliveryCase;
  try {
    deliveryCase = JSON.parse(await readFile(join(root, "case.json"), "utf8"));
  } catch {
    return { status: "blocked", issues: ["delivery_case_missing"] };
  }
  const events = await loadEvents(root);
  const manifest = await readFile(join(root, "evidence-manifest.json"), "utf8").then(JSON.parse).catch(() => null);
  const issues = [];
  if (events.length === 0) issues.push("events_missing");
  const lastFailure = [...events].reverse().find((event) => ["failed", "blocked", "needs_human"].includes(event.status));
  if (lastFailure) issues.push(`stage_incomplete:${lastFailure.stage}`);
  if (!manifest) issues.push("evidence_manifest_missing");
  else issues.push(...await verifyManifest(root, manifest));
  if (releaseSha && releaseSha !== deliveryCase.targetSha) issues.push("target_sha_drift");
  if (projectRoot) {
    const discovery = await discoverProject(projectRoot);
    if (discovery.gitSha && discovery.gitSha !== deliveryCase.targetSha) issues.push("working_tree_target_sha_drift");
  }
  const requiredEvidence = deliveryCase.policy?.requiredEvidence ?? [];
  for (const required of requiredEvidence) {
    if (!manifest?.entries?.some((entry) => entry.path === required || entry.type === required)) issues.push(`required_evidence_missing:${required}`);
  }
  return {
    status: issues.length === 0 ? "passed" : "blocked",
    case: deliveryCase,
    events,
    evidence: manifest,
    issues,
  };
}
