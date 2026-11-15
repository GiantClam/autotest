import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function createHumanAssistance({ stage, reason, question, choices = [], details = {} } = {}) {
  return {
    status: "needs_human",
    stage,
    reason,
    question,
    choices,
    details,
    createdAt: new Date().toISOString(),
  };
}

export async function persistHumanAssistance(caseDir, request) {
  if (!caseDir) return { ...request, persisted: false };
  const root = resolve(caseDir);
  await mkdir(root, { recursive: true });
  const path = join(root, "human-assistance.json");
  await writeFile(path, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return { ...request, persisted: true, path };
}
