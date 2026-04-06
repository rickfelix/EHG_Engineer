#!/usr/bin/env node
/**
 * Idempotent seed script for stage_artifact_requirements table
 * SD: SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-A
 *
 * Reads from scripts/config/stage-artifact-config.json and
 * UPSERTs into stage_artifact_requirements on (stage_number, artifact_type).
 *
 * Usage: node scripts/seed-stage-artifact-requirements.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  const configPath = join(__dirname, 'config', 'stage-artifact-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  const rows = config.requirements.map(req => ({
    stage_number: req.stage_number,
    artifact_type: req.artifact_type,
    required_status: req.required_status,
    is_blocking: req.is_blocking,
    timeout_hours: req.timeout_hours || null,
    description: req.description
  }));

  console.log(`Seeding ${rows.length} stage artifact requirements...`);

  const { data, error } = await supabase
    .from('stage_artifact_requirements')
    .upsert(rows, { onConflict: 'stage_number,artifact_type' })
    .select('stage_number, artifact_type');

  if (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Upserted ${data.length} rows into stage_artifact_requirements`);

  // Verify key rows
  const { data: stage15 } = await supabase
    .from('stage_artifact_requirements')
    .select('artifact_type, is_blocking')
    .eq('stage_number', 15)
    .eq('artifact_type', 'blueprint_wireframes')
    .single();

  const { data: stage17 } = await supabase
    .from('stage_artifact_requirements')
    .select('artifact_type, is_blocking, required_status')
    .eq('stage_number', 17)
    .eq('artifact_type', 'stitch_curation')
    .single();

  if (stage15) {
    console.log(`  Stage 15: blueprint_wireframes, is_blocking=${stage15.is_blocking}`);
  } else {
    console.error('  ❌ Stage 15 blueprint_wireframes requirement NOT found');
  }

  if (stage17) {
    console.log(`  Stage 17: stitch_curation, required_status=${stage17.required_status}, is_blocking=${stage17.is_blocking}`);
  } else {
    console.error('  ❌ Stage 17 stitch_curation requirement NOT found');
  }
}

seed().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
