import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

const SECRET_PATTERN = /apikey_[A-Za-z0-9_-]+|(?:token|secret|password|key)=[^\s&]+/giu;

export function redact(value) {
  return String(value).replace(SECRET_PATTERN, (match) => match.startsWith("apikey_") ? "[REDACTED_API_KEY]" : `${match.split("=", 1)[0]}=[REDACTED]`);
}

function fail(message) {
  throw new Error(`artifact_invalid:${message}`);
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u.test(value)) fail(`${label}_invalid`);
  return value;
}

export function caseDirectory(projectRoot, workItemId) {
  return join(resolve(projectRoot), ".autotest", "cases", safeId(workItemId, "work_item_id"));
}

function relativeEvidencePath(caseDir, filePath) {
  const absolute = resolve(filePath);
  const relativePath = relative(caseDir, absolute);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === ".." || relativePath.split(sep).includes("..")) fail("evidence_path_outside_case");
  return relativePath.split(sep).join("/");
}

export async function writeEvidenceManifest(caseDir, evidenceEntries) {
  if (!Array.isArray(evidenceEntries)) fail("evidence_entries_invalid");
  const root = resolve(caseDir);
  const entries = [];
  for (const item of evidenceEntries) {
    const path = typeof item === "string" ? item : item?.path;
    if (typeof path !== "string" || path.trim() === "") fail("evidence_path_required");
    const absolute = resolve(root, path);
    const relativePath = relativeEvidencePath(root, absolute);
    const metadata = await stat(absolute);
    const bytes = await readFile(absolute);
    entries.push({
      path: relativePath,
      bytes: metadata.size,
      type: item?.type ?? "file",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const manifest = { schemaVersion: 1, entries };
  await mkdir(root, { recursive: true });
  const outputPath = join(root, "evidence-manifest.json");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { path: outputPath, manifest };
}

export async function appendEvent(caseDir, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) fail("event_invalid");
  const eventId = safeId(event.eventId, "event_id");
  const stage = safeId(event.stage, "stage");
  if (typeof event.status !== "string" || event.status.trim() === "") fail("event_status_required");
  const root = resolve(caseDir);
  await mkdir(root, { recursive: true });
  const logPath = join(root, "events.jsonl");
  const prior = await readFile(logPath, "utf8").catch(() => "");
  if (prior.split("\n").filter(Boolean).some((line) => JSON.parse(line).eventId === eventId)) fail("duplicate_event_id");
  const record = {
    ...event,
    eventId,
    stage,
    status: event.status.trim(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    ...(event.error ? { error: redact(event.error) } : {}),
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  return { path: logPath, record };
}

export async function loadEvents(caseDir) {
  const content = await readFile(join(resolve(caseDir), "events.jsonl"), "utf8").catch(() => "");
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export async function loadResumeState(caseDir) {
  const events = await loadEvents(caseDir);
  const last = events.at(-1) ?? null;
  const lastPassed = [...events].reverse().find((event) => event.status === "passed") ?? null;
  return { events, lastEvent: last, lastPassedEvent: lastPassed, resumable: last?.status !== "failed" || last?.resumable === true };
}
