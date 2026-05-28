/**
 * Verifies the Venture Lifecycle Pipeline section is present in the generated
 * CLAUDE_LEAD.md and contains the load-bearing rules.
 * SD-LEO-INFRA-VENTURE-LIFECYCLE-PIPELINE-001 (FR-1, FR-2, FR-3 / TS-1, TS-6).
 *
 * Hermetic: reads the committed generated file (no DB). If the section is
 * dropped from the section-file-mapping or the leo_protocol_sections row is
 * removed, regeneration drops it from CLAUDE_LEAD.md and this test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEAD_PATH = join(__dirname, '../../../CLAUDE_LEAD.md');
const lead = readFileSync(LEAD_PATH, 'utf8');

describe('CLAUDE_LEAD.md — Venture Lifecycle Pipeline section', () => {
  it('TS-1: contains the section heading', () => {
    expect(lead).toContain('Venture Lifecycle Pipeline');
  });

  it('documents the canonical ordered sequence', () => {
    expect(lead).toMatch(/brainstorm/i);
    expect(lead).toMatch(/L2 vision/i);
    expect(lead).toMatch(/[Cc]hairman approval/);
    expect(lead).toMatch(/cascade/i);
    expect(lead).toMatch(/[Oo]rchestrator/);
  });

  it('names the bridge refusal gate + unblock command (greppable against code)', () => {
    expect(lead).toContain('assertVentureVisionReady');
    expect(lead).toContain('VENTURE_L2_VISION_MISSING');
    expect(lead).toContain('/brainstorm');
  });

  it('FR-2: encodes LEAD-as-circuit-breaker discipline', () => {
    expect(lead).toContain('CIRCUIT-BREAKER');
    // content bolds "**NOT**" so match the contiguous unmarked span
    expect(lead).toMatch(/redesign the decomposition/i);
  });

  it('FR-3 / TS-6: encodes per-child cancellation evaluation', () => {
    expect(lead).toMatch(/each child individually/i);
    expect(lead).toMatch(/do NOT cancel all children uniformly/i);
  });
});
