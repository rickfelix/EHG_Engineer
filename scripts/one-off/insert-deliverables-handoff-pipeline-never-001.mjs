#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '658bf75d-4f6d-4ff2-b58e-c5444f1cc397';

const deliverables = [
  {
    deliverable_type: 'other',
    deliverable_name: 'FR-1: BaseExecutor.js validationContext carries sdKey/sdUuid',
    description: 'scripts/modules/handoff/executors/BaseExecutor.js:429-437',
    extracted_from: 'prd',
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: 'tests/unit/handoff/id-form-normalization.test.js (FR-1 source contract check, passing)',
  },
  {
    deliverable_type: 'other',
    deliverable_name: 'FR-2: plan-to-lead/index.js:389 uses sd?.id || sdId for parent_sd_id query',
    description: 'scripts/modules/handoff/executors/plan-to-lead/index.js:389',
    extracted_from: 'prd',
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: 'tests/unit/handoff/id-form-normalization.test.js (FR-2 source contract check, passing)',
  },
  {
    deliverable_type: 'other',
    deliverable_name: 'FR-3: db-content-parity-gate.js resolves sd_key from ctx.sd first',
    description: 'scripts/modules/handoff/gates/db-content-parity-gate.js:161',
    extracted_from: 'prd',
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: 'tests/unit/handoff/id-form-normalization.test.js (FR-3 behavioral tests, passing)',
  },
  {
    deliverable_type: 'other',
    deliverable_name: 'FR-4: DB_CONTENT_PARITY gate distinguishes id_resolution_error from db_content_drift',
    description: 'scripts/modules/handoff/gates/db-content-parity-gate.js (failure_category branch)',
    extracted_from: 'prd',
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: 'tests/unit/handoff/id-form-normalization.test.js (FR-4 behavioral tests) + updated tests/integration/plan-to-lead-db-content-parity-audit.test.js, passing',
  },
  {
    deliverable_type: 'other',
    deliverable_name: 'FR-5: skip-and-continue.js never writes status=\'blocked\' to strategic_directives_v2',
    description: 'scripts/modules/handoff/skip-and-continue.js markAsBlocked()',
    extracted_from: 'prd',
    priority: 'required',
    completion_status: 'completed',
    completion_evidence: 'tests/unit/handoff/skip-and-continue-blocked-timestamp.test.js (6 tests, including 2 new FR-5 regression tests), passing',
  },
];

async function main() {
  for (const d of deliverables) {
    const { data: existing } = await supabase
      .from('sd_scope_deliverables')
      .select('id')
      .eq('sd_id', SD_UUID)
      .eq('deliverable_name', d.deliverable_name)
      .maybeSingle();

    const row = { sd_id: SD_UUID, created_by: 'EXEC', ...d };
    const result = existing
      ? await supabase.from('sd_scope_deliverables').update(row).eq('id', existing.id).select('id')
      : await supabase.from('sd_scope_deliverables').insert(row).select('id');

    if (result.error) {
      console.error(`Deliverable "${d.deliverable_name}" write failed:`, result.error);
      process.exit(1);
    }
    console.log(`✓ ${d.deliverable_name}: ${result.data?.[0]?.id}`);
  }
  console.log('\nAll deliverables written OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
