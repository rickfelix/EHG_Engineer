/**
 * tests/static-guards/probe-writer-registry-census.test.js
 *
 * QF-20260911-287: six probe/check-named scripts write a durable row on every run they
 * act, yet none was registered as a writer by script name — the writer census and any
 * orphan-writer lint would read them as read-only. This is a source-text presence guard
 * (same idiom as tests/unit/complete-quick-fix-no-which-probe.test.js /
 * tests/static-guards/session-coordination-writer-census.test.js): it proves (1) each of
 * the six real scripts is registered and passes the orphan-writer lint, and (2) the lint
 * genuinely fails on a fixture probe-named script that writes but was never registered.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROBE_WRITER_REGISTRY,
  isRegisteredWriter,
  scriptWritesGovernedTable,
  assertNoUnregisteredWriter,
} from '../../lib/governance/probe-writer-registry.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const SIX_PROBE_SCRIPTS = [
  'scripts/adam-coordinator-health.mjs',
  'scripts/solomon-forecast-trigger-check.mjs',
  'scripts/coordinator-comms-check.mjs',
  'scripts/adam-adherence-staleness-check.mjs',
  'scripts/canary/run-canary-probe.mjs',
  'scripts/pocock/glossary-bypass-parity-check.mjs',
];

describe('probe-writer registry (QF-20260911-287)', () => {
  it('has exactly the six named entries', () => {
    expect(PROBE_WRITER_REGISTRY.map((e) => e.script).sort()).toEqual([...SIX_PROBE_SCRIPTS].sort());
  });

  for (const scriptPath of SIX_PROBE_SCRIPTS) {
    describe(scriptPath, () => {
      const source = fs.readFileSync(path.join(REPO_ROOT, scriptPath), 'utf8');

      it('genuinely writes a governed table (sanity check on the registry entry)', () => {
        expect(scriptWritesGovernedTable(source)).toBe(true);
      });

      it('is registered by script name', () => {
        expect(isRegisteredWriter(scriptPath)).toBe(true);
      });

      it('passes the orphan-writer lint', () => {
        expect(assertNoUnregisteredWriter(scriptPath, source)).toEqual({ ok: true });
      });
    });
  }

  it('the lint FAILS on a fixture probe script that writes but was never registered', () => {
    const fixturePath = 'scripts/fixture-unregistered-probe-check.mjs';
    const fixtureSource = `
      export async function run(supabase) {
        await supabase.from('feedback').insert({ title: 'fixture' });
      }
    `;
    expect(isRegisteredWriter(fixturePath)).toBe(false);
    const verdict = assertNoUnregisteredWriter(fixturePath, fixtureSource);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(fixturePath);
  });

  it('the lint passes a fixture script that writes nothing', () => {
    const fixturePath = 'scripts/fixture-read-only-check.mjs';
    const fixtureSource = `
      export async function run(supabase) {
        const { data } = await supabase.from('feedback').select('id');
        return data;
      }
    `;
    expect(assertNoUnregisteredWriter(fixturePath, fixtureSource)).toEqual({ ok: true });
  });
});
