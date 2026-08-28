#!/usr/bin/env node
// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C: US-010 (FR-10, the pending chairman
// RLS-fix ceremony) was found promoted to status='completed'/validation_status='validated'
// at 2026-08-27T09:58:18 -- an unintended side effect of a downstream gate/investigation
// pass, NOT a deliberate action by this session. That promotion contradicts this SD's own
// explicit design (PRD FR-10 + US-010 acceptance criteria AC-010-1/2/3): the story must
// read as NOT complete via status/validation_status until the chairman ceremony genuinely
// applies database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql.
// Reverting to the honest pending state. implementation_status stays 'pending' (unchanged).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const sdUuid = '3b455544-f8a1-4fdf-a548-2003faa56f36';

  const { data, error } = await supabase
    .from('user_stories')
    .update({ status: 'draft', validation_status: 'pending' })
    .eq('sd_id', sdUuid)
    .eq('story_key', 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C:US-010')
    .select('story_key, status, validation_status, implementation_status')
    .single();

  if (error) { console.error('UPDATE ERROR', error.message); process.exit(1); }
  console.log('US-010 reverted:', JSON.stringify(data, null, 2));
}

main();
