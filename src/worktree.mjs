function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function parsePorcelainStatus(stdout = "") {
  return String(stdout).split("\n").filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    const rawPath = line.slice(3);
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    return { code, path: normalizePath(path) };
  });
}

function allowedPath(path, allowedPaths = []) {
  const candidate = normalizePath(path);
  return allowedPaths.some((allowed) => {
    const prefix = normalizePath(allowed).replace(/\/$/u, "");
    return prefix === "." || candidate === prefix || candidate.startsWith(`${prefix}/`);
  });
}

export function classifyWorktreeChanges({ dirtyEntries = [], allowedPaths = [] } = {}) {
  const allowed = dirtyEntries.filter((entry) => allowedPath(entry.path, allowedPaths));
  const unresolved = dirtyEntries.filter((entry) => !allowedPath(entry.path, allowedPaths));
  return {
    status: unresolved.length === 0 ? "ready" : "needs_human",
    dirtyEntries,
    allowedEntries: allowed,
    unresolvedEntries: unresolved,
    allowedPaths,
  };
}
