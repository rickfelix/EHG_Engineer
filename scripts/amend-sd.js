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
  const sdKey = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== arg('--append')
    && a !== arg('--description') && a !== arg('--scope') && a !== arg('--reason'));
  const append = arg('--append');
  const description = arg('--description');
  const scope = arg('--scope');
  const reason = arg('--reason');

  if (!sdKey || (!append && !description && !scope)) {
    console.error('Usage: node scripts/amend-sd.js <SD-KEY> (--append|--description|--scope) "<text>" [--reason "<why>"]');
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

  // Loud, not silent: a required-but-undelivered notice is a failure even though the row changed.
  const failed = !res.sdUpdated || (res.noticeRequired && !res.noticeDelivered);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`[amend-sd] fatal: ${e?.message || e}`);
  process.exit(1);
});
