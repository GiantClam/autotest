import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProject } from "../src/discovery.mjs";

test("discovers project-owned scripts and workflows without inventing commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-discovery-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.2.3", packageManager: "pnpm@11.19.0", scripts: { test: "node test.js", "build:macos": "node build.js", deploy: "node deploy.js" } }));
  await writeFile(join(root, ".github", "workflows", "release.yml"), "on:\n  workflow_dispatch:\nname: Release\n");
  const discovery = await discoverProject(root);
  assert.equal(discovery.projectId, "fixture");
  assert.equal(discovery.packageManager, "pnpm");
  assert.deepEqual(discovery.scriptCandidates.verify, ["test"]);
  assert.deepEqual(discovery.scriptCandidates.build, ["build:macos"]);
  assert.deepEqual(discovery.scriptCandidates.smoke, ["deploy"]);
  assert.equal(discovery.workflows[0].workflowDispatch, true);
  assert.equal(discovery.version, "1.2.3");
});
