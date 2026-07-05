// QF-20260705-395
//
// Regression-pin: `leo-create-sd.js --from-qf <id> --migration-reviewed` must actually
// thread migrationReviewed through to createFromQF()'s metadata, mirroring the existing
// --security-reviewed handling on the same route (fixed once already under QF-20260701-833).
//
// Bug (confirmed by direct source read before this fix): the `--from-qf` CLI branch called
// `createFromQF(args[1], { securityReviewed: args.includes('--security-reviewed') })` --
// migrationReviewed was never passed at all -- and createFromQF's own metadata builder had
// no `opts.migrationReviewed` handling either. A Tier-3 QF whose description named a real
// schema migration was therefore unescapably blocked by GR-MIGRATION-REVIEW even when
// `--migration-reviewed` was passed on the command line.
//
// Test approach: static-source assertions (mirrors leo-create-sd-claim-pin.test.js /
// leo-create-sd-smoke-detector.test.js patterns) since leo-create-sd.js is a script with no
// exported functions to import directly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(__dirname, '../../scripts/leo-create-sd.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('QF-20260705-395: --from-qf route honors --migration-reviewed', () => {
  it('TS-1: the --from-qf CLI branch parses --migration-reviewed and passes migrationReviewed to createFromQF', () => {
    const branchMatch = SOURCE.match(
      /args\[0\] === '--from-qf'\)\s*\{[\s\S]*?await createFromQF\(args\[1\],\s*\{([\s\S]*?)\}\);/
    );
    expect(branchMatch).not.toBeNull();
    const optionsBody = branchMatch[1];
    expect(optionsBody).toMatch(/securityReviewed:\s*args\.includes\('--security-reviewed'\)/);
    expect(optionsBody).toMatch(/migrationReviewed:\s*args\.includes\('--migration-reviewed'\)/);
  });

  it('TS-2: createFromQF\'s metadata builder spreads migration_reviewed=true when opts.migrationReviewed is set', () => {
    const metadataMatch = SOURCE.match(
      /qf_target_application:\s*qf\.target_application,\s*\n\s*\.\.\.\(opts\.securityReviewed[\s\S]*?\n\s*\}\s*\n\s*\}\);/
    );
    expect(metadataMatch).not.toBeNull();
    const block = metadataMatch[0];
    expect(block).toMatch(/\.\.\.\(opts\.securityReviewed \? \{ security_reviewed: true \} : \{\}\)/);
    expect(block).toMatch(/\.\.\.\(opts\.migrationReviewed \? \{ migration_reviewed: true \} : \{\}\)/);
  });
});
