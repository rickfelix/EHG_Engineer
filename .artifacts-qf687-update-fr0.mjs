import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '7b8be04e-1f2b-431c-b33d-4574013a94e5';

const { data: row, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', SD_ID)
  .maybeSingle();

if (readErr) throw new Error(`read failed: ${readErr.message}`);
if (!row) throw new Error('SD row not found');

const metadata = row.metadata || {};
const artifact = metadata.fr0_falsifier_artifact;
if (!artifact) throw new Error('fr0_falsifier_artifact missing -- refusing to invent a new shape');

const steps = artifact.steps.map((s) => {
  if (s.step !== 4) return s;
  return {
    ...s,
    result: 'CONFIRMED FAIL (chairman live session, 2026-08-19T17:24Z) -- improvement shipped, root cause UNCONFIRMED',
    evidence:
      s.evidence +
      ' UPDATE (QF-20260819-687, 2026-08-19T18:59Z): chairman confirmed live -- signed-in /dashboard showed ' +
      '"Usage Analytics -- Something went wrong loading your usage history" (GET /api/events non-OK/non-401, or ' +
      'response.json() throwing on an OK response -- src/ui/UsageDashboard.jsx line ~58-68 shows the identical message ' +
      'for either). Diagnosed via read-only reproduction of the exact parametrized queries against live D1 with the ' +
      'chairman\'s real clerk_user_id/internal id (github.com/rickfelix/altifyai/actions/runs/32289022035): SQL/schema/data ' +
      'is DEFINITIVELY NOT the fault (both queries succeed cleanly, FK enforcement ON, no dupes) -- this rules out Adam\'s ' +
      'prior schema/data hypothesis. JWT verification and HTTP response wrapping also cleared by direct code reading. ' +
      'Shipped PR github.com/rickfelix/altifyai/pull/52 (merged 5bbdb390e0c07e683e7ef2fb7e5eb8b24336ed9b, deployed ' +
      'successfully, run 32290450082): explicit name/message/stack logging in place of bare-Error console.error calls, ' +
      'since Error.prototype.message/stack are non-enumerable and were likely silently dropped by structured-log ' +
      'serialization despite [observability] being enabled specifically to make these retrievable. This MAY be the fix, ' +
      'or may only make the next occurrence diagnosable -- cannot distinguish without a live authenticated repro. ' +
      'BLOCKED on that: the only existing real-session tool (@clerk/testing + Playwright, QF-20260817-833) performs a ' +
      'real /register flow each run, disqualified by the standing never-create-accounts constraint. QF-20260819-687 left ' +
      'in_progress (not force-completed) pending either a genuine existing-user Clerk test fixture or one more chairman ' +
      'reload with the improved logging live.',
  };
});

const updatedArtifact = {
  ...artifact,
  steps,
  qf_20260819_687_update: {
    at: '2026-08-19T18:59:00.000Z',
    by: 'Golf-5 fork (session 42d805b8)',
    pr_url: 'https://github.com/rickfelix/altifyai/pull/52',
    merge_commit: '5bbdb390e0c07e683e7ef2fb7e5eb8b24336ed9b',
    status: 'shipped_unconfirmed',
    summary:
      'Schema/data hypothesis definitively ruled out via live-D1 reproduction with real production values. ' +
      'Shipped explicit error-detail logging (name/message/stack) to close a likely observability gap. Root cause ' +
      'of the reported symptom NOT confirmed -- blocked on the same M2 gap (no sanctioned existing-user auth fixture) ' +
      'the PLAN-phase Oracle completeness check already flagged as systemic.',
  },
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...metadata, fr0_falsifier_artifact: updatedArtifact } })
  .eq('id', SD_ID);

if (writeErr) throw new Error(`write failed: ${writeErr.message}`);

console.log('OK: fr0_falsifier_artifact updated (step 4 + qf_20260819_687_update block)');
