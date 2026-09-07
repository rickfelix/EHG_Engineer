import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001';

const ADDENDUM = `

---
EXEC-PHASE CORRECTION (2026-09-07, Alpha-5 worker session bc70bff7): my own LEAD investigation
above (the "LEAD PREMISE CORRECTION" block) was written from a from-scratch source read WITHOUT
first reading the SD's own already-rich original filing (the top of this description) --
Adam/Michael's own prior investigation, which I should have consulted first and did not. That
filing was correct and more complete than my independent pass in three ways, now closed:

1. A SECOND unscoped write site existed at fleet-dashboard.cjs's printAdamInbox (the "advisory
   render", ~line 2439) -- I had only fixed printInbox. Both now share the same idempotent
   stampInboxReadAt() helper (its SELECT gates on payload->>actioned_at, not read_at, per
   adam-advisory-store.cjs:49 -- safe for the same reason printInbox's fix was safe).
2. The actual live FALSE STATEMENT is injected by scripts/hooks/session-role-orient.cjs:44 (a
   SessionStart hook -- reaches every worker session directly, including this one this run) --
   NOT merely documented in docs/protocol/fleet-worker-loop-directive.md as I had assumed. Fixed
   both; the .md fix stands, the hook fix is the one that actually matters at runtime.
3. My claim "NO MEASURED PRODUCTION INCIDENT" was WRONG. The original filing names two
   reproduced live specimens (Adam->Michael rows, one predicted before it happened) where
   Michael's own inbox drain missed a message because of exactly this column-mismatch class --
   recovered only by querying session_coordination directly. This SD closes a real, reproduced
   defect, not merely a consistency/documentation issue as I had scoped it.

The original filing's proposed FIX SHAPE also raised a deeper question this SD does NOT settle:
whether read_at should mean "an observer rendered this" (current, both fixed sites) or "the
recipient has seen this" (michael-inbox.cjs's actual read pattern), suggesting observer writes
might belong on the pre-existing delivered_at column instead. Descoped here (LEAD ruling, this
worker): the idempotency fix closes the reproduced incident (a stale read_at can no longer be
silently refreshed to look fresh) without requiring the larger contract-wide migration; a
column-semantics unification is a larger, separate SD if still needed after this ships.`;

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('description')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (current.description.includes('EXEC-PHASE CORRECTION')) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ description: current.description + ADDENDUM })
    .eq('sd_key', SD_KEY);
  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  console.log('Addendum applied.');
}

if (isMainModule(import.meta.url)) {
  main();
}
