// QF-20260527-709: prevent regression of the GATE_INTEGRATION_SECTION_VALIDATION
// remediation message — must surface canonical snake_case JSONB keys + doc
// reference, not just display labels. The PG CHECK trigger on
// product_requirements_v2.integration_operationalization accepts only the
// snake_case keys; prior message used display labels with '&' separators,
// forcing operators through trial-and-error per feedback 3f0dc5eb.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js',
);

describe('QF-20260527-709: gate remediation surfaces canonical JSONB keys', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('remediation lists the 5 canonical snake_case keys verbatim', () => {
    expect(code).toMatch(/Canonical JSONB keys/);
    // Each canonical key must appear somewhere in the remediation string body.
    for (const key of ['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout']) {
      expect(code).toContain(key);
    }
  });

  it('remediation references docs/guides/prd-integration-section-guide.md', () => {
    expect(code).toMatch(/docs\/guides\/prd-integration-section-guide\.md/);
  });

  it('per-subsection issue format includes the snake_case key, not just the display label', () => {
    // Pattern: `missing: <key> (<display>)` and `empty: <key> (<display>)`.
    expect(code).toMatch(/missing:\s*\$\{k\}\s*\(\$\{SUBSECTION_NAMES\[k\]\}\)/);
    expect(code).toMatch(/empty:\s*\$\{k\}\s*\(\$\{SUBSECTION_NAMES\[k\]\}\)/);
  });
});
