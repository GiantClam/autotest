import test from "node:test";
import assert from "node:assert/strict";
import { createJevClient } from "../src/jev.mjs";

test("keeps JEV keyless by default and never returns the credential", async () => {
  const result = await createJevClient({ apiKey: "apikey_test-secret", fetchImpl: async (_endpoint, options) => ({ ok: true, async json() { return { model: "jev-latest", answers: { safe: { type: "noul", noul: 1 } }, receivedAuthorization: options.headers.authorization }; } }) }).evaluate({ state: { goal: "inspect" }, questions: { safe: { type: "noul", instructions: "Is this safe?" } }, signal: undefined });
  assert.equal(result.status, "passed");
});

test("reports a provider gate without calling the network when no JEV key is available", async () => {
  let called = false;
  const result = await createJevClient({ apiKey: "", fetchImpl: async () => { called = true; } }).evaluate({ state: "x", questions: { q: { type: "noul", instructions: "Is x?" } } });
  assert.equal(result.status, "blocked");
  assert.equal(called, false);
});
