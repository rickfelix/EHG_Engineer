// QF-20260509-LEO-CREATE-FLAGS: --migration-reviewed / --security-reviewed
// must work in BOTH --from-feedback path AND direct-args mode (closes 8a640d32
// sibling-parity gap with --from-plan path).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../../../scripts/leo-create-sd.js');

describe('QF-20260509-LEO-CREATE-FLAGS: review flags sibling parity across creation paths', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(scriptPath, 'utf-8');
  });

  describe('--from-feedback path', () => {
    it('createFromFeedback destructures migrationReviewed + securityReviewed from options', () => {
      // Locate the function and inspect its body
      const idx = src.indexOf('async function createFromFeedback');
      expect(idx).toBeGreaterThan(0);
      const body = src.slice(idx, idx + 3500);
      expect(body).toMatch(/migrationReviewed\s*=\s*false/);
      expect(body).toMatch(/securityReviewed\s*=\s*false/);
    });

    it('createFromFeedback metadata propagates migration_reviewed=true when flag is set', () => {
      const idx = src.indexOf('async function createFromFeedback');
      const body = src.slice(idx, idx + 5000);
      // Spread only when truthy
      expect(body).toMatch(/migrationReviewed\s*\?\s*\{\s*migration_reviewed:\s*true\s*\}/);
      expect(body).toMatch(/securityReviewed\s*\?\s*\{\s*security_reviewed:\s*true\s*\}/);
    });

    it('CLI args parser includes --migration-reviewed / --security-reviewed in fbKnownFlags', () => {
      const idx = src.indexOf("const fbKnownFlags = new Set");
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 200);
      expect(block).toMatch(/--migration-reviewed/);
      expect(block).toMatch(/--security-reviewed/);
    });

    it('CLI passes args.includes(--migration-reviewed) / --security-reviewed to createFromFeedback', () => {
      const idx = src.indexOf('await createFromFeedback(feedbackId,');
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 400);
      expect(block).toMatch(/migrationReviewed:\s*args\.includes\(['"]--migration-reviewed['"]\)/);
      expect(block).toMatch(/securityReviewed:\s*args\.includes\(['"]--security-reviewed['"]\)/);
    });
  });

  describe('direct-args mode', () => {
    it('knownDirectFlags Set includes --migration-reviewed / --security-reviewed / --yes / -y', () => {
      const idx = src.indexOf('const knownDirectFlags = new Set');
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 300);
      expect(block).toMatch(/--migration-reviewed/);
      expect(block).toMatch(/--security-reviewed/);
      expect(block).toMatch(/--yes/);
      expect(block).toMatch(/'-y'/);
    });

    it('direct-args createSD metadata propagates migration_reviewed when flag is set', () => {
      // The wiring lives in the direct creation block AFTER any vision-readiness
      // routing — search the whole file since the line distance is ~250 lines.
      expect(src).toMatch(/directMigrationReviewed\s*=\s*args\.includes\(['"]--migration-reviewed['"]\)/);
      expect(src).toMatch(/directSecurityReviewed\s*=\s*args\.includes\(['"]--security-reviewed['"]\)/);
      expect(src).toMatch(/directMigrationReviewed\s*\?\s*\{\s*migration_reviewed:\s*true\s*\}/);
      expect(src).toMatch(/directSecurityReviewed\s*\?\s*\{\s*security_reviewed:\s*true\s*\}/);
    });
  });

  describe('regression: direct-args mode no longer rejects review flags as unknown', () => {
    it('the unknownFlags filter excludes review flags', () => {
      const idx = src.indexOf('const unknownFlags = args.filter');
      expect(idx).toBeGreaterThan(0);
      // The filter relies on knownDirectFlags Set — verified above
      // Pin: there is no separate exclusion list that would re-reject these
      const block = src.slice(idx, idx + 300);
      expect(block).toMatch(/!knownDirectFlags\.has\(a\)/);
    });
  });
});
