#!/usr/bin/env node
/**
 * amend-stage17-retrospectives.mjs
 *
 * Appends a Stage 17 cross-repo amendment to the metadata.amendments JSONB
 * array of all retrospectives belonging to the 3 source SDs whose backend
 * refactors caused the desync class fixed by QF-20260425-423/130/422.
 *
 * Idempotent: skips retros that already have an amendment from this SD.
 *
 * SD-LEO-INFRA-STAGE17-CROSS-REPO-001 — Arm E
 *
 * Run:
 *   node scripts/amend-stage17-retrospectives.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SOURCE_SD_KEYS = [
  'SD-MAN-REFAC-S17-SIMPLIFY-FRONTEND-001',
  'SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001',
  'SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001'
];

const AMENDED_BY_SD = 'SD-LEO-INFRA-STAGE17-CROSS-REPO-001';

const AMENDMENT_TEMPLATE = {
  amended_at: new Date().toISOString(),
  amended_by_sd: AMENDED_BY_SD,
  downstream_qfs: ['QF-20260425-423', 'QF-20260425-130', 'QF-20260425-422'],
  downstream_prs: ['rickfelix/ehg#525', 'rickfelix/ehg#526', 'rickfelix/ehg#527'],
  cross_repo_verification_added: true,
  lessons_learned:
    'This Stage 17 backend refactor shipped without a paired-update gate against the EHG frontend, causing 3 same-day QFs (schema mismatch, dropped buttons + stale 6→4 hardcode, stale /api/stitch/ URL prefix). Drift-detection infrastructure (cross-repo URL audit, contract doc, twinned CI workflow, CODEOWNERS rule) shipped via SD-LEO-INFRA-STAGE17-CROSS-REPO-001 to prevent recurrence.'
};

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolve UUIDs for the 3 source SDs
const { data: sds, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .in('sd_key', SOURCE_SD_KEYS);

if (sdErr) {
  console.error('amend-stage17-retrospectives: source SD lookup FAILED:', sdErr.message);
  process.exit(1);
}

const uuids = sds.map((s) => s.id);
if (uuids.length !== SOURCE_SD_KEYS.length) {
  console.warn(
    `WARN: expected ${SOURCE_SD_KEYS.length} source SDs, found ${uuids.length}. ` +
    `Missing: ${SOURCE_SD_KEYS.filter((k) => !sds.some((s) => s.sd_key === k)).join(', ')}`
  );
}

// Fetch all retros for these SDs
const { data: retros, error: retroErr } = await supabase
  .from('retrospectives')
  .select('id, sd_id, title, metadata')
  .in('sd_id', uuids);

if (retroErr) {
  console.error('amend-stage17-retrospectives: retro lookup FAILED:', retroErr.message);
  process.exit(1);
}

if (!retros || retros.length === 0) {
  console.warn('WARN: no retrospectives found for any source SD. Nothing to amend.');
  process.exit(0);
}

console.log(`Found ${retros.length} retro(s) across ${uuids.length} source SD(s)`);

let amended = 0;
let skipped = 0;
let failed = 0;

for (const retro of retros) {
  const existing = Array.isArray(retro.metadata?.amendments) ? retro.metadata.amendments : [];
  const alreadyAmended = existing.some((a) => a.amended_by_sd === AMENDED_BY_SD);
  if (alreadyAmended) {
    console.log(`  SKIP retro ${retro.id} (already amended by ${AMENDED_BY_SD})`);
    skipped++;
    continue;
  }

  const newMetadata = {
    ...(retro.metadata ?? {}),
    amendments: [...existing, AMENDMENT_TEMPLATE]
  };

  const { error: updateErr } = await supabase
    .from('retrospectives')
    .update({ metadata: newMetadata })
    .eq('id', retro.id);

  if (updateErr) {
    console.error(`  FAIL retro ${retro.id}: ${updateErr.message}`);
    failed++;
  } else {
    console.log(`  OK   retro ${retro.id} (sd ${retro.sd_id.slice(0, 8)}…) amended`);
    amended++;
  }
}

console.log(`\namend-stage17-retrospectives: amended=${amended} skipped=${skipped} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
