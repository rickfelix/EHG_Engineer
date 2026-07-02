#!/usr/bin/env node
/**
 * Canonical SD Cancellation Script (QF-20260509-CANCEL-SD)
 *
 * Atomically cancels a Strategic Directive: sets status='cancelled',
 * current_phase='CANCELLED', cancellation_reason, clears claiming_session_id +
 * is_working_on, and releases the corresponding claude_sessions row.
 *
 * Closes feedback 5b5b959e (no canonical cancel-sd.js exists; direct UPDATE
 * leaves claiming_session_id populated → ck_claude_sessions_worktree_state_consistency
 * violations on stale releaseClaim path).
 *
 * Usage:
 *   node scripts/cancel-sd.js <SD-KEY-or-UUID> --reason "<reason>"
 *
 * Examples:
 *   node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "Superseded by SD-BAR"
 *   node scripts/cancel-sd.js f55da615-... --reason "Duplicate of SD-X"
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

// SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001 (PLAN_VERIFICATION
// regression fix): exported + argv-injectable so the sdInput-resolution regression
// (see consumedIdx fix below) is directly testable without mutating process.argv or
// spawning a subprocess.
export function parseArgs(argv = process.argv.slice(2)) {
  const args = argv;
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/cancel-sd.js <SD-KEY-or-UUID> --reason "<reason>" [--pr <number>] [--evidence-file <path>]

Atomically cancels an SD:
  - status='cancelled', current_phase='CANCELLED'
  - cancellation_reason set (required)
  - claiming_session_id cleared
  - is_working_on=false
  - updated_at=NOW (trigger-managed cancellation timestamp)
  - claude_sessions row for the holder released

Required:
  --reason "<text>"   Cancellation reason (cannot be empty)

Optional (REQUIRED when --reason indicates already-shipped/superseded/duplicate-of-merged):
  --pr <number>            PR claimed to supersede/ship the fix — verified MERGED (mergedAt set) on origin, not merely open
  --evidence-file <path>   File claimed present on origin/main (repeatable) — verified via origin/main, never a local branch HEAD
  (SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001: an already-shipped-style cancel with
   neither flag, or whose evidence fails verification, is REFUSED and the SD is left unchanged.)

Examples:
  node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "deprioritized, no longer needed"
  node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "Superseded by SD-BAR-001" --pr 999
  node scripts/cancel-sd.js SD-LEO-FIX-FOO-001 --reason "already shipped via PR #999" --pr 999
  node scripts/cancel-sd.js --help
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : null;
  const prIdx = args.indexOf('--pr');
  const pr = prIdx !== -1 ? args[prIdx + 1] : null;
  const evidenceFiles = [];
  args.forEach((a, i) => { if (a === '--evidence-file' && args[i + 1]) evidenceFiles.push(args[i + 1]); });

  // REGRESSION FIX (PLAN_VERIFICATION, independently caught by VALIDATION + REGRESSION
  // sub-agents): an ABSENT flag's indexOf() is -1, so its "+1" companion is index 0 —
  // exactly where the SD key conventionally sits (`cancel-sd.js <SD-KEY> --reason ...`).
  // Unconditionally seeding the Set with reasonIdx/prIdx (even when -1) poisoned index 0
  // whenever --pr was omitted, breaking the primary documented invocation form. Only add
  // an index pair for a flag that was ACTUALLY found.
  const consumedIdx = new Set();
  if (reasonIdx !== -1) { consumedIdx.add(reasonIdx); consumedIdx.add(reasonIdx + 1); }
  if (prIdx !== -1) { consumedIdx.add(prIdx); consumedIdx.add(prIdx + 1); }
  args.forEach((a, i) => { if (a === '--evidence-file') { consumedIdx.add(i); consumedIdx.add(i + 1); } });
  const sdInput = args.find((a, i) => !a.startsWith('-') && !consumedIdx.has(i));

  if (!sdInput) {
    console.error('❌ Missing SD identifier (sd_key or UUID)');
    process.exit(1);
  }
  if (!reason || reason.trim() === '') {
    console.error('❌ Missing or empty --reason "<text>" (required)');
    process.exit(1);
  }

  return { sdInput, reason: reason.trim(), pr: pr ? pr.trim() : null, evidenceFiles };
}

/**
 * SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001 (FR-1)
 * Pure classifier: does this cancellation reason claim the SD is
 * already-shipped/superseded/duplicate-of-merged (and therefore requires
 * origin/main verification before cancelling)?
 *
 * Deliberately broad (UAT finding, EXEC phase): the original adjacent-phrase-only
 * regex missed realistic rephrasings of the same underlying claim ("merged in
 * #999", "fixed in #999", "resolved by PR 999", "already fixed and merged
 * upstream" — "already" and the verb non-adjacent). Over-classifying is the SAFE
 * direction here (it only asks for --pr/--evidence-file that then must verify;
 * it can never let an unverified already-shipped claim through), so this
 * matches "already" + a ship-style verb ANYWHERE in the text, or a ship-style
 * verb co-occurring with a PR/issue reference (#123 / "PR 123") even without
 * the word "already".
 * @param {string} reason
 * @returns {boolean}
 */
export function classifyShipReason(reason) {
  const text = reason || '';
  if (/superseded|duplicate[\s-]?of[\s-]?merged/i.test(text)) return true;
  // Deep-tier adversarial review finding: the original 6-verb list missed
  // extremely common non-git-jargon ways to claim "this is already done
  // elsewhere" ("already implemented in PR #999", "already done in #999",
  // "already completed and deployed via PR #123") — arguably MORE natural
  // phrasing than "merged", and this classifier is the SOLE enforcement
  // point (no second gate), so a miss here is a full bypass of the guardrail.
  const hasShipVerb = /\b(shipped|merged|fixed|resolved|closed|landed|implemented|completed|delivered|done|built|handled|addressed|covered)\b/i.test(text);
  if (!hasShipVerb) return false;
  if (/\balready\b/i.test(text)) return true;
  return /#\d+|\bPR\s*\d+\b/i.test(text);
}

/**
 * SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001 (FR-3)
 * Verify an already-shipped claim against ORIGIN/MAIN — never a local/branch
 * HEAD. Injectable runners (mirrors lib/worktree-reaper/detectors.js's
 * isPatchEquivalentToMain pattern) so tests never touch live git/gh.
 * Fails CLOSED: any runner error counts as verification failure, not
 * fail-open — the entire point is not trusting an unverifiable claim.
 *
 * @param {{pr?: string|null, evidenceFiles?: string[]}} evidence
 * @param {{runGit: Function, runGh: Function, repoRoot?: string}} runners
 * @returns {{verified: boolean, reasons: string[]}}
 */
export function verifyShippedOnOriginMain({ pr, evidenceFiles = [] } = {}, { runGit, runGh, repoRoot } = {}) {
  const reasons = [];
  let anyCheckRan = false;

  if (pr) {
    anyCheckRan = true;
    // SECURITY (SEC-F1): a bare-digits PR number only — rejects URLs / branch
    // names / anything gh's <number>|<url>|<branch> selector would also accept,
    // which would let a MERGED PR from an unrelated repo satisfy this guardrail.
    if (!/^\d+$/.test(String(pr))) {
      reasons.push(`--pr ${pr}: must be a bare PR number (not a URL or branch name)`);
    } else {
      try {
        const out = runGh(['pr', 'view', String(pr), '--json', 'state,mergedAt'], { cwd: repoRoot });
        if (out.code !== 0) {
          reasons.push(`--pr ${pr}: gh pr view failed (exit ${out.code}): ${(out.stderr || '').trim()}`);
        } else {
          const parsed = JSON.parse(out.stdout || '{}');
          if (parsed.state === 'MERGED' && parsed.mergedAt) {
            // verified
          } else {
            reasons.push(`--pr ${pr}: not merged (state=${parsed.state || 'unknown'}, mergedAt=${parsed.mergedAt || 'null'}) — a local/open PR head does not count as shipped`);
          }
        }
      } catch (err) {
        reasons.push(`--pr ${pr}: gh pr view threw: ${err?.message || err}`);
      }
    }
  }

  for (const file of evidenceFiles) {
    anyCheckRan = true;
    // SECURITY (SEC-F2): reject empty/whitespace paths here too (defense in
    // depth vs. the CLI parser) — an empty path resolves to the root TREE,
    // which `cat-file -t` below would otherwise happily confirm as present.
    if (!file || !file.trim()) {
      reasons.push('--evidence-file: empty path is not valid evidence');
      continue;
    }
    try {
      // SECURITY (SEC-F2): `-t` + require 'blob', not `-e` (which exit-0s for
      // trees/directories too) — "this FILE shipped" must mean a blob, not
      // "some path exists", or any always-present directory (e.g. "scripts")
      // would pass as evidence.
      const out = runGit(['cat-file', '-t', `origin/main:${file}`], { cwd: repoRoot });
      if (out.code !== 0) {
        reasons.push(`--evidence-file ${file}: not found on origin/main`);
      } else if (out.stdout.trim() !== 'blob') {
        reasons.push(`--evidence-file ${file}: not a file on origin/main (type=${out.stdout.trim() || 'unknown'})`);
      }
    } catch (err) {
      reasons.push(`--evidence-file ${file}: git cat-file threw: ${err?.message || err}`);
    }
  }

  if (!anyCheckRan) {
    reasons.push('no evidence supplied (--pr or --evidence-file required for an already-shipped/superseded/duplicate-of-merged cancellation)');
  }

  return { verified: anyCheckRan && reasons.length === 0, reasons };
}

/**
 * SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001 (FR-4, TS-7)
 * Pure decision composing classifyShipReason + verifyShippedOnOriginMain: should
 * this cancellation be refused before touching the SD? A reason that doesn't
 * classify as ship-style is never refused here (FR-5 backward-compat path) —
 * cancelSD() proceeds unchanged for kill/deprioritize/duplicate-of-open reasons.
 * @param {string} reason
 * @param {{pr?: string|null, evidenceFiles?: string[]}} evidence
 * @param {{runGit: Function, runGh: Function, repoRoot?: string}} runners
 * @returns {{refuse: boolean, reasons: string[]}}
 */
export function decideCancelRefusal(reason, evidence, runners) {
  if (!classifyShipReason(reason)) return { refuse: false, reasons: [] };
  const { verified, reasons } = verifyShippedOnOriginMain(evidence, runners);
  return { refuse: !verified, reasons };
}

// SECURITY (SEC-F3): a bounded timeout/maxBuffer so a hung/misbehaving git/gh
// process (network stall on `gh pr view`, a huge repo response) can't hang this
// otherwise-synchronous CLI indefinitely.
const RUNNER_TIMEOUT_MS = 15000;
const RUNNER_MAX_BUFFER = 1024 * 1024;

function defaultRunGit(args, opts = {}) {
  try {
    const stdout = execFileSync('git', args, { encoding: 'utf-8', cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: RUNNER_TIMEOUT_MS, maxBuffer: RUNNER_MAX_BUFFER });
    return { stdout, stderr: '', code: 0 };
  } catch (err) {
    return { stdout: err.stdout ? String(err.stdout) : '', stderr: err.stderr ? String(err.stderr) : String(err.message || err), code: typeof err.status === 'number' ? err.status : 1 };
  }
}

function defaultRunGh(args, opts = {}) {
  try {
    const stdout = execFileSync('gh', args, { encoding: 'utf-8', cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: RUNNER_TIMEOUT_MS, maxBuffer: RUNNER_MAX_BUFFER });
    return { stdout, stderr: '', code: 0 };
  } catch (err) {
    return { stdout: err.stdout ? String(err.stdout) : '', stderr: err.stderr ? String(err.stderr) : String(err.message || err), code: typeof err.status === 'number' ? err.status : 1 };
  }
}

async function resolveSD(input) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, claiming_session_id, is_working_on')
    .or(isUuid ? `id.eq.${input}` : `sd_key.eq.${input}`)
    .limit(1)
    .single();
  if (error || !data) {
    console.error(`❌ SD not found: ${input}`);
    process.exit(1);
  }
  return data;
}

async function cancelSD(sd, reason) {
  if (sd.status === 'cancelled') {
    console.log(`ℹ️  SD ${sd.sd_key} already cancelled (status='cancelled'). No-op.`);
    return false;
  }
  if (sd.status === 'completed') {
    console.error(`❌ Cannot cancel completed SD ${sd.sd_key} (status='completed'). Use a different remediation path.`);
    process.exit(1);
  }

  const claimedSessionId = sd.claiming_session_id;
  // QF-20260509-CANCEL-SD-COLDROP: strategic_directives_v2 has no dedicated
  // cancelled_at column — original PR #3625 INSERT shape included it,
  // causing PGRST204 "Could not find the 'cancelled_at' column" schema-cache
  // error on first canonical use. updated_at is trigger-managed; cancellation
  // timestamp is recoverable from updated_at WHERE status='cancelled'.
  // SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-2): report the closure-loop reset that the
  // trg_reset_patterns_on_sd_cancel trigger performs on this cancel. Read-only count;
  // the trigger does the actual issue_patterns reset (assigned -> active).
  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (b): capture the linked pattern ROWS
  // BEFORE the cancel — trg_reset_patterns_on_sd_cancel nulls assigned_sd_id
  // during the cancel UPDATE, so a post-cancel lookup by assigned_sd_id finds
  // nothing and the suppression would silently no-op.
  let assignedPatternCount = 0;
  let linkedPatterns = [];
  try {
    const { data: linkedRows } = await supabase
      .from('issue_patterns')
      .select('id, pattern_id, metadata')
      .eq('status', 'assigned')
      .in('assigned_sd_id', [sd.id, sd.sd_key].filter(Boolean));
    linkedPatterns = linkedRows || [];
    assignedPatternCount = linkedPatterns.length;
  } catch { /* non-fatal: reporting only */ }

  const updates = {
    status: 'cancelled',
    current_phase: 'CANCELLED',
    cancellation_reason: reason,
    claiming_session_id: null,
    is_working_on: false,
    updated_at: new Date().toISOString(),
  };

  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', sd.id);
  if (sdErr) {
    console.error(`❌ Failed to update SD ${sd.sd_key}:`, sdErr.message);
    process.exit(1);
  }
  console.log(`✓ SD ${sd.sd_key} cancelled (status=cancelled, current_phase=CANCELLED)`);

  // QF-20260525-211 (A1): write an audit_log row so cancellations are visible to the audit
  // stream. Previously the reason landed ONLY in the cancellation_reason column, which
  // coordination tooling does not surface — which is why a cancellation trace appeared
  // missing during investigation. Non-fatal: the SD is already cancelled; a failed audit
  // write should not mask that, but it is surfaced loudly.
  const { error: auditErr } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'sd_cancelled',
      entity_type: 'strategic_directive',
      entity_id: sd.sd_key || sd.id,
      old_value: { status: sd.status, current_phase: sd.current_phase, is_working_on: sd.is_working_on },
      new_value: { status: 'cancelled', current_phase: 'CANCELLED' },
      metadata: { reason, prior_claiming_session: claimedSessionId || null, source: 'cancel-sd.js', assigned_patterns_reset: assignedPatternCount },
      severity: 'warning',
      created_by: 'cancel-sd.js',
    });
  if (auditErr) {
    console.warn(`⚠️  audit_log write for ${sd.sd_key} failed (non-fatal):`, auditErr.message);
  } else {
    console.log(`✓ audit_log: sd_cancelled recorded for ${sd.sd_key}`);
  }

  // SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-2): surface the closure-loop reset.
  if (assignedPatternCount > 0) {
    console.log(`✓ closure-loop: ${assignedPatternCount} assigned issue_pattern(s) reset to active by trg_reset_patterns_on_sd_cancel`);
  }

  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (a/b): cancel-sd ALWAYS records a reason
  // (this CLI requires one) — that reason IS the evidence-cancelled marker. The
  // trigger's assigned->active reset RE-ARMS the alert creator (cancel -> active ->
  // threshold -> re-file: two PAT-FIX storms on 2026-06-12). Override the reset:
  // resolve linked pattern(s) with an auditable disposition so the family never
  // re-files. Genuinely NEW post-cancel occurrences still re-escalate via the
  // creator's recency check against the disposition timestamp.
  if (assignedPatternCount > 0) {
    try {
      // Use the PRE-cancel snapshot (linkedPatterns): the trigger already
      // nulled assigned_sd_id, so re-querying by it would return nothing.
      const linked = linkedPatterns;
      let suppressed = 0;
      for (const p of linked || []) {
        // Re-read metadata by id (id survives the trigger reset) so the
        // trigger's last_cancelled_assignment breadcrumb is preserved.
        const { data: freshRow } = await supabase
          .from('issue_patterns').select('metadata').eq('id', p.id).single();
        const { error: supErr } = await supabase
          .from('issue_patterns')
          .update({
            status: 'resolved',
            metadata: {
              ...((freshRow || p).metadata || {}),
              disposition: {
                kind: 'evidence_cancelled_suppressed',
                cancelled_sd: sd.sd_key,
                cancellation_reason: String(reason).slice(0, 500),
                stamped_at: new Date().toISOString(),
                stamped_by: 'cancel-sd.js (SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001)'
              }
            }
          })
          .eq('id', p.id);
        if (!supErr) suppressed++;
      }
      console.log(`✓ closure-loop: ${suppressed} linked pattern(s) resolved with evidence_cancelled_suppressed disposition (no re-file)`);
    } catch (e) {
      console.warn(`⚠️  pattern suppression failed (non-fatal — reconcile sweep is the backstop): ${e.message}`);
    }
  }

  // Release the holder's claude_sessions row, if any.
  // QF-20260525-211 (A2): VERIFIED release. A fire-and-forget warn-and-swallow could silently
  // fail (e.g. a CHECK violation returning 204) and leave the dangling claim that feeds the
  // stale-session-sweep CLAIM_FIX churn. A genuine error is now fatal so the caller knows the
  // claim was NOT released. (Zero rows affected is expected & fine — the holder already moved on.)
  if (claimedSessionId) {
    const { data: releasedRows, error: csErr } = await supabase
      .from('claude_sessions')
      .update({
        status: 'released',
        sd_key: null,
        worktree_path: null,
        worktree_branch: null,
        released_at: new Date().toISOString(),
      })
      .eq('session_id', claimedSessionId)
      .eq('sd_key', sd.sd_key)  // only release if THIS SD was the active claim
      .select('session_id');
    if (csErr) {
      console.error(`❌ claude_sessions release for ${claimedSessionId.slice(0, 8)} FAILED:`, csErr.message);
      console.error('   SD is cancelled but its claim was NOT released — the dangling claim will feed sweep churn. Resolve manually.');
      process.exit(1);
    } else if (releasedRows && releasedRows.length > 0) {
      console.log(`✓ Released claude_sessions row for holder ${claimedSessionId.slice(0, 8)}`);
    } else {
      console.log(`ℹ️  Holder ${claimedSessionId.slice(0, 8)} no longer claimed ${sd.sd_key} (already released) — nothing to do.`);
    }
  }

  return true;
}

async function main() {
  const { sdInput, reason, pr, evidenceFiles } = parseArgs();
  const sd = await resolveSD(sdInput);

  console.log(`SD: ${sd.sd_key} — ${sd.title?.slice(0, 80)}`);
  console.log(`  Current status: ${sd.status} / phase: ${sd.current_phase}`);
  console.log(`  Claim: ${sd.claiming_session_id ? sd.claiming_session_id.slice(0, 8) : '(none)'}`);
  console.log(`  Reason: ${reason}`);
  console.log('');

  // SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001 (FR-2/FR-3/FR-4):
  // an already-shipped/superseded/duplicate-of-merged reason must verify against
  // ORIGIN/MAIN before the SD is touched — never trust a local/branch HEAD.
  if (classifyShipReason(reason)) {
    const { refuse, reasons } = decideCancelRefusal(
      reason,
      { pr, evidenceFiles },
      { runGit: defaultRunGit, runGh: defaultRunGh }
    );
    if (refuse) {
      console.error('❌ REFUSED: cancellation reason claims already-shipped/superseded/duplicate-of-merged, but verification against origin/main failed:');
      for (const r of reasons) console.error(`   - ${r}`);
      console.error('\nSupply --pr <merged-PR-number> and/or --evidence-file <path-present-on-origin/main>. The SD is unchanged.');
      process.exit(1);
    }
    console.log('✓ Ship verification passed against origin/main (not a local/branch HEAD)');
  }

  const changed = await cancelSD(sd, reason);
  if (changed) {
    console.log('\n✅ Cancellation complete.');
  }
}

// SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001: guard so the pure
// exports (classifyShipReason, verifyShippedOnOriginMain) can be imported for unit
// testing without triggering main()'s process.exit() side effects — mirrors
// scripts/ci/red-merge-detector.mjs's isMain pattern.
const isMain = process.argv[1] && import.meta.url.endsWith('cancel-sd.js') && process.argv[1].endsWith('cancel-sd.js');
if (isMain) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
