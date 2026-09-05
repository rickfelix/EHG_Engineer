/**
 * SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-4, FR-5(d) -- unit coverage for
 * scripts/ci/scheduler-round-cadence-parity.mjs's pure parser.
 */
import { describe, it, expect } from 'vitest';
import { parseSchedulerRegistrations } from '../../../scripts/ci/scheduler-round-cadence-parity.mjs';

describe('parseSchedulerRegistrations', () => {
  it('parses a registerJob call whose object literal contains a nested handler function (brace-balanced, not non-greedy)', () => {
    const src = `
      this.registerJob({
        name: 'okr-day28-hardstop',
        handler: async () => {
          return domainRegistry.dispatch('okr_day28_hardstop', { supabase: this.supabase, logger: this.logger });
        },
        cadenceDays: 30,
        enabled: process.env.OKR_DAY28_HARDSTOP_ENABLED !== 'false',
      });
    `;
    const result = parseSchedulerRegistrations(src);
    expect(result.get('scheduler_round:okr-day28-hardstop')).toEqual({ seconds: 2592000, source: 'registerJob', rawCadence: 30 });
  });

  it('parses multiple registerJob calls independently', () => {
    const src = `
      this.registerJob({ name: 'a', handler: async () => { return 1; }, cadenceDays: 15 });
      this.registerJob({ name: 'b', handler: async () => { return 2; }, cadenceDays: 30 });
    `;
    const result = parseSchedulerRegistrations(src);
    expect(result.get('scheduler_round:a').seconds).toBe(1296000);
    expect(result.get('scheduler_round:b').seconds).toBe(2592000);
  });

  it('parses a registerRound call and maps a known cadence string to seconds', () => {
    const src = `this.registerRound('portfolio_review', { name: 'Portfolio Review', cadence: 'weekly' });`;
    const result = parseSchedulerRegistrations(src);
    expect(result.get('scheduler_round:portfolio_review')).toEqual({ seconds: 604800, source: 'registerRound', rawCadence: 'weekly' });
  });

  it('maps monthly and daily cadence strings correctly', () => {
    const src = `
      this.registerRound('stage_health', { cadence: 'monthly' });
      this.registerRound('daily_digest', { cadence: 'daily' });
    `;
    const result = parseSchedulerRegistrations(src);
    expect(result.get('scheduler_round:stage_health').seconds).toBe(2592000);
    expect(result.get('scheduler_round:daily_digest').seconds).toBe(86400);
  });

  it('returns seconds:null for an unmapped cadence string (e.g. frequent) rather than guessing', () => {
    const src = `this.registerRound('sensemaking_disposition_monitor', { cadence: 'frequent' });`;
    const result = parseSchedulerRegistrations(src);
    expect(result.get('scheduler_round:sensemaking_disposition_monitor').seconds).toBeNull();
  });

  it('does not register anything for source with no matching calls', () => {
    const result = parseSchedulerRegistrations('// nothing here');
    expect(result.size).toBe(0);
  });
});
