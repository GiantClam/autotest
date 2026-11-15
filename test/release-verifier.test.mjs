import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyReleaseArtifacts } from "../src/release-verifier.mjs";

test("verifies release artifact checksums and evidence paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-release-verifier-"));
  await writeFile(join(root, "app.zip"), "artifact");
  const checksum = createHash("sha256").update("artifact").digest("hex");
  const result = await verifyReleaseArtifacts({ projectRoot: root, artifactChecksums: { "app.zip": checksum }, signaturePaths: ["app.zip"] });
  assert.equal(result.status, "passed");
  const mismatch = await verifyReleaseArtifacts({ projectRoot: root, artifactChecksums: { "app.zip": "0" } });
  assert.equal(mismatch.status, "failed");
});
