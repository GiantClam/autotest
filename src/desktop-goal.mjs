import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const GOAL_DIRECTORY = ".autotest/cases";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u;

function fail(message) {
  throw new Error(`desktop_goal_invalid:${message}`);
}
function id(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) fail(`${label}_invalid`);
  return value;
}

function positiveInteger(value, label, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) fail(`${label}_invalid`);
  return value;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeGoal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("goal_invalid");
  if (typeof raw.purpose !== "string" || raw.purpose.trim() === "") fail("purpose_required");
  const allowedApps = raw.allowedApps === undefined ? [] : raw.allowedApps;
  const allowedWindows = raw.allowedWindows === undefined ? [] : raw.allowedWindows;
  if (!Array.isArray(allowedApps) || !allowedApps.every((value) => typeof value === "string" && value.trim() !== "")) fail("allowed_apps_invalid");
  if (!Array.isArray(allowedWindows) || !allowedWindows.every((value) => typeof value === "string" && value.trim() !== "")) fail("allowed_windows_invalid");
  const evidence = Array.isArray(raw.requiredEvidence) && raw.requiredEvidence.length > 0 ? raw.requiredEvidence : ["operation-receipt"];
  return Object.freeze({
    goalId: id(raw.goalId, "goal_id"),
    purpose: raw.purpose.trim(),
    allowedApps: Object.freeze(allowedApps.map((value) => value.trim())),
    allowedWindows: Object.freeze(allowedWindows.map((value) => value.trim())),
    maxActions: positiveInteger(raw.maxActions ?? 20, "max_actions", 1000),
    timeoutMs: positiveInteger(raw.timeoutMs ?? 120_000, "timeout_ms", 86_400_000),
    requiredEvidence: Object.freeze(evidence.map((value) => {
      if (typeof value !== "string" || value.trim() === "") fail("required_evidence_invalid");
      return value.trim();
    })),
  });
}

function goalPath(projectRoot, caseId) {
  return join(resolve(projectRoot), GOAL_DIRECTORY, caseId, "desktop-goals.json");
}

export function desktopGoalPath(projectRoot, caseId) {
  return goalPath(projectRoot, id(caseId, "case_id"));
}

export async function registerDesktopGoal(projectRoot, caseId, rawGoal, { write = false } = {}) {
  const root = resolve(projectRoot);
  const safeCaseId = id(caseId, "case_id");
  const goal = normalizeGoal(rawGoal);
  const path = goalPath(root, safeCaseId);
  let document = { schemaVersion: 1, caseId: safeCaseId, goals: [] };
  if (await exists(path)) document = JSON.parse(await readFile(path, "utf8"));
  if (document.schemaVersion !== 1 || document.caseId !== safeCaseId || !Array.isArray(document.goals)) fail("document_invalid");
  const index = document.goals.findIndex((candidate) => candidate.goalId === goal.goalId);
  const nextGoals = [...document.goals];
  const status = index === -1 ? "created" : JSON.stringify(nextGoals[index]) === JSON.stringify(goal) ? "exists" : "updated";
  if (index === -1) nextGoals.push(goal);
  else nextGoals[index] = goal;
  const nextDocument = { schemaVersion: 1, caseId: safeCaseId, goals: nextGoals.sort((left, right) => left.goalId.localeCompare(right.goalId)) };
  if (write && status !== "exists") {
    await mkdir(join(root, GOAL_DIRECTORY, safeCaseId), { recursive: true });
    await writeFile(path, `${JSON.stringify(nextDocument, null, 2)}\n`, "utf8");
  }
  return {
    status: write ? status : "planned",
    projectRoot: root,
    caseId: safeCaseId,
    goal,
    path,
    executor: "agent-jv",
    jvPolicy: "agent-must-call-jev-within-registered-bounds",
    document: write ? nextDocument : { ...nextDocument, goals: nextDocument.goals },
  };
}
