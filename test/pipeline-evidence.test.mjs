import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executePipeline } from "../src/pipeline.mjs";

const discovery = { projectRoot: process.cwd(), projectId: "fixture", repository: "owner/fixture", branch: "feature", gitSha: "sha", version: "1.0.0" };
const definition = { schemaVersion: 1, project: { id: "fixture", root: ".", repository: "owner/fixture", defaultBranch: "main" }, methods: { implementation: { kind: "manual", completed: true }, verify: { kind: "manual", completed: true }, build: { kind: "manual", completed: true }, package: { kind: "manual", completed: true }, smoke: { kind: "manual", completed: true } }, release: { commit: { enabled: false }, push: { enabled: false }, merge: { enabled: false }, tag: { enabled: false }, publish: { enabled: false } } };

test("records durable stage events and resumes passed stages without re-running them", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-pipeline-case-"));
  const calls = [];
  const first = await executePipeline(definition, discovery, { execute: true, caseDir: root, methodExecutor: async (method) => { calls.push(method.id); return { status: "passed" }; } });
  assert.equal(first.status, "passed");
  const before = calls.length;
  const resumed = await executePipeline(definition, discovery, { execute: true, caseDir: root, resume: true, methodExecutor: async (method) => { calls.push(method.id); return { status: "passed" }; } });
  assert.equal(resumed.status, "passed");
  assert.equal(calls.length, before);
  assert.match(await readFile(join(root, "events.jsonl"), "utf8"), /"stage":"verify"/u);
});

test("retries a failed project method only within its declared retry limit", async () => {
  let attempts = 0;
  const result = await executePipeline({ ...definition, methods: { ...definition.methods, verify: { kind: "command", command: "ignored", retryLimit: 1 } } }, discovery, {
    execute: true,
    methodExecutor: async (method) => {
      if (method.id === "verify-1") {
        attempts += 1;
        return attempts === 2 ? { status: "passed" } : { status: "failed", classification: "environment", reason: "transient" };
      }
      return { status: "passed" };
    },
  });
  assert.equal(result.status, "passed");
  assert.equal(attempts, 2);
});

test("keeps a failed remote release action resumable", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-release-resume-"));
  const releaseDefinition = {
    ...definition,
    project: { ...definition.project, repository: "owner/fixture", defaultBranch: "main" },
    release: {
      commit: { enabled: true, message: "test release", paths: ["."] },
      push: { enabled: true, remote: "origin" },
      merge: { enabled: true, strategy: "squash", deleteBranch: false, createIfMissing: false },
      tag: { enabled: true, prefix: "v", versionSource: "explicit", version: "1.0.0" },
      publish: { enabled: false },
    },
  };
  const firstCalls = [];
  const first = await executePipeline(releaseDefinition, discovery, {
    execute: true,
    caseDir: root,
    methodExecutor: async () => ({ status: "passed" }),
    releaseExecutor: async (action) => {
      firstCalls.push(action.stage);
      return action.stage === "merge" ? { status: "failed", error: "merge_conflict" } : { status: "passed" };
    },
  });
  assert.equal(first.status, "failed");
  assert.equal(first.stoppedAt, "merge");

  const resumedCalls = [];
  const resumed = await executePipeline(releaseDefinition, discovery, {
    execute: true,
    caseDir: root,
    resume: true,
    methodExecutor: async () => assert.fail("passed project methods must not rerun"),
    releaseExecutor: async (action) => {
      resumedCalls.push(action.stage);
      return action.stage === "merge" ? { status: "passed", mergeCommitSha: "merge-sha" } : { status: "passed" };
    },
  });
  assert.equal(resumed.status, "passed");
  assert.deepEqual(firstCalls, ["commit", "push", "merge"]);
  assert.deepEqual(resumedCalls, ["merge", "tag"]);
});
