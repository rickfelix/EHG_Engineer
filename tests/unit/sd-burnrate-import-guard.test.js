/**
 * Regression guard: scripts/sd-burnrate.js must IMPORT createSupabaseServiceClient if it uses it.
 * SD-REFILL-00ABJMAZ — the import was commented out (line 17) while line 23 called the symbol, so
 * `npm run sd:burnrate` (a documented essential command) crashed immediately with
 * "ReferenceError: createSupabaseServiceClient is not defined". This pins the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../scripts/sd-burnrate.js');

describe('sd-burnrate.js import guard (SD-REFILL-00ABJMAZ)', () => {
  const src = readFileSync(SRC, 'utf8');

  it('calls createSupabaseServiceClient (the symbol the script depends on)', () => {
    expect(src).toMatch(/createSupabaseServiceClient\s*\(/);
  });

  it('has an ACTIVE (non-commented) import of createSupabaseServiceClient', () => {
    const lines = src.split('\n');
    const activeImport = lines.some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false; // skip commented/JSDoc
      return /import\s*\{[^}]*\bcreateSupabaseServiceClient\b[^}]*\}\s*from/.test(line);
    });
    expect(activeImport, 'createSupabaseServiceClient must be imported via an active (uncommented) import statement').toBe(true);
  });
});
