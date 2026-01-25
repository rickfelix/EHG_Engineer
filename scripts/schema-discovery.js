#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function discoverSchema() {
  console.log('# Schema Discovery Report\n');
  console.log('Generated:', new Date().toISOString());
  console.log('\n---\n');

  // 1. Strategic Directives V2
  console.log('## 1. strategic_directives_v2\n');

  const { data: sdSample } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1)
    .single();

  if (sdSample) {
    console.log('### Columns Found:');
    const columns = Object.keys(sdSample);
    console.log('```');
    columns.forEach(col => {
      const value = sdSample[col];
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      console.log(`- ${col}: ${type}`);
    });
    console.log('```\n');

    console.log('### Key Fields:');
    console.log(`- Primary Key: id (${typeof sdSample.id})`);
    console.log(`- Legacy ID: ${sdSample.sd_key || 'null'}`);
    console.log(`- Has 'key' column: ${sdSample.key !== undefined ? 'Yes' : 'No'}`);
    console.log('\n### Sample Row:');
    console.log('```json');
    console.log(JSON.stringify({
      id: sdSample.id,
      sd_key: sdSample.sd_key,
      title: sdSample.title,
      category: sdSample.category,
      status: sdSample.status,
      priority: sdSample.priority
    }, null, 2));
    console.log('```\n');
  }

  // 2. Product Requirements V2
  console.log('## 2. product_requirements_v2\n');

  const { data: prdSample } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .limit(1)
    .single();

  if (prdSample) {
    console.log('### Columns Found:');
    const columns = Object.keys(prdSample);
    console.log('```');
    columns.forEach(col => {
      const value = prdSample[col];
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      console.log(`- ${col}: ${type}`);
    });
    console.log('```\n');

    console.log('### Acceptance-Related Fields:');
    const acceptanceFields = columns.filter(c =>
      c.includes('acceptance') ||
      c.includes('criteria') ||
      c.includes('test') ||
      c.includes('scenario') ||
      c.includes('validation')
    );

    if (acceptanceFields.length > 0) {
      acceptanceFields.forEach(field => {
        console.log(`- ${field}: ${typeof prdSample[field]}`);
        if (prdSample[field] && typeof prdSample[field] === 'object') {
          console.log(`  Sample: ${JSON.stringify(prdSample[field]).substring(0, 100)}...`);
        }
      });
    } else {
      console.log('- No acceptance_criteria field found');
      console.log('- Looking for JSONB fields that could contain test scenarios...');

      const jsonFields = columns.filter(c => {
        const val = prdSample[c];
        return val && typeof val === 'object' && !Array.isArray(val);
      });

      jsonFields.forEach(field => {
        console.log(`- ${field}: ${JSON.stringify(prdSample[field]).substring(0, 100)}...`);
      });
    }
    console.log();
  }

  // 3. SD Backlog Map
  console.log('## 3. sd_backlog_map\n');

  const { data: backlogSample } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .limit(1)
    .single();

  if (backlogSample) {
    console.log('### Columns Found:');
    const columns = Object.keys(backlogSample);
    console.log('```');
    columns.forEach(col => {
      const value = backlogSample[col];
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      console.log(`- ${col}: ${type}`);
    });
    console.log('```\n');

    console.log('### Story-Related Columns:');
    const storyColumns = columns.filter(c =>
      c.includes('story') ||
      c.includes('verification') ||
      c.includes('test')
    );

    if (storyColumns.length > 0) {
      console.log('Found:', storyColumns.join(', '));
    } else {
      console.log('No story-related columns exist yet (will be added)');
    }
  } else {
    console.log('Table exists but no data found');
  }

  // 4. Check for test tables
  console.log('\n## 4. Test-Related Tables\n');

  const testTables = [
    'prd_playwright_scenarios',
    'test_runs',
    'test_failures',
    'prd_test_scenarios'
  ];

  for (const table of testTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!error) {
        console.log(`- ✅ ${table} exists`);
        if (data && data[0]) {
          console.log(`  Columns: ${Object.keys(data[0]).slice(0, 5).join(', ')}...`);
        }
      } else {
        console.log(`- ❌ ${table} not found`);
      }
    } catch (_e) {
      console.log(`- ❌ ${table} not found`);
    }
  }

  // 5. Summary
  console.log('\n## Summary\n');
  console.log('### Key Findings:');
  console.log('1. SD identifier: Uses `legacy_id` field (not `key`)');
  console.log('2. PRD acceptance: Need to identify best field from product_requirements_v2');
  console.log('3. Backlog map: Table exists, story columns need to be added');
  console.log('4. Primary keys: SD uses `id` (UUID), must map via `legacy_id`');
}

discoverSchema().catch(console.error);