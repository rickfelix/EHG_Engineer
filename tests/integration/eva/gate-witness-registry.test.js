/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-A: gate_witness_registry live schema tests.
 * Runs against the applied migration (database/migrations/20260705_create_gate_witness_registry.sql).
 */

import { describe, it, expect, afterAll } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  CLASSIFICATION,
  WITNESS_MECHANISM,
  ENFORCEMENT_STRENGTH,
} from '../../../lib/eva/gate-witness-taxonomy.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_GATE_IDS = [
  'test.G1A_VALID_EXTERNAL',
  'test.G1A_INVALID_EXTERNAL_CONVENTION',
  'test.G1A_VALID_CROSS_ACTOR',
  'test.G1A_MISSING_MECHANISM',
  'test.G1A_EXEMPT_NO_REASON',
  'test.G1A_EXEMPT_WITH_REASON',
];

afterAll(async () => {
  await supabase.from('gate_witness_registry').delete().in('gate_id', TEST_GATE_IDS);
});

describe('gate_witness_registry table (live)', () => {
  it('accepts an external_system row with structural strength', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_VALID_EXTERNAL',
      classification: CLASSIFICATION.ALREADY_WITNESSED,
      witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
      enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
      existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP3CI',
      classified_by: 'vitest',
    });
    expect(error).toBeNull();
  });

  it('rejects an external_system row claiming convention strength', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_INVALID_EXTERNAL_CONVENTION',
      classification: CLASSIFICATION.ALREADY_WITNESSED,
      witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
      enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
      classified_by: 'vitest',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/chk_gate_witness_registry_external_is_structural/);
  });

  it('accepts a cross_actor row with convention strength', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_VALID_CROSS_ACTOR',
      classification: CLASSIFICATION.ALREADY_WITNESSED,
      witness_mechanism: WITNESS_MECHANISM.CROSS_ACTOR,
      enforcement_strength: ENFORCEMENT_STRENGTH.CONVENTION,
      existing_mechanism_ref: 'lib/ship/merge-witness-ladder.mjs:evaluateP2Witness',
      classified_by: 'vitest',
    });
    expect(error).toBeNull();
  });

  it('rejects an already_witnessed row with no witness_mechanism', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_MISSING_MECHANISM',
      classification: CLASSIFICATION.ALREADY_WITNESSED,
      classified_by: 'vitest',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/chk_gate_witness_registry_witnessed_has_mechanism/);
  });

  it('rejects a not_consequential_exempt row with no exemption_reason', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_EXEMPT_NO_REASON',
      classification: CLASSIFICATION.NOT_CONSEQUENTIAL_EXEMPT,
      classified_by: 'vitest',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/chk_gate_witness_registry_exempt_has_reason/);
  });

  it('accepts a not_consequential_exempt row with a non-empty exemption_reason', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_EXEMPT_WITH_REASON',
      classification: CLASSIFICATION.NOT_CONSEQUENTIAL_EXEMPT,
      exemption_reason: 'Advisory-only gate with no blast radius; documented in gate source comment.',
      classified_by: 'vitest',
    });
    expect(error).toBeNull();
  });

  it('enforces gate_id uniqueness', async () => {
    const { error } = await supabase.from('gate_witness_registry').insert({
      gate_id: 'test.G1A_VALID_EXTERNAL',
      classification: CLASSIFICATION.ALREADY_WITNESSED,
      witness_mechanism: WITNESS_MECHANISM.EXTERNAL_SYSTEM,
      enforcement_strength: ENFORCEMENT_STRENGTH.STRUCTURAL,
      classified_by: 'vitest',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/uq_gate_witness_registry_gate_id/);
  });
});
