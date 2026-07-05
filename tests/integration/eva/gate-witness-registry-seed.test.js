/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-B: verifies the live-seeded
 * gate_witness_registry has 100% coverage of the extracted inventory, zero
 * unclassified rows, and the specific already_witnessed gates are correctly wired.
 */

import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildInventory } from '../../../scripts/eva/gate-inventory-extract.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('gate_witness_registry seeded inventory (live)', () => {
  it('has a registry row for every distinct gate_id extracted from the handoff pipeline', async () => {
    const { inventory } = buildInventory();
    const extractedIds = new Set(inventory.map(g => g.gate_id));

    const { data, error } = await supabase.from('gate_witness_registry').select('gate_id');
    expect(error).toBeNull();
    const registeredIds = new Set(data.map(r => r.gate_id));

    const missing = [...extractedIds].filter(id => !registeredIds.has(id));
    expect(missing).toEqual([]);
  });

  it('has zero rows missing a classification', async () => {
    const { data, error } = await supabase.from('gate_witness_registry').select('gate_id, classification');
    expect(error).toBeNull();
    const unclassified = data.filter(r => !r.classification);
    expect(unclassified).toEqual([]);
  });

  it('includes the 5 ship-witness ladder rungs explicitly named in the parent SD scope', async () => {
    const { data, error } = await supabase
      .from('gate_witness_registry')
      .select('gate_id')
      .in('gate_id', ['ship.P1_ADMISSION', 'ship.P2_WITNESS', 'ship.P3_CI', 'ship.P4_PROTECTION_INTEGRITY', 'ship.P5_POST_VERIFY']);
    expect(error).toBeNull();
    expect(data.length).toBe(5);
  });

  it('classifies PR_PRECHECK and PR_MERGE_VERIFICATION as already_witnessed/external_system/structural', async () => {
    const { data, error } = await supabase
      .from('gate_witness_registry')
      .select('gate_id, classification, witness_mechanism, enforcement_strength')
      .in('gate_id', ['PR_PRECHECK', 'PR_MERGE_VERIFICATION']);
    expect(error).toBeNull();
    expect(data.length).toBe(2);
    for (const row of data) {
      expect(row.classification).toBe('already_witnessed');
      expect(row.witness_mechanism).toBe('external_system');
      expect(row.enforcement_strength).toBe('structural');
    }
  });

  it('classifies ship.P2_WITNESS as already_witnessed/cross_actor/convention (actor-separation not yet hardened)', async () => {
    const { data, error } = await supabase
      .from('gate_witness_registry')
      .select('classification, witness_mechanism, enforcement_strength')
      .eq('gate_id', 'ship.P2_WITNESS')
      .single();
    expect(error).toBeNull();
    expect(data.classification).toBe('already_witnessed');
    expect(data.witness_mechanism).toBe('cross_actor');
    expect(data.enforcement_strength).toBe('convention');
  });

  it('the vast majority of handoff-pipeline gates are self_evidence_only (Solomon\'s finding, quantified)', async () => {
    const { data, error } = await supabase.from('gate_witness_registry').select('classification');
    expect(error).toBeNull();
    const selfEvidenceCount = data.filter(r => r.classification === 'self_evidence_only').length;
    // Real seeded count: 124/130. Assert a strong majority rather than the exact number so
    // legitimate future re-classifications don't spuriously break this test.
    expect(selfEvidenceCount / data.length).toBeGreaterThan(0.9);
  });
});
