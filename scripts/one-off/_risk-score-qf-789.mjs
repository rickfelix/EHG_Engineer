import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 134, filesChanged: ['lib/fleet/seat-idle-predicate.mjs', 'scripts/coordinator-idle-qf-hint.mjs', 'tests/unit/coordinator/idle-qf-hint.test.js', 'tests/unit/seat-idle-predicate.test.js'] },
  2,
  undefined,
  'add an opt-in freshness axis to a shared idle predicate so a held claim excludes idle only while advancing, and fix an early-return that reported unmeasured counters as zero'
);
console.log(JSON.stringify(result, null, 2));
