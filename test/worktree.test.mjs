import test from "node:test";
import assert from "node:assert/strict";
import { classifyWorktreeChanges, parsePorcelainStatus } from "../src/worktree.mjs";
import { executeReleaseAction } from "../src/release.mjs";

test("classifies dirty paths against the explicit commit allowlist", () => {
  const entries = parsePorcelainStatus(" M .autotest/project.json\n?? src/new-file.ts\n");
  const result = classifyWorktreeChanges({ dirtyEntries: entries, allowedPaths: [".autotest"] });
  assert.equal(result.status, "needs_human");
  assert.deepEqual(result.unresolvedEntries.map((entry) => entry.path), ["src/new-file.ts"]);
});

test("returns human assistance instead of committing unrelated dirty files", async () => {
  const result = await executeReleaseAction({ kind: "git-commit", message: "test", paths: [".autotest"] }, {
    discovery: { projectRoot: "/tmp/project" },
    execute: true,
    commandRunner: async (_command, args) => args[0] === "status" ? { status: "passed", stdout: " M src/unrelated.ts\n" } : { status: "passed", stdout: "" },
  });
  assert.equal(result.status, "needs_human");
  assert.equal(result.reason, "unresolved_worktree_changes");
  assert.ok(result.details.unresolvedEntries[0].path.includes("src/unrelated.ts"));
});
