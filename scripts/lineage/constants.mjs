// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0
// Single source of truth for the lineage-layer confidence threshold.
// DB CHECK constraint enforces NUMERIC range only (0-100); this constant defines
// the verdict-tier boundary (>= => BACKFILLED_HIGH; < => BACKFILLED_LOW_CONFIDENCE).

export const CONFIDENCE_THRESHOLD = 95;

export const VERDICT_HIGH = 'BACKFILLED_HIGH';
export const VERDICT_LOW = 'BACKFILLED_LOW_CONFIDENCE';
export const VERDICT_GRANDFATHERED = 'GRANDFATHERED_NO_VALIDATION';

export const BACKFILL_TARGET_CAP = 50;

export const KILL_SWITCH_ACCURACY_THRESHOLD = 90;

export const APP_CONFIG_KEYS = {
  KILL_SWITCH: 'child_0_kill_switch',
  SHADOW_SAMPLING_PROTOCOL: 'child_0_shadow_sampling_protocol',
};
