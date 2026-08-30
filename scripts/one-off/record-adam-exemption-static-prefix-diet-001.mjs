#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STATIC-PREFIX-DIET-001';

const chairman_ratification_needed = {
  item: 'Adam-seat exemption from the >=15% static-prefix diet target',
  status: 'awaiting_chairman_one_liner',
  summary: "SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4) was ratified with a >=15% reduction target on BOTH the worker seat and an Adam seat. The worker seat met it (15.56%, adjusted for MEMORY.md's unrelated organic growth). The Adam seat is a confirmed dead end: CLAUDE_ADAM.md and CLAUDE_ADAM_DIGEST.md contain no A4-eligible reference-only content that can move to an on-demand companion file without cutting chairman-mandated content. Requesting ratification of a scope exemption for the Adam seat on this SD, per coordinator ruling 9771cb3f (2026-08-29).",
  requested_action: 'One-line chairman ratification: accept worker-seat-only success for A4, OR direct further scope (e.g. a follow-on SD against different Adam-seat content) if the target must literally hold for both seats.',
  pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7757',
};

async function main() {
  const { data: row, error: e0 } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw e0;
  const md = { ...row.metadata, chairman_ratification_needed };
  const { error: e1 } = await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('sd_key', SD_KEY);
  if (e1) throw e1;
  console.log('chairman_ratification_needed recorded');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
