#!/usr/bin/env node
/**
 * Track the LLC formation process in legal_processes (migration 029 schema).
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001  (FR-6)
 *
 * The fleet RECORDS/TRACKS milestones; the CHAIRMAN performs the actual filing
 * and attests completion. This seeds a pending llc_formation row with dated
 * external-latency milestones so slippage is visible, not silent. Idempotent.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const checklist_items = [
  { step: 'State LLC filing (Articles of Organization)', completed: false, completed_at: null, notes: 'CHAIRMAN: choose state + registered agent; file.' },
  { step: 'EIN application (IRS)', completed: false, completed_at: null, notes: 'CHAIRMAN: apply after entity exists.' },
  { step: 'Business bank account setup', completed: false, completed_at: null, notes: 'CHAIRMAN: open after EIN issued.' }
];

async function main() {
  // Verify legal_processes exists (migration 029 applied)
  const probe = await sb.from('legal_processes').select('id').limit(1);
  if (probe.error) {
    console.error('[llc-track] legal_processes not available — apply migration 029 first:', probe.error.message);
    process.exit(1);
  }
  // Idempotent: one master (venture_id NULL) llc_formation row
  const existing = await sb.from('legal_processes').select('id,status').is('venture_id', null).eq('process_type', 'llc_formation').maybeSingle();
  if (existing.data) {
    console.log('[llc-track] llc_formation row already exists:', existing.data.id, 'status=' + existing.data.status);
    return;
  }
  const { data, error } = await sb.from('legal_processes').insert({
    process_type: 'llc_formation',
    venture_id: null,
    status: 'pending',
    title: 'EHG payment-rail LLC formation',
    description: 'Master LLC formation track for the first-dollar payment rail (SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001). Chairman-performed, chairman-attested.',
    checklist_items
  }).select('id').single();
  if (error) { console.error('[llc-track] insert failed:', error.message); process.exit(1); }
  console.log('[llc-track] Created pending llc_formation row:', data.id, 'with', checklist_items.length, 'milestones.');
}

main().catch(e => { console.error('[llc-track] FAILED:', e?.message || e); process.exit(1); });
