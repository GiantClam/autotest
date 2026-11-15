import { mkdir, readFile, writeFile } from "node:fs/promises";
import { caseDirectory, loadResumeState } from "./artifacts.mjs";
import { LIFECYCLE_STAGES, RESULT_STATUSES } from "./contracts.mjs";

function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`delivery_case_invalid:${label}_required`);
  return value.trim();
}

export async function createDeliveryCase({ projectRoot, workItemId, project, repository, targetSha, branch, environment = {}, policy = {} }) {
  const id = required(workItemId, "work_item_id");
  const target = required(targetSha, "target_sha");
  const branchName = required(branch, "branch");
  const root = caseDirectory(projectRoot, id);
  const deliveryCase = {
    schemaVersion: 1,
    workItemId: id,
    project: required(project, "project"),
    repository: required(repository, "repository"),
    targetSha: target,
    branch: branchName,
    environment: { ...environment },
    policy: { ...policy },
    lifecycleStages: [...LIFECYCLE_STAGES],
    statuses: [...RESULT_STATUSES],
    createdAt: new Date().toISOString(),
  };
  await mkdir(root, { recursive: true });
  const path = `${root}/case.json`;
  await writeFile(path, `${JSON.stringify(deliveryCase, null, 2)}\n`, "utf8");
  return { path, caseDir: root, deliveryCase };
}

export async function readDeliveryCase(caseDir) {
  return JSON.parse(await readFile(`${caseDir}/case.json`, "utf8"));
}

export { loadResumeState };
