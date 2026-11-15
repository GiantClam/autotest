import test from "node:test";
import assert from "node:assert/strict";
import { runPlaywrightMethod } from "../src/browser.mjs";
import { executeProjectMethod } from "../src/method-runner.mjs";

test("records stable browser evidence paths and assertions", async () => {
  const result = await runPlaywrightMethod({
    assertions: ["window title is Fixture"],
    evidence: ["artifacts/junit.xml", "artifacts/trace.zip"],
    runner: async ({ assertions, evidence }) => ({ passed: assertions.length === 1, evidence, trace: evidence[1] }),
  });
  assert.equal(result.status, "passed");
  assert.equal(result.trace, "artifacts/trace.zip");
});

test("executes a configured Playwright method only through an injected runner", async () => {
  const result = await executeProjectMethod({ kind: "playwright", assertions: ["title"], evidence: ["junit.xml"] }, {
    execute: true,
    discovery: { projectRoot: "/tmp/fixture" },
    playwrightRunner: async () => ({ passed: true, junit: "junit.xml" }),
  });
  assert.equal(result.status, "passed");
  assert.equal(result.junit, "junit.xml");
});
