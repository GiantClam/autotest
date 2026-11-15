import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateReleaseGate } from "../src/release-gate.mjs";

test("blocks publication while OpenSpec tasks remain incomplete", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-release-gate-"));
  const tasks = join(root, "tasks.md");
  await writeFile(tasks, "- [x] done\n- [ ] missing evidence\n");
  const result = await evaluateReleaseGate({ tasksPath: tasks });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.unchecked, ["missing evidence"]);
});
