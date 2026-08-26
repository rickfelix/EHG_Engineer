#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';

const description = `Child SD of SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001: Hard fence: prevent generated media assets from being externally reachable before S23+S24.

LEAD RE-SCOPE (EXPLORE evidence, 2026-08-26): the SD's original dependency premise ("creative-brief.js discards the generated asset URL and creative_assets has no storage_path column, so this fence has nothing to fence") was true when written but is now stale -- Child A merged (PR #7571) and lib/creative/creative-brief.js already persists a storage_path via lib/creative/asset-storage.js#persistAssetPrivately(), which uploads to a private bucket and discards its own upload-time signed URL. No code path anywhere currently mints a viewable URL for a persisted creative_assets row.

The actual gap this SD fences is therefore a NOT-YET-BUILT read/view surface (the eventual Child C taste-gate review UI is the first planned consumer), not a currently-exposed leak. This SD builds the sole gated read/view primitive -- checkAssetViewAuthorized() and mintAssetViewUrl() -- that every future consumer must call: fail closed on missing/null venture_id, require a recorded chairman S23 product_review approval (lib/eva/chairman-product-review.js), and require S24 (current_lifecycle_stage>=24) via lib/governance/stage-gate-predicate.js with an explicit armed:true override, since STAGE_GATE_PREDICATE_ARMED has zero rows in leo_feature_flags and would otherwise silently ship this fence in unenforced shadow mode. Also completes the FR-10 reachability census across existing venture-media producers (venture-logos, vision-briefs), confirming both are unrelated, correctly-gated pipelines and out of this fence's scope.`;

async function main() {
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  console.log('word count:', wordCount);
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ description })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Updated description for', SD_KEY);
}

main().catch((e) => { console.error(e); process.exit(1); });
