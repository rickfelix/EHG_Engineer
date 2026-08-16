const m = await import('../scripts/modules/handoff/pre-checks/pending-migrations-check.js');
const on = await m.tierGateEnabled();
console.log('tierGateEnabled() LIVE =', on, '=> TIER-2 is', on ? 'ENFORCED (defers to chairman gate)' : 'ADVISORY ONLY (auto-applies anyway)');
console.log('TIER_GATE_BYPASS_FLAG =', m.TIER_GATE_BYPASS_FLAG);
