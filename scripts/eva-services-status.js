#!/usr/bin/env node
/**
 * EVA Services Status Dashboard
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Displays health and capability status of all shared services.
 */

import { marketSizingService } from '../lib/eva/services/market-sizing.js';
import { painPointAnalyzerService } from '../lib/eva/services/pain-point-analyzer.js';
import { strategicFitEvaluatorService } from '../lib/eva/services/strategic-fit-evaluator.js';
import { riskAssessmentService } from '../lib/eva/services/risk-assessment.js';
import { financialModelingService } from '../lib/eva/services/financial-modeling.js';
import { dependencyResolutionService } from '../lib/eva/services/dependency-resolution.js';

const services = [
  marketSizingService,
  painPointAnalyzerService,
  strategicFitEvaluatorService,
  riskAssessmentService,
  financialModelingService,
  dependencyResolutionService,
];

// Legacy services (not yet using createService factory)
const legacyServices = [
  { name: 'brand-genome', status: 'legacy (CRUD-style, not factory-based)' },
  { name: 'venture-research', status: 'legacy (direct export)' },
  { name: 'competitive-intelligence', status: 'legacy (class-based)' },
];

console.log('\n=== EVA Shared Services Status ===\n');
console.log(`Factory-based services: ${services.length}/6`);
console.log(`Legacy services: ${legacyServices.length}/3`);
console.log(`Total: ${services.length + legacyServices.length}/9\n`);

console.log('--- Factory Services (createService pattern) ---\n');
for (const svc of services) {
  const ok = svc.name && svc.execute && svc.loadContext && svc.emit;
  const caps = svc.capabilities?.join(', ') || 'none';
  const stages = svc.stages?.join(', ') || 'all';
  console.log(`  ${ok ? 'OK' : 'ERR'} ${svc.name}`);
  console.log(`     Capabilities: ${caps}`);
  console.log(`     Stages: ${stages}`);
}

console.log('\n--- Legacy Services ---\n');
for (const svc of legacyServices) {
  console.log(`  --  ${svc.name} (${svc.status})`);
}

console.log('');
