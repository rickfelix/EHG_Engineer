import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G';

const CORRECTED_SUCCESS_CRITERIA = [
  {
    criterion: "A role seat (Solomon, Adam, or coordinator) that has compacted (auto OR manual PreCompact) and then attempts ordinary work without re-reading its contract is refused or flagged, checked via protocolFileReadStatus/contract_last_read_at (the tracker the per-seat register scripts actually read) compared against ~/.claude/flags/last-compaction.json (the one marker the real wired PreCompact hook writes on every firing) -- NOT via protocolGate.fileReads, which role registers never consult.",
    measure: "A synthetic role-seat session records a real compaction via the actual PreCompact path (not the manual /context-compact-only recordCompaction()), then attempts ordinary work with no re-read, and the attempt is refused or flagged. Baseline measured 2026-09-03/re-verified 2026-09-07: this case passes SILENTLY for all three role seats today, because core-protocol-gate only fires at a handoff and role seats never run handoffs; separately, protocolGate.fileReads (what core-protocol-gate reads) is a different, disconnected tracker from protocolFileReadStatus (what the role registers read)."
  },
  {
    criterion: "The window between a compaction and the next handoff is no longer unguarded for workers either",
    measure: "A test drives a worker session that compacts and then performs ordinary work before any handoff, and asserts the cleared-reads state is enforced at that point rather than deferred to the phase boundary. Baseline: enforcement fires only at the handoff, so a worker can operate for an arbitrary interval with cleared reads."
  },
  {
    criterion: "Enforcement does not depend on self-authored prompt text surviving a seat rotation, and does not depend on a seat having its own quiet-tick script",
    measure: "The check is asserted from code (scripts/hooks/protocol-file-tracker.cjs, a PostToolUse hook already wired for every session including Solomon, which has no quiet-tick host) or a scheduled probe (matching the role-capture-gate.mjs + GHA-cron pattern, which already proves Solomon is checkable without a dedicated tick script), not from a cron prompt string. A test proves it fires for a seat whose tick prompt contains no re-read instruction at all, which is the rotation case that produced the 2026-09-02 miss."
  },
  {
    criterion: "LEAD-CORRECTED (was vacuous as originally written -- see LEAD premise correction in description): the EXISTING worker-at-handoff countermeasure (core-protocol-gate.js reading protocolGate.fileReads, cleared only by the dead-on-auto-path recordCompactionEvent()/manual-only protocol-compaction-hook.cjs recordCompaction()) is preserved UNCHANGED and NARROWLY -- QF-20260524-337's deliberate preservation of protocolGate across the real PreCompact hook (precompact-snapshot.ps1) is NOT reversed. This SD's new role-seat enforcement reads a SEPARATE tracker (protocolFileReadStatus, criterion 1) and does not require protocolGate.fileReads to ever clear on auto-compaction.",
    measure: "A regression test asserts (a) the worker-at-handoff path via protocolGate.fileReads is byte-for-byte unchanged, and (b) QF-20260524-337's own regression test (post-compaction /sd-create no longer false-blocks) still passes -- naming BOTH compaction paths (manual /context-compact vs automatic PreCompact) explicitly rather than the single unqualified assertion in the original wording, which passed vacuously by only ever exercising the manual path."
  }
];

const LEAD_CORRECTION_NOTE = `

---
LEAD PREMISE CORRECTION (2026-09-07, Alpha-5 worker session bc70bff7, per VALIDATION evidence
row 21ff50fc-f5c8-4c80-b02b-a21756b8501f confidence=88 and Explore evidence row
e95179c6-e678-4d78-bc0e-72f31e2254ee confidence=90, both phase=LEAD):

The original premise ("the good half already works: recordCompaction() clears
protocolGate.fileReads and this is not being replaced") is FALSE for automatic compaction, the
DOMINANT path. Verified: recordCompactionEvent() (core-protocol-gate.js:392-429) has zero
callers; the peer protocol-compaction-hook.cjs recordCompaction() is reachable only from the
MANUAL /context-compact slash command; the actual wired PreCompact hook
(precompact-snapshot.ps1, .claude/settings.json:19-27) fires on both manual and automatic
compaction but does NOT call either recordCompaction*() -- it deliberately PRESERVES
protocolGate (QF-20260524-337) and never stamps lastCompactionAt.

FOUR LEAD DECISIONS answering the evidence's blocking questions, made here so PLAN can write a
defensible PRD:

Q1 (preserve/narrow/reverse QF-20260524-337?) -> NARROW. Do not reverse the QF-337
preservation (that would reopen its regression). The new role-seat enforcement reads a
DIFFERENT tracker (protocolFileReadStatus, see Q2) and therefore does not need
protocolGate.fileReads to clear on auto-compaction at all.

Q2 (which tracker is authoritative for a role-seat contract read?) -> protocolFileReadStatus /
contract_last_read_at (written by scripts/hooks/protocol-file-tracker.cjs, read by
adam-register.cjs / solomon-register.cjs / coordinator-startup-check.mjs). protocolGate.fileReads
remains authoritative ONLY for the existing worker-at-handoff path (core-protocol-gate.js),
unchanged.

Q3 (seat roster) -> CONFIRMED as originally commissioned: Solomon, Adam, coordinator. Michael
(formalized 2026-09-03, after this SD was authored) is explicitly OUT OF SCOPE for this SD --
its quiet-tick can be added to the same seat-agnostic host in a future SD if needed. Solomon's
lack of a dedicated quiet-tick script is NOT a blocker: the recommended host
(protocol-file-tracker.cjs) is a PostToolUse hook that already fires for every session
including Solomon, independent of any per-seat tick script; role-capture-gate.mjs +
.github/workflows/role-capture-gate-cron.yml is direct prior art proving Solomon is checkable
without one.

Q4 (is the auto-compaction path in scope?) -> YES, it is the path that matters most (it is the
dominant, default compaction mode). Success criterion 4 is corrected above to name both
compaction paths explicitly and to stop asserting a single vacuous claim.

PLAN should build the PRD around: protocol-file-tracker.cjs (already tracks all role contract
files, already wired PostToolUse) + the role-capture-gate.mjs pattern (check-at-recurring-choke,
GHA-cron backstop for Solomon) as the no-new-machinery host, comparing
protocolFileReadStatus/contract_last_read_at against ~/.claude/flags/last-compaction.json
(filtered by the session's own sessionId field, since that marker file is shared per-machine).`;

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('description')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (current.description.includes('LEAD PREMISE CORRECTION')) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      success_criteria: CORRECTED_SUCCESS_CRITERIA,
      description: current.description + LEAD_CORRECTION_NOTE,
    })
    .eq('sd_key', SD_KEY);

  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  const { data: verify } = await supabase
    .from('strategic_directives_v2')
    .select('description, success_criteria')
    .eq('sd_key', SD_KEY)
    .single();

  console.log('Updated. Description contains correction note:', verify.description.includes('LEAD PREMISE CORRECTION'));
  console.log('success_criteria count:', verify.success_criteria.length);
  console.log('Criterion 4 corrected:', verify.success_criteria[3].criterion.includes('LEAD-CORRECTED'));
}

if (isMainModule(import.meta.url)) {
  main();
}
