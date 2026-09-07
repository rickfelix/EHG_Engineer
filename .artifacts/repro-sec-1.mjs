import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { countUnreceiptedOverdue } = require('../lib/fleet/outstanding-signals.cjs');
const { decide } = require('../lib/coordinator/capped-pool-broadcast.cjs');
const { GAUGE_REGISTRY } = await import('../lib/governance/gauge-registry.js');

const shape = (raw) => (raw === 'unknown' ? { count: 1, status: 'unknown', unreceipted: 'unknown' } : { count: raw, status: 'ok', unreceipted: raw });
const entry = GAUGE_REGISTRY.find(e => e.id === 'unreceipted-signals-overdue');
const healthy = shape(countUnreceiptedOverdue(null));
console.log('A) zero-outstanding-signals (fetch returns null on empty):', JSON.stringify(healthy),
            '=> trips =', entry.thresholdConfig.tripWhen(healthy));

const now = Date.parse('2026-09-06T12:00:00Z');
const blip = { over_cap_since: new Date(now - 60_000).toISOString(), last_emitted_at: null, last_cleared_notice_at: null };
console.log('B) 1-min blip over cap then clears (no emit ever sent) ->', decide({ used: 38, cap: 40, state: blip, nowMs: now }).action);

const stateOverCap = { over_cap_since: new Date(now - 3*3600_000).toISOString(), last_emitted_at: new Date(now - 2*3600_000).toISOString(), last_cleared_notice_at: null };
const d = decide({ used: 0, cap: 40, state: stateOverCap, nowMs: now });
console.log('C) census unreadable (countActiveWorktrees fail-open returns 0) ->', d.action, '| over_cap_since reset to', d.nextState.over_cap_since);
