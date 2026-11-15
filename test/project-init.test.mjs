import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeProject, projectConfigPath } from "../src/project-init.mjs";

test("initializes a generic definition from project-owned scripts and workflows", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-init-"));
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "fixture-project",
    version: "1.2.3",
    scripts: { test: "node test.js", build: "node build.js", package: "node package.js" },
  }));
  const result = await initializeProject(root);
  assert.equal(result.status, "created");
  assert.equal(result.definition.methods.verify.script, "test");
  assert.equal(result.definition.methods.build.script, "build");
  assert.equal(result.definition.methods.package.script, "package");
  assert.equal(result.definition.methods.implementation.completed, false);
  assert.equal(result.definition.release.commit.paths[0], ".autotest");
  assert.deepEqual(JSON.parse(await readFile(projectConfigPath(root), "utf8")), result.definition);
});

test("does not overwrite an existing definition unless forced", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-init-existing-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-project", version: "1.0.0", scripts: { test: "node test.js" } }));
  const first = await initializeProject(root);
  const second = await initializeProject(root);
  assert.equal(second.status, "exists");
  assert.deepEqual(second.definition, first.definition);
  const forced = await initializeProject(root, { force: true });
  assert.equal(forced.status, "created");
});
