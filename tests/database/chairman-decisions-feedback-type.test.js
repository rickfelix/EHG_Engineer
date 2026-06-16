/**
 * Chairman decision-queue feedback-type regression guard
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-FEEDBACK-TYPE-001
 *
 * The chairman decision-queue CLI (scripts/chairman-decisions.mjs) writes a feedback
 * audit row from recordFlagCall (flag-enablement) and recordDeferral (deferral). Both
 * previously hardcoded type:'improvement' — a value the live feedback_type_check CHECK
 * constraint REJECTS (it allows only {issue, enhancement}) — making both decision paths
 * 100% broken. The fix routes both writers through the shared CHAIRMAN_FEEDBACK_TYPE
 * constant.
 *
 * This test asserts the emitted value against the LIVE constraint (NOT a mock) via real
 * INSERT probes, and proves the old value is still rejected — so a future literal drift
 * back to a disallowed value is caught.
 *
 * Sandbox: probe rows use a PROBE-CDQFT-* title and category='harness_backlog'; each
 * probe row is deleted in the same test (no residue). No peer rows are touched.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { CHAIRMAN_FEEDBACK_TYPE } from '../../lib/chairman/feedback-decision-type.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// The exact NOT-NULL columns the live feedback table requires, so a probe isolates the
// feedback_type_check constraint rather than failing on an unrelated NOT-NULL violation.
const probeRow = (type) => ({
  type,
  source_application: 'EHG_Engineer',
  source_type: 'auto_capture',
  category: 'harness_backlog',
  status: 'new',
  severity: 'low',
  title: 'PROBE-CDQFT ephemeral ' + type,
  description: 'ephemeral feedback_type_check probe — safe to delete',
});

const createdIds = [];
afterAll(async () => {
  if (createdIds.length) await supabase.from('feedback').delete().in('id', createdIds);
});

describe('chairman feedback-type constant (SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-FEEDBACK-TYPE-001)', () => {
  it('is not the constraint-violating "improvement" literal', () => {
    expect(CHAIRMAN_FEEDBACK_TYPE).not.toBe('improvement');
  });

  it('is ACCEPTED by the live feedback_type_check constraint (real INSERT probe)', async () => {
    const { data, error } = await supabase
      .from('feedback')
      .insert(probeRow(CHAIRMAN_FEEDBACK_TYPE))
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) createdIds.push(data.id);
  });

  it('the OLD "improvement" value is still REJECTED by feedback_type_check (proves the gate is live, not mocked)', async () => {
    const { data, error } = await supabase
      .from('feedback')
      .insert(probeRow('improvement'))
      .select('id')
      .single();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toContain('feedback_type_check');
    // Defensive: if a future constraint change ever accepted it, clean up so we leak nothing.
    if (data?.id) createdIds.push(data.id);
  });
});
