/**
 * SD-REFILL-007PVF5E (FR-5) — source-conformance guard for the phantom-column cleanup.
 *
 * Scans the two EVA files and asserts the IN-SCOPE phantom-column refs were removed and remapped to
 * live columns, while the documented AMBIGUOUS sites (chairman_decisions.metadata?.strategy in the S17
 * strategy gate, decision-filter-engine triggers/violations) remain pragma-marked and untouched (kept
 * deliberately — a forced remap would silently degrade gate behavior; tracked as a product-gap follow-up).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const worker = readFileSync(resolve(repoRoot, 'lib/eva/stage-execution-worker.js'), 'utf8');
const dfe = readFileSync(resolve(repoRoot, 'lib/eva/decision-filter-engine.js'), 'utf8');

describe('phantom-column cleanup — in-scope sites fixed', () => {
  it('venture_stage_work upsert no longer references the phantom stage_number column', () => {
    // narrow to the venture_stage_work upsert (venture_stages.stage_number is a DIFFERENT, live column)
    expect(worker).not.toMatch(/\bstage_number:\s*stageNumber/); // phantom upsert key (\b excludes p_stage_number RPC param)
    expect(worker).not.toMatch(/onConflict:\s*'venture_id,stage_number'/); // phantom conflict target
    // the real unique constraint is used for the upsert conflict target
    expect(worker).toMatch(/onConflict:\s*'venture_id,lifecycle_stage'/);
  });

  it('venture_stage_work upsert/read use lifecycle_stage', () => {
    // the advisory-warning method now keys off lifecycle_stage
    expect(worker).toMatch(/\.eq\('lifecycle_stage', stageNumber\)/);
    expect(worker).toMatch(/lifecycle_stage:\s*stageNumber/);
  });

  it('the dead legacy stage_data fallback is gone', () => {
    expect(worker).not.toMatch(/\.select\('stage_data'\)/);
    expect(worker).not.toMatch(/s11Work\?\.stage_data/);
  });

  it('audit_log insert conforms to the live schema (NOT NULL entity_type/entity_id, metadata-folded)', () => {
    // the chairman_warning audit insert must carry the required entity columns
    const insertBlock = worker.slice(worker.indexOf("event_type: 'chairman_warning'"), worker.indexOf("event_type: 'chairman_warning'") + 600);
    expect(insertBlock).toMatch(/entity_type:\s*'venture'/);
    expect(insertBlock).toMatch(/entity_id:\s*ventureId/);
    // the former phantom values are folded into metadata (no standalone details: key)
    expect(insertBlock).toMatch(/metadata:\s*\{/);
    expect(insertBlock).not.toMatch(/\n\s{8}details:\s*\{/); // 'details' was a direct insert key; now gone
    // event_subtype is now NESTED inside metadata (appears after 'metadata: {'), not a top-level column
    expect(insertBlock.indexOf('metadata: {')).toBeLessThan(insertBlock.indexOf('event_subtype'));
    expect(insertBlock).toMatch(/event_subtype:\s*'gvos_low_confidence_archetype'/);
  });

  it('the chairman_decisions resolve update dropped the phantom resolved_at', () => {
    expect(worker).not.toMatch(/resolved_at:\s*new Date/);
  });
});

describe('phantom-column cleanup — ambiguous sites deliberately kept', () => {
  it('the S17 strategy-gate metadata.strategy reads remain (pragma-marked) — not force-remapped', () => {
    // these still read metadata?.strategy; a remap would silently degrade the gate (no live writer)
    expect(worker).toMatch(/metadata\?\.strategy/);
    // and they stay pragma-suppressed so the schema-lint does not block on a known, tracked gap
    const pragmaCount = (worker.match(/schema-lint-disable-line/g) || []).length;
    expect(pragmaCount).toBe(3); // exactly the three S17 strategy-cluster selects
  });

  it('decision-filter-engine triggers/violations select remains pragma-marked', () => {
    expect(dfe).toMatch(/schema-lint-disable-line/);
    expect(dfe).toMatch(/metadata\?\.(triggers|violations)|d\.metadata/);
  });
});
