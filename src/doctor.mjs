import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { discoverProject } from "./discovery.mjs";

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function doctorProject(projectRoot) {
  const discovery = await discoverProject(projectRoot);
  const checks = [
    { id: "project-root", passed: await exists(discovery.projectRoot), reason: "project_root_missing" },
    { id: "repository", passed: Boolean(discovery.repository), reason: "git_repository_missing" },
    { id: "branch", passed: Boolean(discovery.branch), reason: "git_branch_missing" },
    { id: "target-sha", passed: Boolean(discovery.gitSha), reason: "git_sha_missing" },
  ];
  return {
    status: checks.every((check) => check.passed) ? "passed" : "blocked",
    projectRoot: discovery.projectRoot,
    discovery,
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => check.reason),
  };
}
