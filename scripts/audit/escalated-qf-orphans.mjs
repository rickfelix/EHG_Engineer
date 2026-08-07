#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-3 — surface escalated quick-fixes that nothing
 * inherits.
 *
 * A QF at status='escalated' with escalated_to_sd_id=NULL leaves nothing carrying its work. It is
 * not on the belt (escalated is not claimable), it is not linked to an SD, and no sweep looks at it,
 * so it is invisible to every surface a human or a worker actually reads. Measured 2026-07-28:
 * 16 of 55 escalated rows, three of them critical, the oldest stranded since 2026-07-05.
 *
 * WHY THIS EXISTS AS A REPORT RATHER THAN A TRIGGER. The SD proposed following the resolution_sd_id
 * precedent (an auto-link DB trigger). Measurement says that fixes the SMALLER half:
 *
 *     LINK-DROPPED  an SD exists, escalated_to_sd_id is null   ->  2 of 16
 *     NEVER-CREATED no SD references the QF at all             -> 14 of 16
 *
 * A trigger links an SD at creation time. Fourteen of these never had an SD created, because a
 * Tier-3 QF is BORN escalated (scripts/create-quick-fix.js:350) before any SD exists and nothing
 * afterwards converts it. An auto-link trigger would therefore look like a complete fix while
 * moving 12% of the problem — and CREATE TRIGGER is not on the TIER-1 auto-apply allow list, so it
 * is chairman-gated DDL besides. This report needs no DDL and addresses the larger half.
 *
 * WHAT IT WILL NOT DO: it never creates an SD. Workers do not materialise SDs; that is the
 * coordinator's role. The output is a work-list for materialisation, deliberately.
 *
 * Usage:
 *   node scripts/audit/escalated-qf-orphans.mjs              # report
 *   node scripts/audit/escalated-qf-orphans.mjs --json       # machine-readable
 *   node scripts/audit/escalated-qf-orphans.mjs --repair-links  # write the link for LINK-DROPPED only
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Pure: order orphans so the rows that matter surface first — severity, then age.
 * Exported for test; sorting is where a report quietly buries its own findings.
 */
export function rankOrphans(rows) {
  return [...(rows || [])].sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

/**
 * Pure: classify an orphan by whether any SD already references it.
 *
 * LINK-DROPPED is repairable mechanically — the SD exists, only the pointer is missing.
 * NEVER-CREATED is not: it needs a human or coordinator to decide the work is still wanted.
 * Conflating them is what makes an auto-link trigger look like a complete fix.
 */
export function classifyOrphan(referencingSdKeys) {
  return (referencingSdKeys || []).length > 0 ? 'LINK_DROPPED' : 'NEVER_CREATED';
}

/**
 * Pure: SD keys named INSIDE the quick-fix's own title/description.
 *
 * THE REVERSE DIRECTION, and it was found by reading this report's own output rather than trusting
 * it. The SD-side text search asks "does an SD mention this QF". QF-20260722-214 is titled
 * "[Retro action items] SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001" — the QF names the SD, not the other
 * way round — and that SD exists and is COMPLETED. A one-directional matcher classified a QF whose
 * work is already finished as NEVER_CREATED, i.e. as needing materialisation.
 *
 * That is the same defect class this report exists to surface: a check that can only see one
 * direction reports the other as absent. Both directions are now searched.
 */
export function sdKeysNamedInQf(qf) {
  const text = `${qf?.title || ''} ${qf?.description || ''} ${qf?.escalation_reason || ''}`;
  const matches = text.match(/\bSD-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g) || [];
  return [...new Set(matches)];
}

async function findReferencingSds(supabase, qfId) {
  // Text match on title/description. STATED LIMITATION, not a footnote: an SD can be doing this
  // work WITHOUT naming the QF, and such a row lands in NEVER_CREATED wrongly. So NEVER_CREATED is
  // an UPPER bound and LINK_DROPPED a LOWER bound. Absence of a text match is not proof no SD
  // exists, and this report must not be read as if it were.
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key,status')
    .or(`description.ilike.%${qfId}%,title.ilike.%${qfId}%`)
    .limit(5);
  if (error) throw new Error(`SD lookup failed for ${qfId}: ${error.message}`);
  return (data || []).map((r) => ({ sd_key: r.sd_key, status: r.status }));
}

async function main() {
  const json = process.argv.includes('--json');
  const repair = process.argv.includes('--repair-links');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: escalated, error } = await supabase
    .from('quick_fixes')
    .select('id,severity,title,created_at,escalated_to_sd_id,escalation_reason');
  if (error) {
    console.error(`FAILED to read quick_fixes: ${error.message}`);
    process.exit(1);
  }
  const all = (escalated || []).filter((r) => r.escalated_to_sd_id !== undefined);
  const { data: esc, error: e2 } = await supabase
    .from('quick_fixes')
    .select('id,severity,title,description,created_at,escalated_to_sd_id,escalation_reason')
    .eq('status', 'escalated');
  if (e2) {
    console.error(`FAILED to read escalated quick_fixes: ${e2.message}`);
    process.exit(1);
  }

  const orphans = rankOrphans((esc || []).filter((r) => !r.escalated_to_sd_id));
  const findings = [];
  for (const qf of orphans) {
    // BOTH directions. SD-mentions-QF, and QF-mentions-SD — the second was added after this very
    // report misclassified QF-20260722-214, whose own title names a completed SD.
    const sds = await findReferencingSds(supabase, qf.id);
    for (const key of sdKeysNamedInQf(qf)) {
      if (sds.some((s) => s.sd_key === key)) continue;
      const { data: named } = await supabase
        .from('strategic_directives_v2').select('sd_key,status').eq('sd_key', key).maybeSingle();
      if (named) sds.push({ sd_key: named.sd_key, status: named.status, via: 'named_in_qf' });
    }
    findings.push({ ...qf, referencing_sds: sds, kind: classifyOrphan(sds) });
  }

  const dropped = findings.filter((f) => f.kind === 'LINK_DROPPED');
  const never = findings.filter((f) => f.kind === 'NEVER_CREATED');

  if (json) {
    console.log(JSON.stringify({
      escalated_total: (esc || []).length,
      orphans: findings.length,
      link_dropped: dropped.length,
      never_created: never.length,
      caveat: 'never_created is an UPPER bound: matched by text on SD title/description, so an SD doing the work without naming the QF lands here wrongly.',
      findings
    }, null, 2));
  } else {
    console.log(`\nESCALATED QF ORPHANS — ${findings.length} of ${(esc || []).length} escalated rows have no escalated_to_sd_id\n`);
    console.log(`  LINK-DROPPED  ${dropped.length}  (an SD exists; only the pointer is missing — mechanically repairable)`);
    console.log(`  NEVER-CREATED ${never.length}  (no SD references it; needs materialisation, which is a coordinator decision)\n`);
    for (const f of findings) {
      const refs = f.referencing_sds.map((s) => s.sd_key).join(', ');
      console.log(`  ${String(f.severity).toUpperCase().padEnd(8)} ${f.id}  ${String(f.created_at).slice(0, 10)}  ${f.kind}`);
      console.log(`           ${String(f.title || '').slice(0, 100)}`);
      if (refs) console.log(`           -> referenced by: ${refs}`);
    }
    console.log('\n  CAVEAT: NEVER-CREATED is an UPPER bound. Matching is by text on SD title/description,');
    console.log('  so an SD doing this work without naming the QF is classified here wrongly. Absence of a');
    console.log('  text match is not proof that no SD exists.\n');
  }

  if (repair) {
    // ── DISABLED. The SECURITY sub-agent found this write to be WRONG, not merely risky. ────────
    //
    // It was never run in production. It is disabled rather than deleted so the reasoning survives
    // next to the code, and re-enabling requires answering the three defects below.
    //
    // S1 (HIGH) — IT WROTE A FALSE INHERITANCE. classifyOrphan treats "an SD is referenced" as
    // "an SD inherits this work", but sdKeysNamedInQf() evidences only that a QF MENTIONS an SD.
    // Simulated read-only over the real 18 orphans: 12 resolvable pairs, ALL targeting SDs with
    // status='completed', of which exactly ONE would have landed —
    // QF-20260722-214 -> SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001 — and it is BACKWARDS: that QF was
    // auto-promoted FROM that SD's retrospective, six hours AFTER it, and its work is to re-run
    // that SD's blocking sub-agents. So the single successful "repair" would have converted
    // "nobody picked this up" into "handled" — verbatim what the comment below promises to avoid.
    // A report written to detect false completion contained a repair that manufactured it.
    //
    // S2 (HIGH) — WRONG KEY SPACE. escalated_to_sd_id is TEXT with an FK to
    // strategic_directives_v2(id); all 41 existing values are UUID-shaped. This wrote .sd_key,
    // which succeeds ONLY on legacy rows where id == sd_key, depositing a second dialect beside
    // the UUIDs. The FK rejected 11 of 12 — correctness by accident. Worse, failures only printed:
    // the exit code keyed off criticalNever alone, so 11 failed writes still exited 0.
    //
    // Also unresolved: 4 QFs resolve MORE THAN ONE candidate SD, and [0] picked from an unordered
    // .limit(5) query is arbitrary.
    //
    // TO RE-ENABLE, all three must hold: write .id not .sd_key; take the target from a real
    // inheritance signal rather than a text mention; refuse when the target is completed/cancelled
    // or when >1 candidate resolves. Failures must also reach the exit code.
    console.error('\n  --repair-links is DISABLED (see the comment in this file).');
    console.error('  It wrote a MENTION as if it were an INHERITANCE, and wrote sd_key into a column whose FK targets id.');
    console.error('  Simulated over the live data: 1 write would land and it is backwards; 11 of 12 would fail while still exiting 0.');
    console.error(`  ${dropped.length} link-dropped and ${never.length} never-created orphans remain, unmodified and still listed above.`);
    process.exit(3);
  }

  // Exit non-zero when a CRITICAL orphan is unreferenced — a report nobody notices is the failure
  // mode this SD is about, so the critical case is made loud rather than printed politely.
  const criticalNever = never.filter((f) => f.severity === 'critical');
  if (criticalNever.length > 0 && !json) {
    console.log(`  ${criticalNever.length} CRITICAL orphan(s) with no SD at all: ${criticalNever.map((f) => f.id).join(', ')}\n`);
  }
  process.exit(criticalNever.length > 0 ? 2 : 0);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
