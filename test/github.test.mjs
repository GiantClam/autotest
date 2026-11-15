import test from "node:test";
import assert from "node:assert/strict";
import { verifyPullRequestChecks } from "../src/github.mjs";

test("fails closed when a pull request head SHA or required check is wrong", async () => {
  const commandRunner = async () => ({ status: "passed", stdout: JSON.stringify({ headRefOid: "wrong", statusCheckRollup: [{ name: "unit", conclusion: "SUCCESS" }] }) });
  const result = await verifyPullRequestChecks({ repository: "owner/repo", pullRequest: 1, expectedHeadSha: "expected", requiredChecks: ["unit", "release"], commandRunner });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "pull_request_head_sha_mismatch");
});
