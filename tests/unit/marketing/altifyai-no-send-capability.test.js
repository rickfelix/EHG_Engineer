/**
 * SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 TS-4 (hardened per TESTING sub-agent finding G2,
 * sub_agent_execution_results de22862f). Asserts that every file this SD adds under
 * scripts/one-off/altifyai-* contains no send-capable code path -- FR-4's staging call must be
 * the ONLY outbound-facing call, never a hand-rolled email sender.
 *
 * G2: a bare case-insensitive substring grep is red-by-construction here -- this SD's own PRD
 * content/docs necessarily CONTAIN these tokens in prose (measured: grep -ic on
 * scripts/temp/altifyai-prd-content.json returns 6). This test instead matches IMPORT/CALL FORMS,
 * restricted to actual source files (.js/.mjs/.ts), excluding this test's own file.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SELF_BASENAME = 'altifyai-no-send-capability.test.js';

const SEND_CAPABLE_PATTERNS = [
  /from\s+["'][^"']*resend[^"']*["']/i,
  /require\(\s*["'][^"']*resend[^"']*["']\s*\)/i,
  /from\s+["'][^"']*nodemailer[^"']*["']/i,
  /require\(\s*["'][^"']*nodemailer[^"']*["']\s*\)/i,
  /\bsendMail\s*\(/,
  /api\.resend\.com/i,
  /smtp[:/]/i,
  /createTransport\s*\(/i,
];

/** Scoped to this SD's own new files -- the actual attack surface -- not the whole repo. */
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'scripts', 'one-off'),
];
const NAME_FILTER = /^altifyai-.*\.(js|mjs|ts)$/;

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => NAME_FILTER.test(f) && f !== SELF_BASENAME).map((f) => path.join(dir, f));
}

describe('AltifyAI SD: no send-capable code path in scripts/one-off/altifyai-*', () => {
  const files = SCAN_DIRS.flatMap(listSourceFiles);

  it('finds at least one AltifyAI script to scan (guards against a silently-empty scan)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.length ? files : ['(none found)'])('%s contains no send-capable import/call', (filePath) => {
    if (filePath === '(none found)') return;
    const source = fs.readFileSync(filePath, 'utf8');
    const matches = SEND_CAPABLE_PATTERNS.filter((re) => re.test(source));
    expect(matches, `${path.relative(REPO_ROOT, filePath)} matched send-capable pattern(s): ${matches.map(String).join(', ')}`).toEqual([]);
  });
});
