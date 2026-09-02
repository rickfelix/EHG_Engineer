import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const FILES_TO_CHECK = [
  'lib/apa/imap-code-fetcher.js',
  'lib/apa/venture-step-executors.js',
];

const LOG_CALL_RE = /\b(console\.\w+|logger\.\w+)\s*\(([^)]*)\)/g;
const SENSITIVE_IDENTIFIER_RE = /\b(pass|password|APP_PASSWORD|verificationCode|fetchedCode|code)\b/i;

describe('imap-code-fetcher — credential and code are never logged (TS-7)', () => {
  for (const relPath of FILES_TO_CHECK) {
    it(`no logging call in ${relPath} references the app password or a code variable`, () => {
      const source = readFileSync(path.join(repoRoot, relPath), 'utf8');
      const offenders = [];
      let match;
      while ((match = LOG_CALL_RE.exec(source)) !== null) {
        const args = match[2];
        if (SENSITIVE_IDENTIFIER_RE.test(args)) {
          offenders.push(match[0]);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('the app password env var name never appears inside a template literal passed to a log call', () => {
    for (const relPath of FILES_TO_CHECK) {
      const source = readFileSync(path.join(repoRoot, relPath), 'utf8');
      expect(source).not.toMatch(/console\.\w+\(`[^`]*VENTURE_UAT_GMAIL_APP_PASSWORD[^`]*\$\{/);
    }
  });
});
