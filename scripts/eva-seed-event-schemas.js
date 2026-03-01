#!/usr/bin/env node

/**
 * Seed eva_event_schemas with core event types used across EVA services.
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-011 (A05: event_bus_integration)
 *
 * Populates the schema registry so event types are formally documented.
 * Uses upsert (ON CONFLICT DO UPDATE) to be idempotent.
 *
 * Usage: node scripts/seed-event-schemas.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CORE_EVENT_SCHEMAS = [
  {
    event_type: 'evaluation_started',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when an EVA evaluation begins (expand/spinoff)',
      fields: {
        venture_id: { type: 'uuid', required: true },
        evaluation_type: { type: 'string', required: true, enum: ['expand', 'spinoff'] },
        stage_number: { type: 'integer', required: false },
      },
      source_modules: ['lib/eva/expand-spinoff-evaluator.js'],
    },
  },
  {
    event_type: 'evaluation_completed',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when an EVA evaluation completes with results',
      fields: {
        venture_id: { type: 'uuid', required: true },
        evaluation_type: { type: 'string', required: true },
        result: { type: 'object', required: true },
        duration_ms: { type: 'integer', required: false },
      },
      source_modules: ['lib/eva/expand-spinoff-evaluator.js'],
    },
  },
  {
    event_type: 'dependency_blocked',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when an SD dependency check finds a blocker',
      fields: {
        sd_id: { type: 'uuid', required: true },
        blocked_by: { type: 'uuid', required: true },
        reason: { type: 'string', required: true },
      },
      source_modules: ['lib/eva/eva-orchestrator.js'],
    },
  },
  {
    event_type: 'dependency_check_passed',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when all SD dependencies are satisfied',
      fields: {
        sd_id: { type: 'uuid', required: true },
        dependencies_checked: { type: 'integer', required: true },
      },
      source_modules: ['lib/eva/eva-orchestrator.js'],
    },
  },
  {
    event_type: 'optimization_started',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when portfolio optimization begins',
      fields: {
        portfolio_size: { type: 'integer', required: true },
        strategy: { type: 'string', required: false },
      },
      source_modules: ['lib/eva/portfolio-optimizer.js'],
    },
  },
  {
    event_type: 'contention_detected',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when resource contention is detected during optimization',
      fields: {
        resource: { type: 'string', required: true },
        competing_sds: { type: 'array', required: true },
        severity: { type: 'string', required: true, enum: ['low', 'medium', 'high'] },
      },
      source_modules: ['lib/eva/portfolio-optimizer.js'],
    },
  },
  {
    event_type: 'optimization_completed',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired when portfolio optimization completes',
      fields: {
        portfolio_size: { type: 'integer', required: true },
        optimizations_applied: { type: 'integer', required: true },
        duration_ms: { type: 'integer', required: false },
      },
      source_modules: ['lib/eva/portfolio-optimizer.js'],
    },
  },
  {
    event_type: 'cascade_alignment_check',
    version: '1.0.0',
    schema_definition: {
      description: 'Fired during cascade alignment validation at handoff boundaries',
      fields: {
        sd_id: { type: 'uuid', required: true },
        parent_sd_id: { type: 'uuid', required: true },
        score: { type: 'integer', required: true },
        aligned: { type: 'boolean', required: true },
      },
      source_modules: ['scripts/modules/governance/cascade-validator.js'],
    },
  },
];

async function main() {
  console.log('Seeding eva_event_schemas with core event types...\n');

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const schema of CORE_EVENT_SCHEMAS) {
    const { data, error } = await supabase
      .from('eva_event_schemas')
      .upsert(schema, { onConflict: 'event_type,version' })
      .select('id, event_type');

    if (error) {
      console.log(`  ✗ ${schema.event_type}: ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${schema.event_type} v${schema.version}`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted} schemas seeded, ${errors} errors`);

  // Verify
  const { data: count } = await supabase
    .from('eva_event_schemas')
    .select('id', { count: 'exact', head: true });

  const { count: totalCount } = await supabase
    .from('eva_event_schemas')
    .select('*', { count: 'exact', head: true });

  console.log(`Total schemas in table: ${totalCount}`);

  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
