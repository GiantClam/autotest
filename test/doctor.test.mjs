import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorProject } from "../src/doctor.mjs";

test("doctor reports environment facts without exposing secret values", async () => {
  const root = await mkdtemp(join(tmpdir(), "autotest-doctor-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  const result = await doctorProject(root);
  assert.equal(result.checks.find((check) => check.id === "project-root").passed, true);
  assert.equal(JSON.stringify(result).includes("apikey_"), false);
});
