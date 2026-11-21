import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, loadResumeState, writeEvidenceManifest } from "../src/artifacts.mjs";

test("writes hashed evidence and rejects paths outside the case", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-artifacts-"));
  await writeFile(join(root, "result.txt"), "verified");
  const result = await writeEvidenceManifest(root, [{ path: "result.txt", type: "text" }]);
  assert.equal(result.manifest.entries[0].bytes, 8);
  assert.match(result.manifest.entries[0].sha256, /^[a-f0-9]{64}$/u);
  await assert.rejects(writeEvidenceManifest(root, [{ path: "../outside.txt" }]), /artifact_invalid:evidence_path_outside_case/);
});

test("appends events, redacts secrets, and resumes from the last passed event", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-events-"));
  await appendEvent(root, { eventId: "discover-1", stage: "discover", status: "passed" });
  await appendEvent(root, { eventId: "verify-1", stage: "verify", status: "failed", error: "token=secret-value" });
  const state = await loadResumeState(root);
  assert.equal(state.lastPassedEvent.eventId, "discover-1");
  assert.equal(state.resumable, false);
  assert.match(await readFile(join(root, "events.jsonl"), "utf8"), /token=\[REDACTED\]/u);
  await assert.rejects(appendEvent(root, { eventId: "discover-1", stage: "discover", status: "passed" }), /artifact_invalid:duplicate_event_id/);
});

test("keeps legacy failed release events resumable", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-release-event-"));
  await appendEvent(root, { eventId: "merge-1", stage: "merge", status: "failed", error: "merge_conflict" });
  const state = await loadResumeState(root);
  assert.equal(state.resumable, true);
});

test("creates an evidence directory when needed", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-artifacts-dir-"));
  const nested = join(root, "nested");
  await mkdir(nested);
  await writeFile(join(nested, "ok.txt"), "ok");
  const result = await writeEvidenceManifest(root, [{ path: "nested/ok.txt" }]);
  assert.equal(result.manifest.entries[0].path, "nested/ok.txt");
});
