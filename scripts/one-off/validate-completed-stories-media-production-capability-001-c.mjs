#!/usr/bin/env node
// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C: promote US-001..US-009 (FR-1..FR-9, all
// implemented, tested, and sub-agent-verified at EXEC_TO_PLAN -- TESTING/SECURITY both
// CONDITIONAL_PASS with findings already closed) to status='completed',
// validation_status='validated'. US-010 (FR-10, the pending chairman RLS-fix ceremony) is
// deliberately EXCLUDED -- it is genuinely not delivered yet and must keep reading that way to
// both FR_DELIVERY_TRACEABILITY and any human reviewing story state.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const sdUuid = '3b455544-f8a1-4fdf-a548-2003faa56f36';
  const keys = Array.from({ length: 9 }, (_, i) =>
    `SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C:US-${String(i + 1).padStart(3, '0')}`);

  const { data, error } = await supabase
    .from('user_stories')
    .update({ status: 'completed', validation_status: 'validated' })
    .eq('sd_id', sdUuid)
    .in('story_key', keys)
    .select('story_key, status, validation_status');

  if (error) { console.error('UPDATE ERROR', error.message); process.exit(1); }
  console.log(`Updated ${data.length} stories:`);
  data.forEach((s) => console.log(`  ${s.story_key}: status=${s.status} validation_status=${s.validation_status}`));

  const { data: us010 } = await supabase
    .from('user_stories')
    .select('story_key, status, validation_status')
    .eq('sd_id', sdUuid)
    .eq('story_key', 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C:US-010')
    .single();
  console.log('US-010 (left untouched, pending chairman ceremony):', JSON.stringify(us010));
}

if (isMainModule(import.meta.url)) {
  main();
}
