import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopGoalPath, registerDesktopGoal } from "../src/desktop-goal.mjs";

const goal = {
  goalId: "launch-smoke",
  purpose: "Open the packaged application and verify the main window is visible.",
  allowedApps: ["CoworkAny"],
  allowedWindows: ["CoworkAny"],
  maxActions: 8,
  timeoutMs: 30_000,
  requiredEvidence: ["screenshot", "operation-receipt"],
};

test("plans a desktop goal without writing or calling JEV", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-desktop-goal-"));
  const result = await registerDesktopGoal(root, "case-1", goal);
  assert.equal(result.status, "planned");
  assert.equal(result.executor, "agent-jv");
  await assert.rejects(access(desktopGoalPath(root, "case-1"), constants.F_OK));
});

test("persists an idempotent bounded desktop goal registration", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-desktop-goal-write-"));
  const first = await registerDesktopGoal(root, "case-1", goal, { write: true });
  const second = await registerDesktopGoal(root, "case-1", goal, { write: true });
  assert.equal(first.status, "created");
  assert.equal(second.status, "exists");
  assert.equal(JSON.parse(await readFile(desktopGoalPath(root, "case-1"), "utf8")).goals[0].maxActions, 8);
});

test("rejects unsafe case identifiers before writing a goal", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-desktop-goal-invalid-"));
  await assert.rejects(registerDesktopGoal(root, "../escape", goal, { write: true }), /desktop_goal_invalid:case_id_invalid/);
});
