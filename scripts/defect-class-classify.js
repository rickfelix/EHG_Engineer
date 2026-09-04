#!/usr/bin/env node
// SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-3: the SOLE sanctioned writer of
// public.defect_classes and public.defect_class_specimens.class_key. Never call these
// tables directly from other scripts -- route every write through this module.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
dotenv.config();

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

function getClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Create/update a defect class row and (optionally) link a specimen to it.
 * Setting verified_fix_date requires the explicit fixingSdOrQf argument (FR-3: a class is
 * never marked fixed as a side effect of classifying a specimen).
 */
export async function classify({
  classKey,
  familyDescription,
  memoryIndexAnchor = null,
  classifiedBy,
  verifiedFixDate = null,
  fixingSdOrQf = null,
  specimen = null, // { sourceType, sourceId, witnessedAt }
  supabase = null,
}) {
  if (!classKey) throw new Error('classify: classKey is required');
  if (!classifiedBy) throw new Error('classify: classifiedBy is required');
  if (verifiedFixDate && !fixingSdOrQf) {
    throw new Error('classify: verifiedFixDate requires fixingSdOrQf (a class is never marked fixed without attribution)');
  }
  const client = supabase || getClient();

  const classRow = {
    class_key: classKey,
    family_description: familyDescription,
    memory_index_anchor: memoryIndexAnchor,
    classified_by: classifiedBy,
    updated_at: new Date().toISOString(),
  };
  if (verifiedFixDate) {
    classRow.verified_fix_date = verifiedFixDate;
    classRow.fixing_sd_or_qf = fixingSdOrQf;
  }

  const { data: classResult, error: classErr } = await client
    .from('defect_classes')
    .upsert(classRow, { onConflict: 'class_key' })
    .select('class_key, verified_fix_date, fixing_sd_or_qf')
    .single();
  if (classErr) throw classErr;

  let specimenResult = null;
  if (specimen) {
    if (!specimen.sourceType || !specimen.sourceId || !specimen.witnessedAt) {
      throw new Error('classify: specimen requires sourceType, sourceId, witnessedAt');
    }
    const { data, error: specErr } = await client
      .from('defect_class_specimens')
      .upsert(
        {
          class_key: classKey,
          source_type: specimen.sourceType,
          source_id: specimen.sourceId,
          witnessed_at: specimen.witnessedAt,
          classified_by: classifiedBy,
          classified_at: new Date().toISOString(),
        },
        { onConflict: 'source_type,source_id' }
      )
      .select('id, class_key, source_type, source_id')
      .single();
    if (specErr) throw specErr;
    specimenResult = data;
  }

  return { class: classResult, specimen: specimenResult };
}

/** Insert a specimen with NO class (the UNCLASSIFIED bucket). Never silently dropped. */
export async function classifyUnclassified({ sourceType, sourceId, witnessedAt, classifiedBy, supabase = null }) {
  if (!sourceType || !sourceId || !witnessedAt) {
    throw new Error('classifyUnclassified: sourceType, sourceId, witnessedAt are required');
  }
  if (!classifiedBy) throw new Error('classifyUnclassified: classifiedBy is required');
  const client = supabase || getClient();
  const { data, error } = await client
    .from('defect_class_specimens')
    .upsert(
      {
        class_key: null,
        source_type: sourceType,
        source_id: sourceId,
        witnessed_at: witnessedAt,
        classified_by: classifiedBy,
        classified_at: new Date().toISOString(),
      },
      { onConflict: 'source_type,source_id' }
    )
    .select('id, class_key, source_type, source_id')
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const classKey = opt('class-key');
  const sourceType = opt('source-type');
  const sourceId = opt('source-id');
  const witnessedAt = opt('witnessed-at') || new Date().toISOString();
  const classifiedBy = opt('classified-by') || process.env.CLAUDE_SESSION_ID || 'unknown';

  if (!classKey) {
    console.log(
      'Usage: node scripts/defect-class-classify.js --class-key <KEY> --family "<desc>" [--memory-index-anchor <path>] --source-type <feedback|quick_fix|sd> --source-id <id> [--witnessed-at <iso>] [--classified-by <who>] [--verified-fix-date <iso> --fixing-sd-or-qf <key>]'
    );
    process.exit(1);
  }

  const result = await classify({
    classKey,
    familyDescription: opt('family'),
    memoryIndexAnchor: opt('memory-index-anchor') || null,
    classifiedBy,
    verifiedFixDate: opt('verified-fix-date') || null,
    fixingSdOrQf: opt('fixing-sd-or-qf') || null,
    specimen: sourceType && sourceId ? { sourceType, sourceId, witnessedAt } : null,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (isMainModule()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
