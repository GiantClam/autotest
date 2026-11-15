import test from "node:test";
import assert from "node:assert/strict";
import { registerDesktopAdapter, runDesktopGoal, verifyDesktopReceipt } from "../src/desktop.mjs";

const goal = { goalId: "goal-1", maxActions: 2, timeoutMs: 1000, allowedApps: ["Fixture"], allowedWindows: ["Main"] };

test("runs a registered bounded adapter and independently verifies its receipt", async () => {
  const unregister = registerDesktopAdapter("fixture", { mode: "inspect-only", async run() { return { receipt: { id: "receipt-1" }, actions: 1 }; } });
  const result = await runDesktopGoal({ adapter: "fixture", goal });
  assert.equal(result.status, "passed");
  assert.equal((await verifyDesktopReceipt(result.receipt, async (receipt) => receipt.id === "receipt-1")).status, "passed");
  unregister();
});

test("stops when the adapter reports a protected condition or exceeds the action limit", async () => {
  const unregister = registerDesktopAdapter("blocked", { async run() { return { receipt: {}, stopReason: "mfa", actions: 1 }; } });
  assert.equal((await runDesktopGoal({ adapter: "blocked", goal })).status, "blocked");
  unregister();
  const unregisterLimit = registerDesktopAdapter("limit", { async run() { return { receipt: {}, actions: 3 }; } });
  assert.equal((await runDesktopGoal({ adapter: "limit", goal })).reason, "desktop_action_limit_exceeded");
  unregisterLimit();
});
