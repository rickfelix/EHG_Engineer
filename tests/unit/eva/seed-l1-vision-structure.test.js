/**
 * SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-C (A1c) — seed fusion-structure fix + canonical file.
 *
 * The L1 apex doc previously seeded as lifecycle-spec + doctrine CONCATENATED
 * (combinedVisionContent = `${visionContent}...# EHG Capability Doctrine...`),
 * making the identity vision masquerade as a 26-stage lifecycle document. These
 * tests pin the two-document structure so a re-provision can never re-fuse them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SEED = readFileSync(resolve(REPO_ROOT, 'scripts/eva/seed-l1-vision.js'), 'utf8');
const CANONICAL = readFileSync(resolve(REPO_ROOT, 'docs/vision/ehg-mission-vision-canonical.md'), 'utf8');

describe('canonical vision file (the L1 seed source)', () => {
  it('exists with the chairman-approved H1 and supersession header', () => {
    expect(CANONICAL.split('\n')[0]).toBe('# ExecHoldings Global (EHG) — Mission & Vision');
    expect(CANONICAL).toMatch(/Chairman-approved 2026-06-09\. CANONICAL\./);
    expect(CANONICAL).toMatch(/venture-lifecycle specification remains a SEPARATE operating document/);
  });

  it('is identity/strategy only — no lifecycle spec markers', () => {
    expect(CANONICAL).not.toMatch(/## 5\. Stage Inventory/);
    expect(CANONICAL).not.toMatch(/Appendix A/);
    // identity docs mention stages only in passing; the spec had 295 mentions
    expect((CANONICAL.match(/stage/gi) || []).length).toBeLessThan(10);
  });
});

describe('seed two-document structure (no re-fusion)', () => {
  it('L1 seeds from the canonical file, not the lifecycle spec', () => {
    expect(SEED).toMatch(/canonical:\s*'docs\/vision\/ehg-mission-vision-canonical\.md'/);
    expect(SEED).toMatch(/const canonicalContent = readSourceFile\(SOURCE_FILES\.canonical\)/);
    // the old fusion: combinedVisionContent starting from the lifecycle visionContent
    expect(SEED).not.toMatch(/combinedVisionContent = `\$\{visionContent\}/);
    // new structure: canonical leads the L1 content
    expect(SEED).toMatch(/combinedVisionContent = `\$\{canonicalContent\}/);
  });

  it('the lifecycle spec seeds its OWN row with a cross-link parent', () => {
    expect(SEED).toMatch(/LIFECYCLE_SPEC_KEY = 'SPEC-EVA-VENTURE-LIFECYCLE-001'/);
    expect(SEED).toMatch(/vision_key: LIFECYCLE_SPEC_KEY/);
    expect(SEED).toMatch(/content: lifecycleContent/);
    expect(SEED).toMatch(/parent_vision_id: visionId/);
  });

  it('L1 content cross-links to the lifecycle spec document', () => {
    expect(SEED).toMatch(/SEPARATE document — see eva_vision_documents '\$\{LIFECYCLE_SPEC_KEY\}'/);
  });

  it('the doctrine identity block is preserved in L1 (below the canonical text)', () => {
    expect(SEED).toMatch(/# EHG Capability Doctrine\\n\\n\$\{doctrineContent\}/);
  });
});
