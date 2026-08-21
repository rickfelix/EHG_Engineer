/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-7) — SECURITY SEC-40: no test
 * previously asserted the RPC-path coverage-gap disclosure's actual presence
 * in venture-hosting-standard.md, so it could be silently dropped during
 * later doc authoring with nothing to catch it. This pins the verbatim
 * sentence (sourced from strategic_directives_v2.metadata per FR-7's own
 * "never retyped by hand" discipline for the doc's other verbatim content),
 * plus the surrounding fenced synthetic-actor section's key structural
 * claims, directly against the shipped doc file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const doc = readFileSync(join(root, 'docs', '03_protocols_and_standards', 'venture-hosting-standard.md'), 'utf8');

describe('venture-hosting-standard.md — fenced synthetic-actor section', () => {
  it('has the RPC-path coverage-gap disclosure verbatim (SEC-40)', () => {
    expect(doc).toContain(
      "this guard covers `_advanceStage()` callers only; the `fn_advance_venture_stage` RPC and the `EHG` frontend's `advance_venture_stage` RPC bypass it and are not yet fenced.",
    );
  });

  it('names the three exclusion classes', () => {
    expect(doc).toMatch(/money movement/);
    expect(doc).toMatch(/outbound-to-real-humans/);
    expect(doc).toMatch(/third-party trust surfaces/);
  });

  it('has the verbatim "USER stand-in, NEVER a chairman stand-in" sentence', () => {
    expect(doc).toContain(
      'a synthetic actor is a USER stand-in, NEVER a chairman stand-in — no test identity satisfies a `chairman_site_review`, crack-gate attestation, or any approval surface.',
    );
  });

  it('states the future-endpoint predicate-consumption constraint', () => {
    expect(doc).toMatch(/MUST consume that predicate before shipping/);
  });
});
