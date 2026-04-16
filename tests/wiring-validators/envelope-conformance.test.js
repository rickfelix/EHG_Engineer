/**
 * Envelope conformance tests.
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (TS-5, FR-4)
 *
 * Verifies that envelopes emitted by the e2e-demo-recorder pass the shared
 * envelope-schema.js zod schema. This is the contract between this detector
 * and sibling D's wiring-validation-runner.js — if D's runner imports the
 * same schema and parses without errors, schema parity is preserved.
 *
 * If D modifies envelope-schema.js without coordinating, this test catches it.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  EnvelopeSchema,
  StepEvidenceSchema,
  ENVELOPE_SCHEMA_VERSION,
  parseEnvelope,
  safeParseEnvelope
} from '../../scripts/wiring-validators/lib/envelope-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDER = resolve(__dirname, '..', '..', 'scripts', 'wiring-validators', 'e2e-demo-recorder.js');
const FIXTURE_PASSING = resolve(__dirname, 'fixtures', 'sample-sd-passing.json');
const FIXTURE_FAILING = resolve(__dirname, 'fixtures', 'sample-sd-failing.json');

function runRecorder(args) {
  return new Promise((res) => {
    const child = spawn('node', [RECORDER, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => res({ code, stdout, stderr }));
  });
}

describe('envelope schema definitions', () => {
  it('exposes ENVELOPE_SCHEMA_VERSION as a number', () => {
    expect(typeof ENVELOPE_SCHEMA_VERSION).toBe('number');
    expect(ENVELOPE_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('rejects envelope missing envelope_schema_version', () => {
    const r = safeParseEnvelope({
      sd_key: 'SD-X',
      check_type: 'e2e_demo',
      status: 'passed',
      signals_detected: [],
      evidence: {}
    });
    expect(r.success).toBe(false);
  });

  it('rejects envelope with wrong check_type', () => {
    const r = safeParseEnvelope({
      envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
      sd_key: 'SD-X',
      check_type: 'BOGUS_CHECK',
      status: 'passed',
      signals_detected: [],
      evidence: {}
    });
    expect(r.success).toBe(false);
  });

  it('rejects envelope with wrong status', () => {
    const r = safeParseEnvelope({
      envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
      sd_key: 'SD-X',
      check_type: 'e2e_demo',
      status: 'BOGUS',
      signals_detected: [],
      evidence: {}
    });
    expect(r.success).toBe(false);
  });

  it('accepts minimal valid envelope', () => {
    const minimal = {
      envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
      sd_key: 'SD-X',
      check_type: 'e2e_demo',
      status: 'skipped',
      signals_detected: [],
      evidence: {}
    };
    expect(() => parseEnvelope(minimal)).not.toThrow();
  });

  it('accepts envelope from each detector check_type', () => {
    for (const check_type of ['orphan_detection', 'spec_code_drift', 'vision_traceability', 'e2e_demo']) {
      const env = {
        envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
        sd_key: 'SD-X',
        check_type,
        status: 'passed',
        signals_detected: [],
        evidence: {}
      };
      expect(() => parseEnvelope(env), `check_type=${check_type}`).not.toThrow();
    }
  });

  it('StepEvidenceSchema validates step shape independently', () => {
    const step = {
      step_number: 1,
      instruction: 'echo hi',
      exit_code: 0,
      stdout: 'hi',
      stderr: '',
      match_result: 'passed',
      match_method: 'SUBSTRING',
      duration_ms: 5
    };
    expect(() => StepEvidenceSchema.parse(step)).not.toThrow();
  });

  it('StepEvidenceSchema rejects negative duration', () => {
    const r = StepEvidenceSchema.safeParse({
      step_number: 1, instruction: 'x', exit_code: 0,
      stdout: '', stderr: '', match_result: 'passed',
      match_method: 'SUBSTRING', duration_ms: -1
    });
    expect(r.success).toBe(false);
  });

  it('signals_detected accepts numbers and strings', () => {
    const env = {
      envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
      sd_key: 'SD-X', check_type: 'e2e_demo', status: 'failed',
      signals_detected: [2, 'orphan-file:src/foo.ts'],
      evidence: {}
    };
    expect(() => parseEnvelope(env)).not.toThrow();
  });
});

describe('detector output conforms to envelope schema (TS-5)', () => {
  it('passing fixture envelope passes shared schema', async () => {
    const r = await runRecorder(['--fixture', FIXTURE_PASSING]);
    expect(r.code).toBe(0);
    const envelope = JSON.parse(r.stdout);
    // The detector itself validates before emit, but re-validate here as proof
    // that the same schema D will use accepts the output.
    expect(() => parseEnvelope(envelope)).not.toThrow();
    expect(envelope.envelope_schema_version).toBe(ENVELOPE_SCHEMA_VERSION);
    expect(envelope.check_type).toBe('e2e_demo');
  }, 30000);

  it('failing fixture envelope passes shared schema', async () => {
    const r = await runRecorder(['--fixture', FIXTURE_FAILING]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.stdout);
    expect(() => parseEnvelope(envelope)).not.toThrow();
    expect(envelope.status).toBe('failed');
    expect(envelope.signals_detected.length).toBeGreaterThan(0);
  }, 30000);
});
