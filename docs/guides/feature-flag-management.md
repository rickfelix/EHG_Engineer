---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Feature Flag Management Guide


## Table of Contents

- [Overview](#overview)
- [Database Tables](#database-tables)
- [Available Feature Flags](#available-feature-flags)
  - [Phase 1 Quality Layer Flags](#phase-1-quality-layer-flags)
- [Usage](#usage)
  - [Evaluating a Flag](#evaluating-a-flag)
  - [Managing Flags](#managing-flags)
- [Evaluation Order](#evaluation-order)
- [Kill Switch (CONST-009)](#kill-switch-const-009)
- [Deterministic Rollout](#deterministic-rollout)
- [Caching](#caching)
- [Audit Trail](#audit-trail)
- [Integration with Feedback Quality Layer](#integration-with-feedback-quality-layer)
- [Troubleshooting](#troubleshooting)
  - [Flag Not Working as Expected](#flag-not-working-as-expected)
  - [Emergency Procedures](#emergency-procedures)
- [Related Documentation](#related-documentation)

**SD-LEO-SELF-IMPROVE-001D - Phase 1.5: Feature Flag Foundation**

This guide covers the LEO Protocol's feature flag infrastructure for runtime control and emergency rollback of Phase 1 Feedback Quality Layer capabilities.

## Overview

The feature flag system provides:
- **Runtime Control**: Enable/disable features without code deployment
- **Gradual Rollout**: Percentage-based rollout with user targeting
- **Kill Switch (CONST-009)**: Emergency global disable for all feature flags
- **Audit Trail**: Complete history of all flag changes

## Database Tables

| Table | Purpose |
|-------|---------|
| `leo_feature_flags` | Core flag definitions |
| `leo_feature_flag_policies` | Per-environment rollout policies |
| `leo_kill_switches` | Emergency kill switches |
| `leo_feature_flag_audit_log` | Audit trail for all changes |

## Available Feature Flags

### Phase 1 Quality Layer Flags

| Flag Key | Purpose | Default |
|----------|---------|---------|
| `quality_layer_sanitization` | PII redaction & prompt injection detection | Enabled (100%) |
| `quality_layer_quarantine` | Risk-based quarantine of harmful feedback | Enabled (100%) |
| `quality_layer_audit_logging` | Audit trail generation | Enabled (100%) |
| `quality_layer_enhancement` | Automatic feedback enhancement suggestions | Enabled (100%) |

## Usage

### Evaluating a Flag

```javascript
import { evaluateFlag, isEnabled } from '../lib/feature-flags/index.js';

// Full evaluation with details
const result = await evaluateFlag('quality_layer_sanitization', {
  subjectId: 'user-123',        // User identifier for rollout
  environment: 'production'      // production | staging | development
});

console.log(result);
// {
//   flagKey: 'quality_layer_sanitization',
//   enabled: true,
//   reason: 'rollout_100_percent',
//   subjectId: 'user-123',
//   environment: 'production',
//   evaluationTimeMs: 2
// }

// Simple boolean check
const isOn = await isEnabled('quality_layer_sanitization', { subjectId: 'user-123' });
```

### Managing Flags

```javascript
import {
  createFlag,
  updateFlag,
  deleteFlag,
  setPolicy
} from '../lib/feature-flags/index.js';

// Create a new flag
await createFlag({
  flagKey: 'new_feature',
  displayName: 'New Feature',
  description: 'Description of the new feature',
  isEnabled: false,
  changedBy: 'admin@example.com'
});

// Update a flag
await updateFlag('new_feature', {
  isEnabled: true
}, 'admin@example.com');

// Set rollout policy
await setPolicy({
  flagKey: 'new_feature',
  environment: 'production',
  rolloutPercentage: 50,  // 50% of users
  userTargeting: {
    allowlist: { subject_ids: ['beta_user_1', 'beta_user_2'] },
    blocklist: { subject_ids: ['problem_user'] }
  },
  changedBy: 'admin@example.com'
});
```

## Evaluation Order

When `evaluateFlag()` is called, checks happen in this order:

1. **CONST-009 Kill Switch** → If active, return disabled
2. **Flag Exists** → If not found, return disabled
3. **Global Enabled** → If `is_enabled=false`, return disabled
4. **Allowlist Match** → If subjectId in allowlist, return enabled
5. **Blocklist Match** → If subjectId in blocklist, return disabled
6. **Rollout Percentage** → Deterministic hash-based evaluation

## Kill Switch (CONST-009)

The CONST-009 kill switch provides emergency global disable:

```javascript
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive
} from '../lib/feature-flags/index.js';

// Check status
const isActive = await isKillSwitchActive();

// Emergency activation (ALL feature flags → disabled)
await activateKillSwitch('CONST-009', 'incident-responder@example.com');

// Deactivate after incident resolved
await deactivateKillSwitch('CONST-009', 'incident-responder@example.com');
```

**When CONST-009 is active:**
- ALL feature flags evaluate to `disabled`
- Reason code: `kill_switch_active`
- Takes effect within 30 seconds (cache TTL)

## Deterministic Rollout

Rollout percentages use deterministic hashing:

```
hash = MD5(flagKey + ":" + subjectId) % 100
enabled = hash < rolloutPercentage
```

This ensures:
- Same user always gets the same result for a given flag
- Results are consistent across evaluations
- No need for persistent bucketing storage

## Caching

The evaluator caches flag data for performance:

| Setting | Value |
|---------|-------|
| Cache TTL | 30 seconds |
| Kill switch propagation | <30 seconds |

```javascript
import { clearCache } from '../lib/feature-flags/index.js';

// Force cache refresh (after config changes)
clearCache();
```

## Audit Trail

All operations are logged to `leo_feature_flag_audit_log`:

| Action | When Logged |
|--------|-------------|
| `created` | Flag created |
| `updated` | Flag modified |
| `deleted` | Flag removed |
| `policy_created` | New policy added |
| `policy_updated` | Policy modified |
| `kill_switch_activated` | CONST-009 activated |
| `kill_switch_deactivated` | CONST-009 deactivated |

Query audit history:
```sql
SELECT * FROM leo_feature_flag_audit_log
WHERE flag_key = 'quality_layer_sanitization'
ORDER BY created_at DESC
LIMIT 10;
```

## Integration with Feedback Quality Layer

The `processQuality()` function automatically evaluates feature flags:

```javascript
import { processQuality } from '../lib/quality/index.js';

const result = await processQuality(feedback, {
  subjectId: 'user-123',        // Used for flag evaluation
  environment: 'production'
});

// Feature flag results included in response
console.log(result.featureFlags);
// {
//   sanitization: { enabled: true, reason: 'rollout_100_percent', ... },
//   quarantine: { enabled: true, reason: 'rollout_100_percent', ... },
//   audit: { enabled: true, reason: 'rollout_100_percent', ... }
// }
```

## Troubleshooting

### Flag Not Working as Expected

1. Check CONST-009 kill switch status
2. Verify flag exists and is globally enabled
3. Check environment-specific policy
4. Verify subjectId isn't blocklisted
5. Clear cache and retry

### Emergency Procedures

**To disable all feature flags immediately:**
```bash
node -e "
require('dotenv').config();
const { activateKillSwitch } = require('./lib/feature-flags/index.js');
activateKillSwitch('CONST-009', 'emergency').then(() => console.log('Kill switch activated'));
"
```

**To restore after incident:**
```bash
node -e "
require('dotenv').config();
const { deactivateKillSwitch } = require('./lib/feature-flags/index.js');
deactivateKillSwitch('CONST-009', 'resolution').then(() => console.log('Kill switch deactivated'));
"
```

## Related Documentation

- Feedback Quality Layer
- SD-LEO-SELF-IMPROVE-001C PRD
- SD-LEO-SELF-IMPROVE-001D PRD
