# Adding an opportunity blueprint

Category: Guide
Status: Approved
Version: 1.0.0
Last Updated: 2026-08-30
Tags: opportunity-blueprints, vision-gauge, calibration

SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 seeded the `opportunity_blueprints` active queue
using already-shipped machinery from `SD-LEO-INFRA-REALIZE-GATE-CALIBRATION-001`. Adding
another blueprint later follows the same 3-step path — no new code required for the common
case.

## The 3-step path

1. **Author the blueprint content.** Source problem/market context from wherever is
   appropriate (a cancelled venture's `problem_statement`/`target_market`, a fresh idea, etc.),
   then author the fields `evaluateIntakeBar()` reads that don't exist as source-table columns:
   `kill_assumption`, `spof_assumption`, `customer_evidence`. See
   `lib/discovery/intake-bar.js`'s `CHECKS` array for the full 7-point bar. Set
   `source_type` to anything other than `'manual'` — `scripts/discovery/reseed-queue.mjs`'s
   `classify()` archives any `source_type==='manual'` row as `e2e_fixture` on the next reseed.

2. **Write it via the existing persistence path.** Call
   `OpportunityDiscoveryService.saveBlueprintsToDatabase(blueprints)`
   (`lib/discovery/opportunity-discovery-service.js`) with an array of blueprint objects. This
   internally calls `buildBlueprintRow()`/`evaluateIntakeBar()` and stamps
   `metadata.calibration_cohort=true` + `metadata.intake_bar` automatically — do not call
   `buildBlueprintRow()` directly (it returns only `{metadata}` and is not a full-row builder).
   See `scripts/discovery/seed-opportunity-blueprints.mjs` for a working example.

3. **Run the stamping CLI.**
   ```
   node scripts/discovery/calibration-cohort-report.mjs --stamp
   ```
   This calls `readCalibrationCohort({stamp:true})`
   (`lib/discovery/calibration-cohort-reader.js`), which reads every row with
   `metadata.calibration_cohort=true` and sets `metadata.calibration_read_at`. The vision-build
   gauge's "Calibrate the gates" probe (`lib/vision/vdr-registry.js`) reads exactly this
   signal (`is_active=true` + `calibration_read_at IS NOT NULL`, `min:3`).

## Verifying the gauge flip

```js
import { VDR_REGISTRY } from './lib/vision/vdr-registry.js';
import { runProbe } from './lib/vision/vdr-probes.js';
const entry = VDR_REGISTRY.find((e) => e.capability === 'Calibrate the gates');
const result = await runProbe(entry.probe, { supabase });
// { status: 'built'|'partial'|'unbuilt', value: <count>, detail: '...' }
```

## Guardrails already in place

- **Fixture/archive-safe**: an `is_active=true` filter on the probe means archiving a seeded
  row (e.g. via `scripts/discovery/reseed-queue.mjs`) removes it from the count honestly —
  no silent re-zero, no silent stale-green.
- **Anti-inflation floor**: the probe requires `min:3`, not `min:1` — a single stray/seed row
  can never alone credit the capability as built.
