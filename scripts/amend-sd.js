#!/usr/bin/env node
/**
 * amend-sd — the canonical way to change an SD's scope/description after work has started.
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-D.
 *
 * Use this instead of a raw .update() on strategic_directives_v2 whenever an SD may already be
 * claimed: a raw update reaches the row and nobody, because EXEC builds to the PRD it already
 * holds. This path also emits a directed fence_notice to the claiming session.
 *
 * EXIT CONTRACT (FR-3 — being wrong must be loud, not silent):
 *   0  amended, and either delivered to the claiming worker or no consumer was required
 *   1  amended but the worker was NOT notified (or the amendment itself failed)
 * The SD update is never rolled back by a delivery failure — both facts are printed.
 *
 * Usage:
 *   node scripts/amend-sd.js <SD-KEY> --append "<text>"        append to description AND scope
 *   node scripts/amend-sd.js <SD-KEY> --description "<text>"   replace description
 *   node scripts/amend-sd.js <SD-KEY> --scope "<text>"         replace scope
 *   [--reason "<why>"]                                          carried in the notice body
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { amendSd } from '../lib/sd/amend-sd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  // The SD key is the FIRST positional argument, full stop. The earlier version derived it by
  // filtering out tokens equal to any flag's VALUE, which the deep-tier adversarial review broke:
  // an unquoted multi-word --description that happens to begin with the SD's own key fragments into
  // stray positionals, the real key gets filtered out by value, and the NEXT stray word is picked —
  // silently amending a different SD and notifying its unrelated worker. Positional-by-index cannot
  // do that.
  const sdKey = process.argv[2];
  const append = arg('--append');
  const description = arg('--description');
  const scope = arg('--scope');
  const reason = arg('--reason');

  if (!sdKey || sdKey.startsWith('--') || (!append && !description && !scope)) {
    console.error('Usage: node scripts/amend-sd.js <SD-KEY> (--append|--description|--scope) "<text>" [--reason "<why>"]');
    console.error('       <SD-KEY> must be the FIRST argument. Quote multi-word values.');
    process.exit(2);
  }

  // Refuse ambiguity rather than silently dropping a value: the old code let --append quietly win
  // over a simultaneously-supplied --description.
  if (append && (description || scope)) {
    console.error('[amend-sd] --append cannot be combined with --description/--scope — pick one.');
    process.exit(2);
  }

  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let patch = {};
  if (append) {
    const { data: cur } = await sb
      .from('strategic_directives_v2')
      .select('description, scope')
      .eq('sd_key', sdKey)
      .maybeSingle();
    if (!cur) { console.error(`[amend-sd] SD not found: ${sdKey}`); process.exit(1); }
    patch = {
      description: `${cur.description || ''}\n\n${append}`,
      scope: `${cur.scope || ''}\n\n${append}`,
    };
  } else {
    if (description) patch.description = description;
    if (scope) patch.scope = scope;
  }

  const res = await amendSd(sb, sdKey, patch, { reason });

  console.log(`[amend-sd] ${sdKey}`);
  console.log(`   sd_updated       : ${res.sdUpdated}`);
  console.log(`   notice_required  : ${res.noticeRequired}`);
  console.log(`   notice_delivered : ${res.noticeDelivered}`);
  if (res.warning) console.log(`   ⚠️  ${res.warning}`);
  if (res.errorCode) console.log(`   error_code       : ${res.errorCode}`);

  // Loud, not silent. errorCode is the primary failure signal: it is null on every success path and
  // non-null on every failure path, which makes it strictly more correct than the compound boolean
  // alone. Without it a PARTIAL patch — description column written, metadata merge failed — returns
  // sdUpdated:true with noticeRequired never reached, and the old expression exited 0 on a
  // half-applied amendment. Found by the deep-tier review of PR #6559.
  const failed = !res.sdUpdated || res.errorCode !== null || (res.noticeRequired && !res.noticeDelivered);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`[amend-sd] fatal: ${e?.message || e}`);
  process.exit(1);
});
