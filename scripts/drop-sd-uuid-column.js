#!/usr/bin/env node
/**
 * Drop sd_uuid column from product_requirements_v2
 *
 * This completes Phase 1 of the SD ID schema cleanup.
 * Run after run-prd-sd-migration.js successfully migrates all data.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function dropSdUuidColumn() {
  console.log('Dropping sd_uuid column from product_requirements_v2...\n');

  try {
    // First verify sd_id is fully populated
    const { count: totalCount } = await supabase
      .from('product_requirements_v2')
      .select('*', { count: 'exact', head: true });

    const { count: withSdId } = await supabase
      .from('product_requirements_v2')
      .select('*', { count: 'exact', head: true })
      .not('sd_id', 'is', null);

    console.log('Verification:');
    console.log('  Total PRDs:', totalCount);
    console.log('  PRDs with sd_id:', withSdId);

    if (withSdId < totalCount) {
      console.log('\nERROR: Not all PRDs have sd_id populated.');
      console.log('Run run-prd-sd-migration.js first.');
      return;
    }

    console.log('\nAll PRDs have sd_id - safe to drop sd_uuid column.');
    console.log('\nPlease run this SQL in Supabase SQL Editor:');
    console.log('');
    console.log('-- Drop old column');
    console.log('ALTER TABLE product_requirements_v2 DROP COLUMN IF EXISTS sd_uuid;');
    console.log('');
    console.log('-- Add index for performance');
    console.log('CREATE INDEX IF NOT EXISTS idx_prd_sd_id ON product_requirements_v2(sd_id);');
    console.log('');
    console.log('-- Add FK constraint (optional but recommended)');
    console.log('ALTER TABLE product_requirements_v2');
    console.log('  ADD CONSTRAINT fk_prd_sd_id');
    console.log('  FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)');
    console.log('  ON DELETE SET NULL ON UPDATE CASCADE;');
    console.log('');
    console.log('-- Verify');
    console.log("SELECT column_name FROM information_schema.columns WHERE table_name = 'product_requirements_v2' AND column_name IN ('sd_uuid', 'sd_id');");
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

dropSdUuidColumn();
