import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { apply } from "../plugin/src/index.mjs";

test("loads every local Harness tool and invokes it against a fake project", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "autotest-plugin-fixture-"));
  await readFile(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "projects", "node", "package.json"), "utf8").then((content) => import("node:fs/promises").then(({ writeFile }) => writeFile(join(projectRoot, "package.json"), content)));
  const registered = new Map();
  apply({ tools: { register(definition) { registered.set(definition.name, definition); } } }, { autotestRoot: join(dirname(fileURLToPath(import.meta.url)), ".."), timeoutMs: 30_000 });
  assert.deepEqual([...registered.keys()].sort(), ["autosoftwarefactory_project_assist", "autotest_desktop_goal_register", "autotest_project_discover", "autotest_project_init", "autotest_project_plan", "autotest_project_run"].sort());
  for (const definition of registered.values()) {
    assert.equal(definition.output.schema.required.includes("status"), true);
    assert.equal(definition.parameters.type, "object");
  }
  const exec = { signal: undefined };
  const discover = await registered.get("autotest_project_discover").execute({ project_root: projectRoot }, exec);
  assert.equal(discover.status, "passed");
  assert.equal((await registered.get("autotest_project_init").execute({ project_root: projectRoot, write: true }, exec)).status, "created");
  assert.equal((await registered.get("autotest_desktop_goal_register").execute({ project_root: projectRoot, case_id: "case-1", goal_id: "goal-1", purpose: "inspect", write: false }, exec)).status, "planned");
  assert.equal((await registered.get("autosoftwarefactory_project_assist").execute({ project_root: projectRoot, generated_files: { "scripts/check.sh": "#!/bin/sh\nexit 0\n" }, allowed_paths: ["scripts"] }, exec)).status, "needs_human");
  assert.equal((await registered.get("autosoftwarefactory_project_assist").execute({ project_root: projectRoot, generated_files: { "scripts/check.sh": "#!/bin/sh\nexit 0\n" }, allowed_paths: ["scripts"], write: true }, exec)).status, "passed");
  assert.equal((await registered.get("autotest_project_plan").execute({ project_root: projectRoot }, exec)).status, "planned");
  assert.equal((await registered.get("autotest_project_run").execute({ project_root: projectRoot, execute: false }, exec)).status, "planned");
});
