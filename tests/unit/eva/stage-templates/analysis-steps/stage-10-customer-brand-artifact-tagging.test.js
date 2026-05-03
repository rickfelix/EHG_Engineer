/**
 * SD-LEO-FIX-FIX-S10-WORKER-001 FR-004 — Stage 10 worker artifact stage-tagging.
 *
 * Verifies that analyzeStage10 in stage-10-customer-brand.js emits artifacts
 * with the corrected (lifecycleStage, artifactType) pairs:
 *   - Brand Genome: lifecycleStage=12, artifactType='identity_brand_guidelines'
 *   - Customer Personas: lifecycleStage=10, artifactType='identity_persona_brand'
 *
 * Pre-fix: both writes used lifecycleStage=10 + artifactType=identity_brand_guidelines.
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-10-customer-brand-artifact-tagging.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOURCE_PATH = join(__dirname, '../../../../../lib/eva/stage-templates/analysis-steps/stage-10-customer-brand.js');

describe('FR-004: stage-10-customer-brand writeArtifact stage-tagging', () => {
  // Source-level regression guard — catches future reverts without requiring the
  // full analyzeStage10 invocation harness (LLM mocks, SRIP services, supabase).
  // The PRD AC requires invocation-level coverage; this layer is the
  // belt-and-suspenders catch for the specific 2-line edit pattern.

  let source;

  beforeEach(() => {
    source = readFileSync(SOURCE_PATH, 'utf-8');
  });

  it('Brand Genome write uses lifecycleStage=12 + artifactType=identity_brand_guidelines', () => {
    // The Brand Genome try-block: inside the genomeResult try, look for the writeArtifact call
    // with title "Brand Genome (Stage 10)". The regex scans the whole region after the
    // genomeResult log line.
    const region = source.split("logger.log('[Stage10] Brand genome created'")[1];
    expect(region).toBeDefined();
    const brandGenomeWrite = region.split("3. Write venture_artifacts ref for persona catalog")[0];

    // Assert: the Brand Genome writeArtifact has lifecycleStage: 12
    expect(brandGenomeWrite).toMatch(/lifecycleStage:\s*12/);
    // Assert: artifactType is identity_brand_guidelines
    expect(brandGenomeWrite).toMatch(/artifactType:\s*['"]identity_brand_guidelines['"]/);
    // Assert: title is "Brand Genome (Stage 10)" (preserves worker-stage hint for human reader)
    expect(brandGenomeWrite).toMatch(/title:\s*['"]Brand Genome \(Stage 10\)['"]/);

    // Negative regression: Brand Genome writeArtifact must NOT use lifecycleStage: 10
    expect(brandGenomeWrite).not.toMatch(/lifecycleStage:\s*10/);
  });

  it('Customer Personas write uses lifecycleStage=10 + artifactType=identity_persona_brand', () => {
    const region = source.split("3. Write venture_artifacts ref for persona catalog")[1];
    expect(region).toBeDefined();
    const personaWrite = region.split('export {')[0]; // up to first export

    // Assert: lifecycleStage: 10 (correct per artifact-types.js:214)
    expect(personaWrite).toMatch(/lifecycleStage:\s*10/);
    // Assert: artifactType is identity_persona_brand (NOT identity_brand_guidelines)
    expect(personaWrite).toMatch(/artifactType:\s*['"]identity_persona_brand['"]/);
    // Assert: title is "Customer Personas (Stage 10)"
    expect(personaWrite).toMatch(/title:\s*['"]Customer Personas \(Stage 10\)['"]/);

    // Negative regression: Personas writeArtifact must NOT use the wrong artifact_type
    expect(personaWrite).not.toMatch(/artifactType:\s*['"]identity_brand_guidelines['"]/);
  });

  it('exactly 2 writeArtifact calls in analyzeStage10', () => {
    // Count writeArtifact( call sites in the file. Should be exactly 2.
    const matches = source.match(/await\s+writeArtifact\s*\(/g);
    expect(matches).toBeDefined();
    expect(matches.length).toBe(2);
  });

  it('no writeArtifact call uses the pre-fix combination (lifecycleStage=10 + identity_brand_guidelines)', () => {
    // Regression guard: the specific defect combo must not exist anywhere in the file.
    // Scan each writeArtifact call and verify the combination doesn't recur.
    // This is a coarse check (file-wide) but the file is small and only has 2 such calls.

    // Find writeArtifact blocks (between writeArtifact( and the matching closing brace).
    // Simple approach: scan windows around each writeArtifact call.
    const calls = [];
    let idx = 0;
    while (true) {
      const start = source.indexOf('writeArtifact(', idx);
      if (start === -1) break;
      // Capture until the matching close paren — coarse approach: take next 600 chars.
      calls.push(source.slice(start, start + 600));
      idx = start + 14;
    }
    expect(calls.length).toBe(2);

    for (const call of calls) {
      const hasLifecycle10 = /lifecycleStage:\s*10/.test(call);
      const hasIdentityBrandGuidelines = /artifactType:\s*['"]identity_brand_guidelines['"]/.test(call);
      // BOTH true would be the pre-fix defect. Either alone is OK (or even neither).
      const isPreFixDefect = hasLifecycle10 && hasIdentityBrandGuidelines;
      expect(isPreFixDefect).toBe(false);
    }
  });

  it('SD provenance comments reference the correct SD key', () => {
    expect(source).toMatch(/SD-LEO-FIX-FIX-S10-WORKER-001 FR-001/);
    expect(source).toMatch(/SD-LEO-FIX-FIX-S10-WORKER-001 FR-002/);
  });
});
