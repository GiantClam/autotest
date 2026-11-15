import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeliveryCase, readDeliveryCase } from "../src/delivery-case.mjs";

test("creates a delivery case with target identity and lifecycle vocabulary", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-case-"));
  const result = await createDeliveryCase({
    projectRoot: root,
    workItemId: "WI-1",
    project: "fixture",
    repository: "owner/fixture",
    targetSha: "1234567890abcdef",
    branch: "codex/fixture",
    environment: { runtime: "node" },
  });
  const loaded = await readDeliveryCase(result.caseDir);
  assert.equal(loaded.targetSha, "1234567890abcdef");
  assert.ok(loaded.lifecycleStages.includes("release-approval"));
  assert.ok(loaded.statuses.includes("needs_human"));
});

test("requires target identity before creating a case", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-case-invalid-"));
  await assert.rejects(createDeliveryCase({ projectRoot: root, workItemId: "WI-1", project: "fixture", repository: "owner/fixture", branch: "main" }), /delivery_case_invalid:target_sha_required/);
});
