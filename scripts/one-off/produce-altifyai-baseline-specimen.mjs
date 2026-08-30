#!/usr/bin/env node
/**
 * FR-7 specimen production for SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001.
 *
 * Produces one real, cited baseline row for AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9) via an
 * EXPLICIT, direct call to researchAndCreate() -- NOT via the FR-3/FR-5 recurring eligibility loop
 * (runRefresh), which filters to status=active ventures and would never reach AltifyAI, which is
 * status=cancelled. Then verifies the never-wait property via two direct generateReviewPacket()
 * calls: baseline absent (before creation) and baseline present (after creation).
 *
 * Requires database/migrations/20260830_competitive_baselines_staleness_citations.sql to be
 * applied first (produced_at/expires_at/citations columns on competitive_baselines).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { CompetitiveBaselineService } from '../../lib/discovery/competitive-baseline-service.js';
import { generateReviewPacket } from '../../lib/eva/chairman-product-review.js';

const ALTIFYAI_VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const service = new CompetitiveBaselineService(supabase);

  const before = Date.now();
  const packetBefore = await generateReviewPacket(supabase, ALTIFYAI_VENTURE_ID, console);
  const beforeMs = Date.now() - before;
  console.log('--- packet BEFORE specimen creation ---');
  console.log(JSON.stringify({ competitiveBaseline: packetBefore.competitiveBaseline, elapsedMs: beforeMs }, null, 2));

  console.log('--- creating AltifyAI specimen via direct researchAndCreate() (not via runRefresh) ---');
  const created = await service.researchAndCreate(ALTIFYAI_VENTURE_ID, 'AltifyAI competitor');
  console.log(JSON.stringify({ id: created?.id, produced_at: created?.produced_at, expires_at: created?.expires_at, citations: created?.citations }, null, 2));

  const after = Date.now();
  const packetAfter = await generateReviewPacket(supabase, ALTIFYAI_VENTURE_ID, console);
  const afterMs = Date.now() - after;
  console.log('--- packet AFTER specimen creation ---');
  console.log(JSON.stringify({ competitiveBaseline: packetAfter.competitiveBaseline, elapsedMs: afterMs }, null, 2));
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
