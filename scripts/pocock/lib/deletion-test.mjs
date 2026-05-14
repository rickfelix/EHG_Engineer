// SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-D — Deletion Test scorer.
// Pure function: classify a module by (callerCount, adapterCount) into
// vanish (complexity disappears) / concentrate (collapses onto few callers) /
// real_seam (genuine architectural boundary).

const VANISH_MAX = 2;        // <3 callers → vanish
const CONCENTRATE_MAX = 5;   // 3..5 callers → concentrate
                              // >5 callers → real_seam

export function scoreModule(callerCount, adapterCount) {
  const c = Number(callerCount);
  const a = Number(adapterCount);
  if (!Number.isFinite(c) || c < 0) {
    throw new Error(`scoreModule: callerCount must be a non-negative number (got ${callerCount})`);
  }
  if (!Number.isFinite(a) || a < 0) {
    throw new Error(`scoreModule: adapterCount must be a non-negative number (got ${adapterCount})`);
  }
  if (c <= VANISH_MAX) return 'vanish';
  if (c <= CONCENTRATE_MAX) return 'concentrate';
  return 'real_seam';
}

// Per Pocock adapter-count rule: one adapter = hypothetical seam, two
// adapters = real seam. Promote a 'concentrate' verdict to 'real_seam' when
// adapter_count >= 2 because the seam has been independently exercised by
// multiple consumers.
export function scoreWithAdapterRule(callerCount, adapterCount) {
  const base = scoreModule(callerCount, adapterCount);
  if (base === 'concentrate' && Number(adapterCount) >= 2) return 'real_seam';
  return base;
}

export default scoreModule;
