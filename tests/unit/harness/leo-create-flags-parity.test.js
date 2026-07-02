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

  describe('--from-qf path (SD-LEO-FIX-LEO-CREATE-ROUTE-001)', () => {
    it('createFromQF accepts an opts param and destructures securityReviewed', () => {
      const idx = src.indexOf('async function createFromQF');
      expect(idx).toBeGreaterThan(0);
      const header = src.slice(idx, idx + 100);
      expect(header).toMatch(/async function createFromQF\(qfId,\s*opts\s*=\s*\{\}\)/);
    });

    it('createFromQF metadata propagates security_reviewed=true when the flag is set', () => {
      const idx = src.indexOf('async function createFromQF');
      const body = src.slice(idx, idx + 3000);
      expect(body).toMatch(/opts\.securityReviewed\s*\?\s*\{\s*security_reviewed:\s*true\s*\}/);
    });

    it('CLI passes args.includes(--security-reviewed) to createFromQF', () => {
      const idx = src.indexOf("args[0] === '--from-qf'");
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 900);
      expect(block).toMatch(/await createFromQF\(args\[1\],\s*\{\s*securityReviewed:\s*args\.includes\(['"]--security-reviewed['"]\)\s*\}\)/);
    });
  });

  describe('--from-qf bidirectional link + hardened retirement (SD-LEO-INFRA-QF-SD-ESCALATION-LINK-CANONICAL-TRACK-001)', () => {
    it('createFromQF metadata includes escalated_from_qf pointing back at the source QF id', () => {
      const idx = src.indexOf('async function createFromQF');
      const body = src.slice(idx, idx + 3000);
      expect(body).toMatch(/escalated_from_qf:\s*qf\.id/);
    });

    it('createFromQF never writes a metadata field on quick_fixes (no metadata column exists on that table)', () => {
      const idx = src.indexOf('async function createFromQF');
      const end = src.indexOf('\nasync function', idx + 1);
      const body = src.slice(idx, end > 0 ? end : idx + 4000);
      const qfUpdateIdx = body.indexOf("status: 'escalated',");
      expect(qfUpdateIdx).toBeGreaterThan(-1);
      const updateBlock = body.slice(qfUpdateIdx, qfUpdateIdx + 200);
      expect(updateBlock).not.toMatch(/metadata:/);
    });

    it('the QF retirement write is wrapped in withRetry rather than a single best-effort attempt', () => {
      const idx = src.indexOf('async function createFromQF');
      const body = src.slice(idx, idx + 4000);
      expect(body).toMatch(/await withRetry\(async \(\) => \{/);
      expect(body).toMatch(/maxRetries:\s*2/);
    });

    it('withRetry is imported from the shared retry utility', () => {
      expect(src).toMatch(/import \{ withRetry \} from ['"]\.\.\/lib\/eva\/stage-zero\/data-pollers\/retry\.js['"]/);
    });

    it('exhausted retries throw an Error naming the already-created SD key and a manual recovery UPDATE', () => {
      const idx = src.indexOf('async function createFromQF');
      const body = src.slice(idx, idx + 4500);
      const catchIdx = body.indexOf('} catch (updErr) {');
      expect(catchIdx).toBeGreaterThan(-1);
      const catchBlock = body.slice(catchIdx, catchIdx + 700);
      expect(catchBlock).toMatch(/throw new Error\(/);
      expect(catchBlock).toMatch(/SD \$\{sdKey\}/);
      expect(catchBlock).toMatch(/UPDATE quick_fixes SET status='escalated'/);
    });

    it('the wrapped update fn throws explicitly on a Supabase error (supabase-js does not throw on its own)', () => {
      const idx = src.indexOf('async function createFromQF');
      const body = src.slice(idx, idx + 4000);
      expect(body).toMatch(/if\s*\(updErr\)\s*throw new Error\(updErr\.message\);/);
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
