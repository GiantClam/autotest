import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeReleaseAction } from "../src/release.mjs";

test("merges the single open PR for the discovered project branch", async () => {
  const calls = [];
  const commandRunner = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === "pr" && args[1] === "list") return { status: "passed", stdout: "42\n" };
    return { status: "passed" };
  };
  const result = await executeReleaseAction({ kind: "github-pr-merge", repository: "owner/demo", headBranch: "codex/demo", baseBranch: "main", strategy: "squash", deleteBranch: true }, { discovery: { projectRoot: "/tmp/demo" }, execute: true, commandRunner });
  assert.equal(result.status, "passed");
  assert.deepEqual(calls[1][1], ["pr", "merge", "42", "--repo", "owner/demo", "--squash", "--delete-branch"]);
});

test("tags the merged base branch and publishes the verified tag", async () => {
  const calls = [];
  const commandRunner = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === "show-ref") return { status: "failed", exitCode: 1 };
    return { status: "passed", stdout: "" };
  };
  const tagResult = await executeReleaseAction({ kind: "git-tag", repository: "owner/demo", baseBranch: "main", tag: "v1.2.3" }, { discovery: { projectRoot: "/tmp/demo" }, execute: true, commandRunner });
  const publishResult = await executeReleaseAction({ kind: "github-release", repository: "owner/demo", tag: "v1.2.3", generateNotes: true }, { discovery: { projectRoot: "/tmp/demo" }, execute: true, commandRunner });
  assert.equal(tagResult.status, "passed");
  assert.equal(publishResult.status, "passed");
  assert.deepEqual(calls.slice(0, 4).map(([command, args]) => [command, args.slice(0, 3)]), [
    ["git", ["fetch", "origin", "main"]],
    ["git", ["show-ref", "--verify", "--quiet"]],
    ["git", ["tag", "-a", "v1.2.3"]],
    ["git", ["push", "origin", "v1.2.3"]],
  ]);
  assert.deepEqual(calls[4][1], ["release", "create", "v1.2.3", "--repo", "owner/demo", "--verify-tag", "--generate-notes"]);
});

test("does not mutate GitHub or Git in plan mode", async () => {
  let called = false;
  const result = await executeReleaseAction({ kind: "github-release", repository: "owner/demo", tag: "v1.2.3", generateNotes: true }, { discovery: { projectRoot: "/tmp/demo" }, execute: false, commandRunner: async () => { called = true; return { status: "passed" }; } });
  assert.equal(result.status, "planned");
  assert.equal(called, false);
});

test("expands generated package assets before GitHub Release upload", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-release-"));
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "demo.dmg"), "dmg");
  const calls = [];
  const result = await executeReleaseAction({ kind: "github-release", repository: "owner/demo", tag: "v1.2.3", assets: ["dist/*.dmg"], generateNotes: true }, { discovery: { projectRoot: root }, execute: true, commandRunner: async (command, args) => { calls.push([command, args]); return { status: "passed" }; } });
  assert.equal(result.status, "passed");
  assert.deepEqual(calls[0][1], ["release", "create", "v1.2.3", "dist/demo.dmg", "--repo", "owner/demo", "--verify-tag", "--generate-notes"]);
});
