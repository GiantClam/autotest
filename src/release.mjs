import { execFile } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function redact(value) {
  return String(value)
    .replace(/apikey_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(/(token|secret|password|key)=([^\s&]+)/gi, "$1=[REDACTED]");
}

async function runCommand(command, args, { cwd, timeoutMs = 120_000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    return { status: "passed", exitCode: 0, stdout: redact(stdout), stderr: redact(stderr), command, args };
  } catch (error) {
    return {
      status: "failed",
      exitCode: typeof error?.code === "number" ? error.code : null,
      error: redact(error instanceof Error ? error.message : String(error)),
      stdout: redact(error?.stdout ?? ""),
      stderr: redact(error?.stderr ?? ""),
      command,
      args,
    };
  }
}

function segmentPattern(segment) {
  return new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")}$`);
}

async function expandOneAsset(root, pattern) {
  const segments = pattern.split(/[\\/]+/u).filter(Boolean);
  async function visit(directory, index) {
    if (index === segments.length) return [directory];
    const segment = segments[index];
    if (!segment.includes("*") && !segment.includes("?")) {
      const next = join(directory, segment);
      try {
        const info = await lstat(next);
        if (index === segments.length - 1) return info.isFile() ? [next] : [];
        return info.isDirectory() ? visit(next, index + 1) : [];
      } catch {
        return [];
      }
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    const matches = [];
    for (const entry of entries.filter((value) => segmentPattern(segment).test(value.name)).sort((left, right) => left.name.localeCompare(right.name))) {
      const next = join(directory, entry.name);
      if (index === segments.length - 1) {
        if (entry.isFile()) matches.push(next);
      } else if (entry.isDirectory()) {
        matches.push(...await visit(next, index + 1));
      }
    }
    return matches;
  }
  return (await visit(root, 0)).map((path) => relative(root, path));
}

async function expandAssets(root, patterns = []) {
  const expanded = [];
  const missing = [];
  for (const pattern of patterns) {
    const matches = await expandOneAsset(root, pattern);
    if (matches.length === 0) missing.push(pattern);
    else expanded.push(...matches);
  }
  if (missing.length > 0) return { error: `release_asset_not_found:${missing.join(",")}` };
  return { assets: expanded };
}

function mergeArgs(action, pullRequest) {
  const args = ["pr", "merge", pullRequest, "--repo", action.repository];
  if (action.strategy === "merge") args.push("--merge");
  else if (action.strategy === "rebase") args.push("--rebase");
  else args.push("--squash");
  if (action.deleteBranch) args.push("--delete-branch");
  return args;
}

async function mergePullRequest(action, context) {
  if (!action.headBranch || !action.baseBranch) return { status: "manual_required", reason: "branch_context_required" };
  const lookup = await context.commandRunner("gh", ["pr", "list", "--repo", action.repository, "--head", action.headBranch, "--base", action.baseBranch, "--state", "open", "--json", "number", "--jq", ".[].number"], context);
  if (lookup.status !== "passed") return lookup;
  const pullRequests = lookup.stdout.split(/\s+/u).map((value) => value.trim()).filter(Boolean);
  if (pullRequests.length !== 1) return { status: "manual_required", reason: pullRequests.length === 0 ? "open_pull_request_not_found" : "multiple_open_pull_requests_found", candidates: pullRequests };
  return context.commandRunner("gh", mergeArgs(action, pullRequests[0]), context);
}

async function createTag(action, context) {
  if (!action.tag || !action.baseBranch) return { status: "manual_required", reason: "release_tag_or_base_branch_required" };
  const fetchResult = await context.commandRunner("git", ["fetch", "origin", action.baseBranch], context);
  if (fetchResult.status !== "passed") return fetchResult;
  const existing = await context.commandRunner("git", ["show-ref", "--verify", "--quiet", `refs/tags/${action.tag}`], context);
  if (existing.status === "passed") return { status: "failed", reason: "release_tag_already_exists", tag: action.tag };
  if (existing.exitCode !== 1) return existing;
  const tagResult = await context.commandRunner("git", ["tag", "-a", action.tag, `origin/${action.baseBranch}`, "-m", `Release ${action.tag}`], context);
  if (tagResult.status !== "passed") return tagResult;
  return context.commandRunner("git", ["push", "origin", action.tag], context);
}

async function publishRelease(action, context) {
  if (!action.tag) return { status: "manual_required", reason: "release_tag_required" };
  const assets = await expandAssets(context.cwd, action.assets ?? []);
  if (assets.error) return { status: "failed", reason: assets.error };
  const args = ["release", "create", action.tag, ...assets.assets, "--repo", action.repository, "--verify-tag"];
  if (action.generateNotes) args.push("--generate-notes");
  return context.commandRunner("gh", args, context);
}

export async function executeReleaseAction(action, { discovery, execute = false, commandRunner = runCommand } = {}) {
  if (!action.repository) return { status: "manual_required", reason: "project_repository_required" };
  if (!execute) return { status: "planned", action };
  const context = { cwd: discovery.projectRoot, timeoutMs: 120_000, discovery };
  if (action.kind === "github-pr-merge") return mergePullRequest(action, { ...context, commandRunner });
  if (action.kind === "git-tag") return createTag(action, { ...context, commandRunner });
  if (action.kind === "github-release") return publishRelease(action, { ...context, commandRunner });
  return { status: "failed", reason: `release_action_unsupported:${action.kind}` };
}
