import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

async function fileEvidence(root, relativePath, expectedSha = null) {
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${resolve(root)}/`)) return { status: "blocked", reason: `artifact_path_outside_project:${relativePath}` };
  try {
    const [info, bytes] = await Promise.all([stat(path), readFile(path)]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (expectedSha && expectedSha !== sha256) return { status: "failed", reason: `artifact_checksum_mismatch:${relativePath}`, path: relativePath, sha256 };
    return { status: "passed", path: relativePath, bytes: info.size, sha256 };
  } catch {
    return { status: "blocked", reason: `artifact_missing:${relativePath}`, path: relativePath };
  }
}

export async function verifyReleaseArtifacts({ projectRoot, artifactChecksums = {}, signaturePaths = [], notarizationEvidence = [], metadataPath = null } = {}) {
  const artifacts = [];
  for (const [path, checksum] of Object.entries(artifactChecksums)) artifacts.push(await fileEvidence(projectRoot, path, checksum));
  for (const path of signaturePaths) artifacts.push(await fileEvidence(projectRoot, path));
  for (const path of notarizationEvidence) artifacts.push(await fileEvidence(projectRoot, path));
  if (metadataPath) artifacts.push(await fileEvidence(projectRoot, metadataPath));
  const failed = artifacts.find((entry) => entry.status !== "passed");
  return failed ? { status: failed.status, reason: failed.reason, artifacts } : { status: "passed", artifacts };
}
