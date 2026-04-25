// Walks every fixture under scripts/__tests__/golden/<script>/*.json and
// asserts assertSanitized passes on it. Closes the threat-model gap where
// a fixture-only PR could land if the test author skipped the import that
// triggers the loader's auto-scan. This walker fires regardless of imports.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSanitized } from '../replay/sanitization-checker.mjs';

const GOLDEN_ROOT = path.dirname(fileURLToPath(import.meta.url));

async function findFixtures(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findFixtures(full)));
    } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'schema.json') {
      out.push(full);
    }
  }
  return out;
}

describe('golden corpus sanitization (walker)', async () => {
  const fixtures = await findFixtures(GOLDEN_ROOT);

  if (fixtures.length === 0) {
    it('no fixtures yet — vacuously sanitized (PRs #2-5 will populate)', () => {
      expect(fixtures).toEqual([]);
    });
    return;
  }

  for (const fixturePath of fixtures) {
    const relative = path.relative(GOLDEN_ROOT, fixturePath);
    it(`${relative} contains no apparent secrets`, async () => {
      const raw = await fs.readFile(fixturePath, 'utf8');
      const fixture = JSON.parse(raw);
      expect(() => assertSanitized(fixture, relative)).not.toThrow();
    });
  }
});
