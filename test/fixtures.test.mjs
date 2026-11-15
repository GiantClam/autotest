import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { discoverProject } from "../src/discovery.mjs";
import { initializeProject } from "../src/project-init.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "projects");

test("discovers standard project families and creates standard methods without adapters", async () => {
  const cases = [
    ["node", "node", "package-script"],
    ["python", "python", "command"],
    ["rust", "rust", "command"],
    ["go", "go", "command"],
    ["make", "make", "command"],
    ["jvm", "jvm-gradle", "command"],
  ];
  for (const [directory, ecosystem, methodKind] of cases) {
    const fixture = await mkdtemp(join(tmpdir(), `autotest-${directory}-`));
    await cp(join(root, directory), fixture, { recursive: true });
    const discovery = await discoverProject(fixture);
    assert.ok(discovery.ecosystems.includes(ecosystem));
    const initialized = await initializeProject(fixture);
    assert.equal(initialized.definition.methods.verify.kind, methodKind);
  }
  const unknown = await discoverProject(await mkdtemp(join(tmpdir(), "autotest-unknown-")));
  assert.ok(unknown.missingCapabilities.includes("verify"));
});
