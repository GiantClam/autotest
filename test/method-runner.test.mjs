import test from "node:test";
import assert from "node:assert/strict";
import { executeProjectMethod } from "../src/method-runner.mjs";

test("executes a project-owned command without a shell", async () => {
  const result = await executeProjectMethod({
    id: "verify-fixture",
    kind: "command",
    command: process.execPath,
    args: ["-e", "process.stdout.write('ok')"],
    required: true,
    timeoutMs: 10_000,
  }, {
    discovery: { projectRoot: process.cwd(), scripts: {} },
    execute: true,
  });
  assert.equal(result.status, "passed");
  assert.match(result.stdout, /ok/);
});

test("marks a missing project script as a concrete failure", async () => {
  const result = await executeProjectMethod({
    id: "missing",
    kind: "package-script",
    script: "does-not-exist",
    required: true,
    timeoutMs: 10_000,
  }, {
    discovery: { projectRoot: process.cwd(), packageManager: "npm", scripts: {} },
    execute: true,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "project_method_not_found:does-not-exist");
});
