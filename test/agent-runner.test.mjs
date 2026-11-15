import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptProjectChanges, createProjectMethod, previewProjectChanges, writeProjectChanges } from "../src/agent-runner.mjs";

test("previews and explicitly writes only allowlisted project files", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-agent-runner-"));
  const generatedFiles = { "scripts/test.sh": "#!/bin/sh\nexit 0\n" };
  const preview = await previewProjectChanges({ projectRoot: root, generatedFiles, allowedPaths: ["scripts"] });
  assert.equal(preview.writeRequired, true);
  const pending = await writeProjectChanges({ projectRoot: root, generatedFiles, allowedPaths: ["scripts"] });
  assert.equal(pending.status, "write_required");
  const written = await writeProjectChanges({ projectRoot: root, generatedFiles, allowedPaths: ["scripts"], allowProjectEdits: true });
  assert.equal(written.status, "written");
  assert.equal(await readFile(join(root, "scripts/test.sh"), "utf8"), generatedFiles["scripts/test.sh"]);
  const accepted = await acceptProjectChanges({ projectRoot: root, generatedFiles: { "package.json": JSON.stringify({ name: "fixture" }) }, allowedPaths: ["package.json"], allowProjectEdits: true });
  assert.equal(accepted.discovery.projectId, "fixture");
  await assert.rejects(previewProjectChanges({ projectRoot: root, generatedFiles: { "../escape": "x" }, allowedPaths: ["."] }), /agent_runner_invalid:path_outside_project/);
});

test("creates a project-owned implementation handoff artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-agent-handoff-"));
  const result = await createProjectMethod({ projectRoot: root, stage: "verify", taskArtifact: { ecosystem: "python", successCondition: "pytest passes", requiredEvidence: ["junit.xml"] }, allowedPaths: [".autotest"], allowProjectEdits: true });
  assert.equal(result.status, "written");
  const task = JSON.parse(await readFile(join(root, ".autotest/tasks/verify.json"), "utf8"));
  assert.equal(task.ecosystem, "python");
  assert.equal(task.writeAuthorization, true);
});
