/**
 * Unit tests for lib/eva-support/sd-recommendation-emitter.js
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5 + TS-3/4/10/11.
 *
 * Covers:
 *   - TS-3: approve flow with override_reason ≥12 chars → outcome=approved, command emitted.
 *   - TS-4: counterfactual ≥80% match → outcome=skipped_duplicate, dup_sd_key surfaced, NO command emitted.
 *   - TS-10: decision-log written BEFORE render (call-order spy).
 *   - TS-11: render crash → audit row metadata.outcome updated to 'render_crashed'.
 *   - Static-source invariants (T1, T2, T7 boundaries).
 *   - Decline path (no/short override_reason → outcome=declined).
 *   - buildCommandPreview output shape.
 *   - Input validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../../../lib/eva-support/sd-recommendation-emitter.js');

describe('sd-recommendation-emitter — static source invariants', () => {
  const source = readFileSync(MODULE_PATH, 'utf8');

  it('T1 boundary: no child_process / execa / spawn imports', () => {
    expect(source).not.toMatch(/from\s+['"]child_process['"]/);
    expect(source).not.toMatch(/from\s+['"]execa['"]/);
    expect(source).not.toMatch(/spawn\s*\(/);
    expect(source).not.toMatch(/exec\s*\(/);
  });

  it('T2 boundary: no .from(strategic_directives_v2) call', () => {
    expect(source).not.toMatch(/\.from\(\s*['"]strategic_directives_v2['"]\s*\)/);
  });

  it('T2 boundary: writes only via sd-decision-log-writer (sd-decision-log-writer is sole supabase-write surface)', () => {
    // The emitter only imports from sd-decision-log-writer.js and crypto.
    expect(source).toMatch(/from\s+['"]\.\/sd-decision-log-writer(?:\.js)?['"]/);
    // No direct supabase imports here.
    expect(source).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
  });

  it('FR-5 thresholds match PRD acceptance criteria', () => {
    expect(source).toMatch(/COUNTERFACTUAL_THRESHOLD\s*=\s*80/);
    expect(source).toMatch(/MIN_OVERRIDE_REASON_LENGTH\s*=\s*12/);
  });
});

describe('sd-recommendation-emitter — buildCommandPreview()', () => {
  it('composes a /leo create command from full args', async () => {
    const { buildCommandPreview } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const cmd = buildCommandPreview({ sd_type: 'feature', target_application: 'EHG_Engineer', priority: 'high', title: 'Improve UI' });
    expect(cmd).toBe('/leo create --type feature --target EHG_Engineer --priority high --title "Improve UI"');
  });

  it('omits absent flags', async () => {
    const { buildCommandPreview } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    expect(buildCommandPreview({})).toBe('/leo create');
    expect(buildCommandPreview({ title: 'Just title' })).toBe('/leo create --title "Just title"');
  });

  it('escapes double quotes in title', async () => {
    const { buildCommandPreview } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    expect(buildCommandPreview({ title: 'Add "Related" prefix' })).toContain('--title "Add \\"Related\\" prefix"');
  });
});

describe('sd-recommendation-emitter — emit() runtime behavior', () => {
  // Per-test mock state. The mock factory closes over these via module-scope
  // references inside __mockState so beforeEach can reset between tests.
  const __mockState = {
    writeCalls: [],
    updateCalls: [],
  };

  beforeEach(() => {
    __mockState.writeCalls.length = 0;
    __mockState.updateCalls.length = 0;
    vi.resetModules();
    vi.doMock('../../../lib/eva-support/sd-decision-log-writer.js', () => ({
      writeAuditRow: vi.fn(async (args) => {
        __mockState.writeCalls.push({ args, at: Date.now() });
        return {
          inserted: true,
          row: {
            task_id: `SYSTEM:eva-support-sd-reader:${args.eva_invocation_id}`,
            sequence: 1,
            decision_kind: args.decision_kind,
            metadata: args.metadata,
          },
          error: null,
        };
      }),
      updateAuditRowMetadata: vi.fn(async (args) => {
        __mockState.updateCalls.push({ args, at: Date.now() });
        return {
          updated: true,
          row: { task_id: args.task_id, sequence: args.sequence, decision_kind: 'sd_recommendation', metadata: args.metadataPatch },
          error: null,
        };
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock('../../../lib/eva-support/sd-decision-log-writer.js');
  });

  // Helper accessors (used inside tests so __mockState.writeCalls is always current).
  const writeCalls = () => __mockState.writeCalls;
  const updateCalls = () => __mockState.updateCalls;

  it('TS-3: approve flow — override_reason ≥12 chars → outcome=approved, command in output', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const result = await emit({
      intent_text: 'Add Stripe checkout integration',
      title: 'Stripe checkout MVP',
      sd_type: 'feature',
      target_application: 'EHG',
      priority: 'high',
      override_reason: 'verified no overlap with PAY-001',
      eva_invocation_id: 'test-approve-001',
    });
    expect(result.outcome).toBe('approved');
    expect(result.counterfactual_applied).toBe(false);
    expect(result.command_text).toContain('/leo create');
    expect(result.command_text).toContain('"Stripe checkout MVP"');
    expect(result.output_text).toContain('Outcome (this invocation): approved');
    expect(result.audit_row_id).toBeTruthy();

    // Audit row written with outcome=approved + override_reason captured.
    expect(writeCalls()).toHaveLength(1);
    const row = writeCalls()[0].args;
    expect(row.decision_kind).toBe('sd_recommendation');
    expect(row.metadata.outcome).toBe('approved');
    expect(row.metadata.override_reason).toBe('verified no overlap with PAY-001');
    expect(row.metadata.title).toBe('Stripe checkout MVP');
  });

  it('TS-4: counterfactual ≥80% match → outcome=skipped_duplicate, NO command-preview text in output', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const result = await emit({
      intent_text: 'Add Stripe checkout',
      title: 'Stripe checkout',
      sd_type: 'feature',
      target_application: 'EHG',
      override_reason: 'this should not matter since dup found',
      findDupCandidates: async () => [{ sd_key: 'SD-EHG-PAY-002', confidence: 85 }],
      eva_invocation_id: 'test-skip-002',
    });
    expect(result.outcome).toBe('skipped_duplicate');
    expect(result.counterfactual_applied).toBe(true);
    expect(result.dup_sd_key).toBe('SD-EHG-PAY-002');
    expect(result.output_text).toContain('SD recommendation SKIPPED');
    expect(result.output_text).toContain('SD-EHG-PAY-002');
    // The "Proposed command" header is NOT in the skipped-duplicate output.
    expect(result.output_text).not.toContain('Proposed command');

    // Audit row metadata.outcome=skipped_duplicate, dup_sd_key set.
    expect(writeCalls()).toHaveLength(1);
    expect(writeCalls()[0].args.metadata.outcome).toBe('skipped_duplicate');
    expect(writeCalls()[0].args.metadata.dup_sd_key).toBe('SD-EHG-PAY-002');
  });

  it('TS-4 (boundary): dup confidence at threshold (80) triggers skip; 79 does not', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');

    const r80 = await emit({
      intent_text: 'boundary 80',
      title: 'b80',
      override_reason: 'long enough reason here',
      findDupCandidates: async () => [{ sd_key: 'SD-MATCH-80', confidence: 80 }],
      eva_invocation_id: 'b80',
    });
    expect(r80.outcome).toBe('skipped_duplicate');

    const r79 = await emit({
      intent_text: 'boundary 79',
      title: 'b79',
      override_reason: 'long enough reason here',
      findDupCandidates: async () => [{ sd_key: 'SD-MATCH-79', confidence: 79 }],
      eva_invocation_id: 'b79',
    });
    expect(r79.outcome).toBe('approved');
  });

  it('decline path: no override_reason → outcome=declined, command IS in output (for re-approval)', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const result = await emit({
      intent_text: 'Add new feature X',
      title: 'Feature X',
      eva_invocation_id: 'test-decline-001',
    });
    expect(result.outcome).toBe('declined');
    expect(result.output_text).toContain('Proposed command');
    expect(result.output_text).toContain('To approve: respond with `Override:');
    expect(writeCalls()).toHaveLength(1);
    expect(writeCalls()[0].args.metadata.outcome).toBe('declined');
    expect(writeCalls()[0].args.metadata.override_reason).toBeUndefined();
  });

  it('decline path: too-short override_reason (<12 chars) → outcome=declined', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const result = await emit({
      intent_text: 'short reason intent',
      title: 'Short reason',
      override_reason: 'too short', // 9 chars
      eva_invocation_id: 'test-decline-short',
    });
    expect(result.outcome).toBe('declined');
  });

  it('TS-10: decision-log write happens BEFORE render — verified via injectable renderer', async () => {
    // Use the injectable _render seam: the test renderer records the time at
    // which it was called, then we compare to the write timestamp recorded by
    // the writer mock. Write timestamp must precede render timestamp.
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    let renderCalledAt = null;
    // Renderer is SYNC (matches production renderRecommendationOutput shape).
    const recordingRender = () => {
      renderCalledAt = Date.now();
      return 'rendered output';
    };
    const result = await emit({
      intent_text: 'TS-10 verify call order',
      title: 'TS-10',
      override_reason: 'long enough override reason here',
      eva_invocation_id: 'ts10',
      _render: recordingRender,
    });

    expect(renderCalledAt).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
    // writeCalls[0].at is when the mock writer finished — must be <= renderCalledAt.
    expect(writeCalls()[0].at).toBeLessThanOrEqual(renderCalledAt);
    expect(result.output_text).toBe('rendered output');
  });

  it('TS-11: render crash → audit row metadata.outcome updated to render_crashed', async () => {
    // Use the injectable _render seam to deterministically trigger a render-time
    // exception AFTER the pre-render audit row has been written.
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    const crashRender = () => { throw new Error('synthetic render failure for TS-11'); };

    let threw = false;
    let caught = null;
    try {
      await emit({
        intent_text: 'TS-11 crash test',
        title: 'TS-11',
        override_reason: 'long enough override reason',
        eva_invocation_id: 'ts11',
        _render: crashRender,
      });
    } catch (err) {
      threw = true;
      caught = err;
    }

    expect(threw).toBe(true);
    expect(caught.message).toMatch(/synthetic render failure/);

    // Pre-render audit row was written.
    expect(writeCalls()).toHaveLength(1);
    expect(writeCalls()[0].args.decision_kind).toBe('sd_recommendation');
    expect(writeCalls()[0].args.metadata.outcome).toBe('approved'); // pre-render outcome

    // Post-crash, the catch block updated the audit row metadata.
    expect(updateCalls()).toHaveLength(1);
    expect(updateCalls()[0].args.task_id).toBe('SYSTEM:eva-support-sd-reader:ts11');
    expect(updateCalls()[0].args.metadataPatch.outcome).toBe('render_crashed');
    expect(updateCalls()[0].args.metadataPatch.error_message).toMatch(/synthetic render failure/);
  });

  it('rejects empty intent_text', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    await expect(emit({ intent_text: '', title: 'x', override_reason: 'long enough text' })).rejects.toThrow(/intent_text/);
    await expect(emit({ intent_text: '   ', title: 'x', override_reason: 'long enough text' })).rejects.toThrow(/intent_text/);
  });

  it('rejects empty title', async () => {
    const { emit } = await import('../../../lib/eva-support/sd-recommendation-emitter.js');
    await expect(emit({ intent_text: 'x', title: '', override_reason: 'long enough text' })).rejects.toThrow(/title/);
  });
});
