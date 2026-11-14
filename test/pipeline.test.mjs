import test from "node:test";
import assert from "node:assert/strict";
import { executePipeline, createPipelinePlan } from "../src/pipeline.mjs";

const discovery = {
  projectRoot: "/tmp/project",
  projectId: "fixture",
  repository: "https://github.com/owner/fixture.git",
  branch: "codex/fixture",
  packageManager: "npm",
  version: "1.2.3",
  scripts: { test: "node test.js", build: "node build.js", package: "node package.js" },
};

const definition = {
  schemaVersion: 1,
  project: { id: "fixture", root: ".", repository: "owner/fixture", defaultBranch: "main" },
  methods: {
    implementation: { kind: "manual", completed: true },
    verify: { kind: "command", command: process.execPath, args: ["-e", "process.exit(0)"] },
    build: { kind: "command", command: process.execPath, args: ["-e", "process.exit(0)"] },
    package: { kind: "command", command: process.execPath, args: ["-e", "process.exit(0)"] },
    smoke: { kind: "command", command: process.execPath, args: ["-e", "process.exit(0)"] }
  }
};

test("plans smoke before merge, tag, and publish", () => {
  const plan = createPipelinePlan(definition, discovery);
  assert.deepEqual(plan.stages.map((stage) => stage.id), ["discover", "implementation", "verify", "build", "package", "smoke", "commit", "push", "merge", "tag", "publish"]);
  assert.equal(plan.stages.find((stage) => stage.id === "tag").action.tag, "v1.2.3");
});

test("stops before release when implementation is incomplete", async () => {
  const result = await executePipeline({ ...definition, methods: { ...definition.methods, implementation: { kind: "manual", completed: false } } }, discovery, { execute: true });
  assert.equal(result.status, "blocked");
  assert.equal(result.stoppedAt, "implementation");
});

test("plan mode reports every stage without executing or stopping", async () => {
  const result = await executePipeline({ ...definition, methods: { ...definition.methods, implementation: { kind: "manual", completed: false } } }, discovery, { execute: false });
  assert.equal(result.status, "planned");
  assert.deepEqual(result.results.map((stage) => stage.id), ["discover", "implementation", "verify", "build", "package", "smoke", "commit", "push", "merge", "tag", "publish"]);
  assert.equal(result.results.find((stage) => stage.id === "implementation").status, "ready");
});

test("executes project methods before release actions", async () => {
  const calls = [];
  const result = await executePipeline(definition, discovery, {
    execute: true,
    methodExecutor: async (method) => { calls.push(method.id); return { status: "passed" }; },
    releaseExecutor: async (action) => { calls.push(action.stage); return { status: "passed" }; },
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(calls, ["implementation-1", "verify-1", "build-1", "package-1", "smoke-1", "commit", "push", "merge", "tag", "publish"]);
});

test("refreshes the project version after implementation before tagging", async () => {
  const calls = [];
  const result = await executePipeline(definition, { ...discovery, projectRoot: process.cwd(), version: "0.1.3" }, {
    execute: true,
    methodExecutor: async (method) => {
      calls.push(method.id);
      return { status: "passed" };
    },
    releaseExecutor: async (action) => {
      calls.push(action.stage);
      return { status: "passed", tag: action.tag };
    },
  });
  assert.equal(result.status, "passed");
  const tagResult = result.results.find((stage) => stage.id === "tag").result;
  assert.equal(tagResult.tag, "v0.1.2");
});
