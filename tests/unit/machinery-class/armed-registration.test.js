/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-4) — ARMED registration via
 * periodic_process_registry reuse.
 */
import { describe, it, expect } from 'vitest';
import { armedProcessKey, registerArmedMachinery } from '../../../lib/machinery-class/armed-registration.js';

function fakeSb({ error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(payload, options) {
          calls.push({ table, payload, options });
          return Promise.resolve({ data: error ? null : [payload], error });
        },
      };
    },
  };
}

describe('armedProcessKey', () => {
  it('derives a stable, sanitized key from an sd_key', () => {
    expect(armedProcessKey('SD-LEO-INFRA-FOO-001')).toBe('g3-armed-sd-leo-infra-foo-001');
  });
  it('handles a missing sd_key without throwing', () => {
    expect(armedProcessKey(undefined)).toBe('g3-armed-unknown');
  });
});

describe('registerArmedMachinery', () => {
  it('requires activationTrigger — rejects without it', async () => {
    const sb = fakeSb();
    const result = await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_activation_trigger');
    expect(sb.calls).toHaveLength(0);
  });

  it('requires sd_key — rejects without it', async () => {
    const sb = fakeSb();
    const result = await registerArmedMachinery(sb, {}, { activationTrigger: 'when producer X ships' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_sd_key');
  });

  it('upserts a periodic_process_registry row with last_fired_at=null (the ARMED signature)', async () => {
    const sb = fakeSb();
    const result = await registerArmedMachinery(sb, { sd_key: 'SD-LEO-INFRA-FOO-001' }, { activationTrigger: 'when producer X ships' });
    expect(result.ok).toBe(true);
    expect(result.processKey).toBe('g3-armed-sd-leo-infra-foo-001');
    expect(sb.calls[0].table).toBe('periodic_process_registry');
    expect(sb.calls[0].payload).toMatchObject({
      process_key: 'g3-armed-sd-leo-infra-foo-001',
      process_type: 'standalone_cron',
      liveness_source: 'self_stamped',
      last_fired_at: null,
      currently_expected_active: true,
      liveness_source_ref: { sd_key: 'SD-LEO-INFRA-FOO-001', activation_trigger: 'when producer X ships' },
    });
    expect(sb.calls[0].options).toEqual({ onConflict: 'process_key' });
  });

  it('defaults expected_interval_seconds to 86400 when not supplied', async () => {
    const sb = fakeSb();
    await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(sb.calls[0].payload.expected_interval_seconds).toBe(86400);
  });

  it('honors a caller-supplied expected_interval_seconds', async () => {
    const sb = fakeSb();
    await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger', expectedIntervalSeconds: 3600 });
    expect(sb.calls[0].payload.expected_interval_seconds).toBe(3600);
  });

  it('fails open (ok:false, no throw) on a supabase upsert error', async () => {
    const sb = fakeSb({ error: { message: 'boom' } });
    const result = await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });
});
