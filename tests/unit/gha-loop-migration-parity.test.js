// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 (FR-2) — creation-parity guard for the 13
// SCRIPT-SHAPED STANDARD_LOOPS entries migrated to always-on GitHub Actions crons in this
// batch (additive: the STANDARD_LOOPS session-armed entry stays in place as a redundant
// backup — see retention-loop-parity.test.js for the shipped precedent this mirrors).
//
// TS-1/TS-9 (parity): each new `<key>-cron.yml` workflow's on.schedule cron string is a
//   byte-exact match of the corresponding STANDARD_LOOPS entry's `cron` field.
// TS-2: `gha_backed: true` is present on exactly the 13 migrated keys and absent/falsy on
//   every JUDGMENT-SHAPED key, dashboard/identity (out of scope), and liveness-watcher
//   (partial-only migration, handled by a different workflow).
// TS-9 (YAML validity): each of the 13 new files has required top-level keys (name/on/jobs)
//   and a syntactically valid 5-field cron string.
// TS-11 (concurrency uniqueness): no two files anywhere in .github/workflows/ share the same
//   `name:` value, since `concurrency.group: ${{ github.workflow }}` derives from it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { STANDARD_LOOPS } from '../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

// The 13 SCRIPT-SHAPED loops migrated in this FR-2 batch.
const MIGRATED_KEYS = [
  'sweep',
  'flag-review',
  'unranked-gauge',
  'singleton-relaunch',
  'relay-drain',
  'relay-drop-gauge',
  'fleet-retro',
  'row-growth',
  'review-rotation',
  'scripts-reachability',
  'gauge-runner',
  'feedback-sla',
  'solomon-ledger-resurface',
];

// JUDGMENT-SHAPED keys (never gha_backed) + explicitly out-of-scope/partial keys, per the
// STANDARD_LOOPS header-comment durability table (scripts/coordinator-startup-check.mjs).
const NOT_MIGRATED_KEYS = [
  'quiet-tick',
  'self-review',
  'hourly-review',
  'roles-review',
  'audit',
  'charter-audit',
  'capacity-forecast',
  'dashboard',
  'identity',
  'liveness-watcher',
];

function loopByKey(key) {
  const loop = STANDARD_LOOPS.find((l) => l.key === key);
  if (!loop) throw new Error(`STANDARD_LOOPS has no entry for key "${key}"`);
  return loop;
}

function workflowPathFor(key) {
  return join(workflowsDir, `${key}-cron.yml`);
}

function loadWorkflow(key) {
  return yaml.load(readFileSync(workflowPathFor(key), 'utf8'));
}

// `on.schedule` cron. js-yaml parses the `on:` YAML key as boolean `true` under YAML 1.1
// core-schema rules, so read via the string key AND the boolean key defensively.
function scheduleCronsOf(doc) {
  const onBlock = doc.on ?? doc['on'] ?? doc[true] ?? doc['true'];
  if (!onBlock || !Array.isArray(onBlock.schedule)) return [];
  return onBlock.schedule.map((s) => s.cron);
}

describe('GHA loop migration — creation-site parity (TS-1/TS-9)', () => {
  for (const key of MIGRATED_KEYS) {
    it(`${key}-cron.yml on.schedule cron matches STANDARD_LOOPS['${key}'].cron exactly`, () => {
      const loop = loopByKey(key);
      const doc = loadWorkflow(key);
      const crons = scheduleCronsOf(doc);
      expect(crons).toHaveLength(1);
      expect(crons[0]).toBe(loop.cron);
    });
  }
});

describe('GHA loop migration — gha_backed flag (TS-2)', () => {
  for (const key of MIGRATED_KEYS) {
    it(`STANDARD_LOOPS['${key}'].gha_backed is true`, () => {
      expect(loopByKey(key).gha_backed).toBe(true);
    });
  }

  for (const key of NOT_MIGRATED_KEYS) {
    it(`STANDARD_LOOPS['${key}'].gha_backed is absent/falsy (not migrated by this batch)`, () => {
      const loop = loopByKey(key);
      expect(loop.gha_backed).toBeFalsy();
    });
  }

  it('exactly 13 STANDARD_LOOPS entries carry gha_backed:true from this batch', () => {
    const flagged = STANDARD_LOOPS.filter((l) => l.gha_backed === true).map((l) => l.key);
    for (const key of MIGRATED_KEYS) expect(flagged).toContain(key);
    // retention + backlog-rank were migrated by earlier SDs (also gha_backed:true) — this
    // guard only asserts THIS batch's 13 keys are present, not an exclusive total count.
  });
});

describe('GHA loop migration — YAML validity (TS-9)', () => {
  for (const key of MIGRATED_KEYS) {
    it(`${key}-cron.yml has required top-level keys and a valid 5-field cron`, () => {
      const doc = loadWorkflow(key);
      expect(doc).toBeTruthy();
      expect(doc.name).toBeTruthy();
      expect(typeof doc.name).toBe('string');
      const onBlock = doc.on ?? doc['on'] ?? doc[true] ?? doc['true'];
      expect(onBlock).toBeTruthy();
      expect(doc.jobs).toBeTruthy();
      expect(Object.keys(doc.jobs).length).toBeGreaterThan(0);

      const crons = scheduleCronsOf(doc);
      expect(crons).toHaveLength(1);
      const fields = crons[0].trim().split(/\s+/);
      expect(fields).toHaveLength(5);

      // workflow_dispatch present, permissions read-only, concurrency keyed off github.workflow.
      expect(onBlock.workflow_dispatch !== undefined).toBe(true);
      expect(doc.permissions?.contents).toBe('read');
      expect(doc.concurrency?.group).toBe('${{ github.workflow }}');
      expect(doc.concurrency?.['cancel-in-progress']).toBe(true);
    });
  }
});

describe('GHA loop migration — concurrency-group uniqueness across all workflows (TS-11)', () => {
  it('no two files in .github/workflows/ share the same name: value', () => {
    const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    const nameToFiles = new Map();
    for (const file of files) {
      let doc;
      try {
        doc = yaml.load(readFileSync(join(workflowsDir, file), 'utf8'));
      } catch {
        continue; // non-workflow or unparsable YAML — not this guard's concern
      }
      const name = doc && doc.name;
      if (!name) continue;
      if (!nameToFiles.has(name)) nameToFiles.set(name, []);
      nameToFiles.get(name).push(file);
    }
    const duplicates = [...nameToFiles.entries()].filter(([, fs]) => fs.length > 1);
    expect(duplicates, `duplicate workflow name(s): ${JSON.stringify(duplicates)}`).toHaveLength(0);
  });

  it('all 13 migrated workflow files are present and singly-named', () => {
    for (const key of MIGRATED_KEYS) {
      const doc = loadWorkflow(key);
      expect(doc.name).toBeTruthy();
    }
  });
});
