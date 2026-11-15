import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProjectDefinition } from "../src/contracts.mjs";

test("normalizes the complete implementation and release contract", () => {
  const definition = normalizeProjectDefinition({
    schemaVersion: 1,
    project: { id: "demo", root: ".", repository: "owner/demo", defaultBranch: "main" },
    methods: {
      implementation: { kind: "manual", completed: true },
      verify: { kind: "command", command: process.execPath, args: ["-e", "process.exit(0)"] },
      build: { kind: "package-script", script: "build" },
      package: { kind: "package-script", script: "package" },
      smoke: { kind: "workflow", workflow: "smoke.yml" }
    }
  }, { projectRoot: "/tmp/demo" });
  assert.equal(definition.project.root, "/tmp/demo");
  assert.equal(definition.methods.verify[0].kind, "command");
  assert.equal(definition.release.merge.enabled, true);
  assert.equal(definition.release.merge.createIfMissing, true);
  assert.equal(definition.release.tag.prefix, "v");
  assert.equal(definition.release.publish.provider, "github");
  assert.equal(definition.release.publish.timeoutMs, 30 * 60 * 1000);
});

test("rejects a project method that has no executable target", () => {
  assert.throws(() => normalizeProjectDefinition({
    schemaVersion: 1,
    project: { id: "demo" },
    methods: { verify: { kind: "package-script" } }
  }), /project_contract_invalid:verify_method_0_script_required/);
});

test("accepts v2 metadata while keeping v1 definitions readable", () => {
  const definition = normalizeProjectDefinition({
    schemaVersion: 2,
    project: { id: "demo", root: ".", defaultBranch: "main" },
    lifecycle: { workItemId: "WI-1" },
    environment: { runtime: "node" },
    methods: { verify: { kind: "command", command: process.execPath, args: [], envRefs: ["CI"] } },
    release: {},
  }, { projectRoot: "/tmp/demo" });
  assert.equal(definition.schemaVersion, 2);
  assert.equal(definition.lifecycle.workItemId, "WI-1");
  assert.deepEqual(definition.methods.verify[0].envRefs, ["CI"]);
});
