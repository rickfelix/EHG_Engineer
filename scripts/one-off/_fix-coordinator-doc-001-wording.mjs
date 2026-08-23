// SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 — SECURITY EXEC-TO-PLAN finding (MEDIUM, DOC-001 wording).
//
// The never-do block's DOC-001 clause said "never create SDs/QFs yourself" with no
// qualification, contradicting the same file's own "Coordinator standing responsibilities"
// duty 2 text ("the coordinator materializes from Adam's proposal when Adam hands a spec")
// and CLAUDE_ADAM.md's framing ("the coordinator is DOC-001-barred from asking a *worker*
// to create SDs"). The actual boundary DOC-001 encodes is: SDs/QFs are only created through
// canonical scripts, sourcing (what to build) is Adam's lane, and the coordinator never asks
// a *worker* to create one directly — but the coordinator running the canonical materialization
// script against an Adam-authored spec is explicitly authorized, not a violation.
//
// This script corrects the DOC-001 clause text in the never-do block (row 634, landed by
// scripts/protocol/coordinator-contract-land.mjs) to remove the self-contradiction, then the
// caller regenerates CLAUDE_COORDINATOR.md / CLAUDE_COORDINATOR_DIGEST.md and re-runs the
// drift check. Dry-run by default; pass --apply to write.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const ROW_ID = 634;

const OLD_LINE =
  "3. **DOC-001 — never create SDs/QFs yourself.** Materialization uses canonical scripts only (`node scripts/leo-create-sd.js`, or Adam's proposal-materialization path); sourcing is Adam's lane, dispatch is yours.";

const NEW_LINE =
  "3. **DOC-001 — never create SDs/QFs by hand, or ask a *worker* to create one.** SDs/QFs are only created through canonical scripts (`node scripts/leo-create-sd.js`, or Adam's proposal-materialization path) — Adam materializes directly, or you materialize FROM Adam's spec when he hands you one; either way sourcing (what to build) is Adam's lane and dispatch (rank/eligibility/claim-release) is always yours.";

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: fetchErr } = await supabase
    .from('leo_protocol_sections')
    .select('id, content')
    .eq('id', ROW_ID)
    .single();

  if (fetchErr) {
    console.error('[FETCH FAILED]', fetchErr.message);
    process.exit(1);
  }

  if (!row.content.includes(OLD_LINE)) {
    console.error('[STALE] Row 634 content does not contain the expected OLD_LINE verbatim — refusing to proceed (content may have changed since this script was written).');
    console.error('--- Current content (first 2000 chars) ---');
    console.error(row.content.slice(0, 2000));
    process.exit(1);
  }

  const newContent = row.content.replace(OLD_LINE, NEW_LINE);

  console.log('[OK] Found OLD_LINE in row 634. New content length:', newContent.length, '(was', row.content.length, ')');
  console.log('--- NEW clause 3 ---');
  console.log(NEW_LINE);

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to write this change.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', ROW_ID);

  if (updateErr) {
    console.error('[UPDATE FAILED]', updateErr.message);
    process.exit(1);
  }

  console.log('[APPLIED] Row 634 updated.');
}

if (isMainModule(import.meta.url)) {
  main();
}
