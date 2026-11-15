import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = new URL("../schemas/", import.meta.url);
const entries = await readdir(directory);
const files = entries.filter((entry) => entry.endsWith(".json")).sort();
for (const file of files) {
  const document = JSON.parse(await readFile(new URL(file, directory), "utf8"));
  if (!document.$schema || document.type !== "object") throw new Error(`schema_invalid:${file}`);
}
console.log(JSON.stringify({ status: "passed", schemas: files }, null, 2));
