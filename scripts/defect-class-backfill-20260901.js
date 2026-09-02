#!/usr/bin/env node
// SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-5: one-time backfill of the first population
// (12 completion-gate specimens of 2026-09-01 plus the 09-01 mints) against Solomon's v1.0
// taxonomy, read live from feedback row 1a81e99c-3073-4296-a63f-c42583e9f10c
// (metadata.taxonomy_ref on the SD points here). Idempotent: re-running upserts the same
// rows (classify()/classifyUnclassified() key on (source_type, source_id)).
//
// Timestamp honesty note: Solomon's taxonomy names WHICH specimens belong to the first
// population but not a per-specimen intra-day timestamp, so every backfilled row uses
// 2026-09-01T23:59:59Z (end-of-day on the known population date) rather than a fabricated
// precise time -- this is deliberately the least-precise honest value, not an invented one.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { classify } from './defect-class-classify.js';
dotenv.config();

const TAXONOMY_FEEDBACK_ID = '1a81e99c-3073-4296-a63f-c42583e9f10c';
const BACKFILL_WITNESSED_AT = '2026-09-01T23:59:59Z';
const CLASSIFIED_BY = 'backfill:defect-class-backfill-20260901';

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

function getClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

function inferSourceType(label) {
  if (/^QF-\d+/.test(label)) return 'quick_fix';
  if (/^SD-[A-Z-]+-\d+/.test(label)) return 'sd';
  return 'feedback';
}

/** @param {{supabase?: object}} opts */
export async function backfill({ supabase = null } = {}) {
  const client = supabase || getClient();

  const { data: taxonomyRow, error: readErr } = await client
    .from('feedback')
    .select('metadata')
    .eq('id', TAXONOMY_FEEDBACK_ID)
    .single();
  if (readErr) throw readErr;

  const taxonomy = taxonomyRow?.metadata?.taxonomy;
  if (!taxonomy) throw new Error(`backfill: no metadata.taxonomy found on feedback ${TAXONOMY_FEEDBACK_ID}`);

  const results = { classesCreated: [], specimensLinked: [], mintsLinked: [] };

  // 1. Create every class row (verified_fix_date stays null -- per taxonomy_version 1.0,
  //    "every class fix_verified=null today so the weekly number starts honestly at zero").
  for (const cls of taxonomy.classes) {
    const { class: classRow } = await classify({
      classKey: cls.key,
      familyDescription: `${cls.family}: ${cls.predicate}`,
      memoryIndexAnchor: cls.type_specimen || null,
      classifiedBy: CLASSIFIED_BY,
      supabase: client,
    });
    results.classesCreated.push(classRow.class_key);
  }

  // 2. Link the mapped completion-gate specimens (the 12-specimen first population) to
  //    their classes. Each mapped label becomes one specimen row.
  const mapped = taxonomy.first_population?.mapped || {};
  for (const [classKey, labels] of Object.entries(mapped)) {
    for (const label of labels) {
      const sourceType = inferSourceType(label);
      const { specimen } = await classify({
        classKey,
        familyDescription: taxonomy.classes.find((c) => c.key === classKey)?.family || 'unknown',
        classifiedBy: CLASSIFIED_BY,
        specimen: { sourceType, sourceId: label.slice(0, 200), witnessedAt: BACKFILL_WITNESSED_AT },
        supabase: client,
      });
      results.specimensLinked.push(specimen);
    }
  }

  // 3. The 09-01 mints are the SAME-DAY population but not yet individually classified by
  //    Solomon against a specific predicate -- land them in the UNCLASSIFIED bucket so the
  //    weekly review can triage them, per "a specimen without a class is filed against an
  //    UNCLASSIFIED bucket ... never silently dropped."
  const { classifyUnclassified } = await import('./defect-class-classify.js');
  const mints = taxonomy.first_population?.mints_2026_09_01 || [];
  for (const mintKey of mints) {
    const sourceType = inferSourceType(mintKey);
    const row = await classifyUnclassified({
      sourceType,
      sourceId: mintKey,
      witnessedAt: BACKFILL_WITNESSED_AT,
      classifiedBy: CLASSIFIED_BY,
      supabase: client,
    });
    results.mintsLinked.push(row);
  }

  return results;
}

async function main() {
  const results = await backfill();
  console.log(`Classes created/updated: ${results.classesCreated.length}`);
  console.log(`Mapped specimens linked: ${results.specimensLinked.length}`);
  console.log(`Mints filed UNCLASSIFIED: ${results.mintsLinked.length}`);
}

if (isMainModule()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
