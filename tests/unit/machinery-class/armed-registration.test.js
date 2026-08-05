/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-4) — ARMED registration via
 * periodic_process_registry reuse.
 */
import { describe, it, expect } from 'vitest';
import { armedProcessKey, registerArmedMachinery } from '../../../lib/machinery-class/armed-registration.js';

// SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-1: registerArmedMachinery now READS the existing row
// before upserting (so armed_at is written once and then AGES, and so a real last_fired_at is not
// wiped on re-registration). The mock models that read; `existing` is the row already in the table,
// or null for a first registration.
function fakeSb({ error = null, readError = null, existing = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: existing, error: readError }),
              };
            },
          };
        },
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

/**
 * SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-1 / TS-1 / TS-5.
 *
 * THE ARMING TIME MUST AGE. registerArmedMachinery runs on every in-window tick, so an inline
 * `armed_at: new Date()` would reset the clock each tick, the row would never pass its grace
 * window, and the FR-7 alarm could never fire — while every single-registration test still passed.
 * The only test that can see that defect registers TWICE with time in between, so that is the
 * first test here.
 */
describe('registerArmedMachinery — arming time (FR-1)', () => {
  it('stamps armed_at and grace_multiplier 2 on FIRST registration', async () => {
    const sb = fakeSb();
    const before = Date.now();
    const result = await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(result.ok).toBe(true);

    const payload = sb.calls[0].payload;
    expect(payload.grace_multiplier).toBe(2);
    expect(payload.last_fired_at).toBeNull();
    const armedMs = Date.parse(payload.liveness_source_ref.armed_at);
    expect(Number.isFinite(armedMs)).toBe(true);
    expect(armedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(result.armedAt).toBe(payload.liveness_source_ref.armed_at);
  });

  it('PRESERVES the original armed_at on re-registration — the value must AGE, not reset', async () => {
    const originalArmedAt = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
    const sb = fakeSb({
      existing: {
        liveness_source_ref: { sd_key: 'SD-X-001', activation_trigger: 'trigger', armed_at: originalArmedAt },
        last_fired_at: null,
      },
    });

    const result = await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(result.ok).toBe(true);
    // BYTE-IDENTICAL, not merely "present". A re-stamped armed_at would still be a valid ISO
    // string and would still satisfy a presence check, which is exactly how this defect hides.
    expect(sb.calls[0].payload.liveness_source_ref.armed_at).toBe(originalArmedAt);
  });

  it('does NOT reset a real last_fired_at when re-registering (pre-existing defect)', async () => {
    const firedAt = new Date(Date.now() - 60_000).toISOString();
    const sb = fakeSb({ existing: { liveness_source_ref: { armed_at: '2026-01-01T00:00:00.000Z' }, last_fired_at: firedAt } });

    await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    // Omitted from the upsert entirely, so ON CONFLICT DO UPDATE leaves the stored value alone.
    // Previously `last_fired_at: null` was written unconditionally, sending a process that HAD
    // fired back to looking never-produced.
    expect('last_fired_at' in sb.calls[0].payload).toBe(false);
  });

  it('preserves unrelated pre-existing liveness_source_ref keys', async () => {
    const sb = fakeSb({ existing: { liveness_source_ref: { armed_at: '2026-01-01T00:00:00.000Z', custom_key: 'keep-me' }, last_fired_at: null } });
    await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(sb.calls[0].payload.liveness_source_ref).toMatchObject({
      custom_key: 'keep-me',
      sd_key: 'SD-X-001',
      activation_trigger: 'trigger',
      armed_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('fails closed (no upsert) when the pre-read errors', async () => {
    const sb = fakeSb({ readError: { message: 'read failed' } });
    const result = await registerArmedMachinery(sb, { sd_key: 'SD-X-001' }, { activationTrigger: 'trigger' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('read failed');
    // Critical: an unreadable prior row must NOT fall through to an upsert, because that upsert
    // would write a fresh armed_at over an older one and silently reset the alarm clock.
    expect(sb.calls).toHaveLength(0);
  });
});
