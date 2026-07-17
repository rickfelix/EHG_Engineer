/**
 * SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3): dual-key audit substrate for
 * admin-override (--admin) merges. See database/migrations/20260711_ship_escape_audit.sql
 * for the schema rationale.
 *
 * Both functions are best-effort / never-throw at the call site the way
 * lib/ship/auto-merge.mjs's observeMergeWorkLadder() is — a failure here must
 * never affect the merge itself (TR-1's non-blocking-observation principle
 * applies equally to this audit substrate).
 *
 * LIVENESS GATES (SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001 — the table is applied and live;
 * these are the two remaining silent-skip conditions on the write path):
 *   1. CLAUDE_SESSION_ID must be set in the merge environment — it is the sole
 *      actor-identity source (lib/ship/auto-merge.mjs); unset => warn-and-skip.
 *   2. The client must be SERVICE-ROLE — the table's only RLS policy is
 *      FOR ALL TO service_role; an anon/authenticated insert is rejected and
 *      caught non-fatally. Presence coverage: tests/integration/ship/
 *      escape-audit-presence.test.js (read-only — the audit trail is append-only).
 */

/**
 * Write a dual-key audit row for an admin-override merge. Requires BOTH keys
 * (pr identity + sessionId) — throws if either is missing, so a caller
 * cannot accidentally write a half-identified row; callers are expected to
 * wrap this in their own try/catch (mirroring observeMergeWorkLadder's pattern)
 * so a write failure never blocks the merge that already happened.
 */
export async function writeEscapeAuditRow(supabase, { prNumber, repo, sessionId, reason, mergeCommitSha = null }) {
  if (!prNumber || !repo) throw new Error('writeEscapeAuditRow: prNumber and repo are required (dual-key: merge identity)');
  if (!sessionId) throw new Error('writeEscapeAuditRow: sessionId is required (dual-key: actor identity)');
  const { error } = await supabase.from('ship_escape_audit').insert({
    pr_number: Number(prNumber),
    repo,
    session_id: sessionId,
    reason: reason || 'branch protection enforce_admins=true',
    merge_commit_sha: mergeCommitSha,
  });
  if (error) throw new Error(`writeEscapeAuditRow: insert failed: ${error.message}`);
}

/**
 * checkEscapeAudit(prNumber, repoOwner, repoName) => Promise<boolean|null> shape
 * expected by lib/ship/merge-witness-ladder.mjs's evaluateEscapeAuth(). Returns
 * true if an audit row exists for this PR, false if none, null if the lookup
 * itself failed (never folded into a false "no audit" reading).
 */
export function createEscapeAuditChecker(supabase) {
  return async function checkEscapeAudit(prNumber, repoOwner, repoName) {
    if (!supabase || !prNumber || !repoOwner || !repoName) return null;
    try {
      const repo = `${repoOwner}/${repoName}`;
      const { data, error } = await supabase
        .from('ship_escape_audit')
        .select('id')
        .eq('pr_number', Number(prNumber))
        .eq('repo', repo)
        .limit(1);
      if (error) return null;
      return Array.isArray(data) && data.length > 0;
    } catch {
      return null;
    }
  };
}
