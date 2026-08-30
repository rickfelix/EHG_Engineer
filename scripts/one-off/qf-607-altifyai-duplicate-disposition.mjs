// QF-20260830-607 — disposition path (a) ONLY, data-only. Executes exactly one bounded,
// reversible single-row UPDATE on the already-soft-deleted duplicate AltifyAI application row.
//
// MEASUREMENT (done before this write): every real name-resolution consumer of `applications`
// already prefers the live/active row over a soft-deleted one (lib/repo-paths.js both fns,
// lib/eva/bridge/venture-provisioner.js via .is('deleted_at', null), lib/fleet/qf-repo-fitness.js
// and lib/fleet/qf-target-application.js via .eq('status','active')). The two remaining
// first-match consumers with no status/deleted_at filter (lib/sd-creation/pipeline.js:1267,
// scripts/reroute-venture-to-bridge.mjs:77) only use the query result as an EXISTS check
// (insert-if-absent) — they never read which duplicate's id/fields they matched, so first-match
// ambiguity has zero behavioral consequence there.
//
// f37300af-013b-4976-a3b1-2bba043d3fa8 (the "inactive" twin) was ALREADY soft-deleted
// (deleted_at=2026-08-29T10:44:16Z) before this QF was filed — but its deletion_reason describes
// an UNRELATED gate_boundary_config/S23->S24 fix, not the duplicate-identity disposition. That
// mismatch is itself a data-quality gap this QF closes: the row IS the archived duplicate twin,
// but nothing on it says so, so a future reader would misdiagnose why it's tombstoned or attempt
// to "revert" an unrelated change. This script corrects deletion_reason + appends metadata
// cross-referencing the surviving canonical row and this QF — data-only, single row, reversible
// (deleted_at/deleted_by/status are left untouched, matching the QF's "archive means archive,
// prefer reversible" caution).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DUP_ID = 'f37300af-013b-4976-a3b1-2bba043d3fa8';
const CANONICAL_ID = '75c6da62-a9ad-4f07-a5df-ab91eeeff8d0';

async function main() {
  // 1. BOUNDED PRE-WRITE CHECK — print count + sample before any write.
  const { data: pre, error: preErr } = await sb.from('applications').select('id, name, status, deleted_at, deletion_reason').eq('id', DUP_ID);
  if (preErr) throw preErr;
  console.log(`[qf-607] pre-write target row count=${pre.length}`);
  console.log(JSON.stringify(pre, null, 2));
  if (pre.length !== 1) throw new Error(`expected exactly 1 target row, found ${pre.length} — refusing to write`);
  if (!pre[0].deleted_at) throw new Error('target row is not soft-deleted — out of scope for this data-only correction, refusing to write');

  const newReason =
    'DUPLICATE-IDENTITY DISPOSITION (QF-20260830-607, disposition path (a) — data-only, ' +
    'archive/deprecate, no DDL): this row is a byte-identical-identity duplicate of ' +
    `${CANONICAL_ID} (AltifyAI) — census docs/architecture/fleet-liveness-predicate-consumer-` +
    'census.md C4. It was already soft-deleted before this QF (see original deleted_at/deleted_by ' +
    'below, preserved unchanged) via an unrelated bulk gate_boundary_config action — the ORIGINAL ' +
    'deletion_reason described that unrelated fix, not this disposition, which misattributed why ' +
    'the row is archived. Every live name-resolution consumer already prefers the canonical row ' +
    '(status=active, deleted_at IS NULL); the two first-match consumers with no status filter ' +
    '(lib/sd-creation/pipeline.js, scripts/reroute-venture-to-bridge.mjs) only use the query as an ' +
    'existence check, so first-match ambiguity has no behavioral effect. Superseded by: ' +
    `${CANONICAL_ID}. Original deletion_reason preserved in metadata.original_deletion_reason.`;

  const { data: preMeta } = await sb.from('applications').select('metadata').eq('id', DUP_ID).maybeSingle();
  const meta = preMeta?.metadata && typeof preMeta.metadata === 'object' && !Array.isArray(preMeta.metadata) ? preMeta.metadata : {};

  const patch = {
    deletion_reason: newReason,
    metadata: {
      ...meta,
      original_deletion_reason: pre[0].deletion_reason,
      qf_607_disposition_at: new Date().toISOString(),
      superseded_by: CANONICAL_ID,
    },
  };

  // 2. SINGLE-ROW, ID-SCOPED WRITE.
  const { error: upErr } = await sb.from('applications').update(patch).eq('id', DUP_ID);
  if (upErr) throw upErr;

  // 3. READBACK VERIFY.
  const { data: post, error: postErr } = await sb.from('applications').select('id, status, deleted_at, deletion_reason, metadata').eq('id', DUP_ID).maybeSingle();
  if (postErr) throw postErr;
  console.log('[qf-607] readback after write:');
  console.log(JSON.stringify(post, null, 2));
  if (post.deletion_reason !== newReason) throw new Error('readback mismatch on deletion_reason — write did not persist as expected');
  if (post.status !== 'inactive' || !post.deleted_at) throw new Error('readback shows status/deleted_at changed — was expected to stay untouched');

  // 4. REGRESSION: duplicate-identity check restricted to LIVE rows only (deleted_at IS NULL) —
  // the definition that matters for name-resolution, matching every real consumer's own filter.
  const { data: live, error: liveErr } = await sb.from('applications').select('id, name, local_path, github_repo, status').ilike('name', '%altify%').is('deleted_at', null);
  if (liveErr) throw liveErr;
  console.log(`[qf-607] LIVE (deleted_at IS NULL) AltifyAI rows: ${live.length}`);
  console.log(JSON.stringify(live, null, 2));
  if (live.length !== 1) throw new Error(`expected exactly 1 live AltifyAI row post-fix, found ${live.length}`);

  console.log('[qf-607] DONE — single-row deletion_reason correction persisted, readback-verified, live-row duplicate count = 1.');
}

main().catch((e) => { console.error('[qf-607] FAILED:', e.message); process.exit(1); });
