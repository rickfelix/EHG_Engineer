/**
 * Loud sibling-repo resolution for the stage census (TR-3, TS-5).
 *
 * lib/repo-paths.cjs resolveRepoPath() returns null on an unknown app name, and returns a path
 * even when that path does not exist on disk. Left unchecked, an unresolved or missing sibling
 * repo would degrade to an empty filesystem walk that reports a false "0 findings" for that
 * repo -- exactly the failure mode this census exists to prevent (per the DESIGN sub-agent's
 * own PRD-generation warning: "an empty/wrong tree yields zero violations and must not pass as
 * green"). This wrapper throws instead.
 */
export function resolveRepoOrThrow(appName, { resolveRepoPath, existsSync } = {}) {
  const path = resolveRepoPath(appName);
  if (!path) {
    throw new Error(
      `SIBLING_REPO_UNRESOLVED: resolveRepoPath("${appName}") returned no path -- check applications/registry.json.`
    );
  }
  if (!existsSync(path)) {
    throw new Error(
      `SIBLING_REPO_MISSING: resolveRepoPath("${appName}") resolved to "${path}", but that directory does not exist on disk -- check the local checkout.`
    );
  }
  return path;
}
