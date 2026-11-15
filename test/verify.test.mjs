import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeliveryCase } from "../src/delivery-case.mjs";
import { appendEvent, writeEvidenceManifest } from "../src/artifacts.mjs";
import { verifyDeliveryCase } from "../src/verify.mjs";

test("verifies a delivery case and reports target SHA drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-verify-"));
  const created = await createDeliveryCase({ projectRoot: root, workItemId: "WI-verify", project: "fixture", repository: "owner/fixture", targetSha: "target-sha", branch: "main" });
  await writeFile(join(created.caseDir, "result.txt"), "passed");
  await writeEvidenceManifest(created.caseDir, [{ path: "result.txt", type: "method-result" }]);
  await appendEvent(created.caseDir, { eventId: "verify-1", stage: "verify", status: "passed" });
  assert.equal((await verifyDeliveryCase(created.caseDir, { releaseSha: "target-sha" })).status, "passed");
  const drift = await verifyDeliveryCase(created.caseDir, { releaseSha: "other-sha" });
  assert.equal(drift.status, "blocked");
  assert.ok(drift.issues.includes("target_sha_drift"));
});
