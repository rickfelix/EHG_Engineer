/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-1 — shared drift-guard support.
 *
 * Enumerates the CLI flags a sender ACTUALLY parses, by reading its source. Both advisory senders
 * are guarded, so this lives in one place: two copies of the enumeration could disagree about what
 * counts as a parsed flag, which is the same drift this SD exists to close, one layer up.
 */
import fs from 'node:fs';

/**
 * @param {string} srcPath absolute path to a sender's .cjs source
 * @returns {Set<string>} every flag passed to argv.indexOf() in executable code
 */
export function parsedFlags(srcPath) {
  // Whole-line comments are dropped first: the guard's first run failed on '--x', a placeholder
  // inside a doc comment. ONLY whole-line comments are stripped — never trailing ones — because that
  // is the fail-LOUD direction. A trailing comment can at worst re-introduce a false positive (noisy,
  // obvious, one-line fix); a broader stripper could swallow a real parse line and leave the guard
  // silently blind, which is the failure mode these tests exist to prevent.
  const code = fs
    .readFileSync(srcPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');
  return new Set([...code.matchAll(/argv\.indexOf\('(--[a-z-]+)'\)/g)].map((m) => m[1]));
}
