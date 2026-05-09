/**
 * Static-source guard test: handoff retro-generators MUST preserve manually-curated
 * retrospective rows (i.e., NOT overwrite them with auto-generated boilerplate).
 *
 * QF-20260509-967 — closes the retro-clobber pattern witnessed on retro 84ada45e
 * (SD-FDBK-INFRA-LAYER-SIDE-CLAIMING-001): 10/4/5 items collapsed to 1/1/1
 * boilerplate when the EXEC-TO-PLAN generator's UPSERT path UPDATE'd a manually-
 * curated row. Cost 2/3 SD bypass quota at PLAN-TO-LEAD + LEAD-FINAL gates.
 *
 * The guard pattern: each generator (exec-to-plan, plan-to-exec, lead-to-plan)
 * must SELECT id + quality_score + metadata + generated_by, then skip the UPDATE
 * branch if any of:
 *   - existing.metadata.manually_curated === true
 *   - existing.generated_by IN (MANUAL, CHAIRMAN, OPERATOR)
 *   - existing.quality_score > NEW.qualityScore
 *
 * If the guard pattern is removed or the SELECT shape regresses, this test fails
 * with bracket-tokenized error code [RETRO_CLOBBER_GUARD_MISSING].
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const GENERATOR_FILES = [
  'scripts/modules/handoff/executors/exec-to-plan/retrospective.js',
  'scripts/modules/handoff/executors/plan-to-exec/retrospective.js',
  'scripts/modules/handoff/executors/lead-to-plan/retrospective.js',
];

function read(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('retro-clobber guard — handoff retro-generators preserve manually-curated rows', () => {
  for (const rel of GENERATOR_FILES) {
    describe(rel, () => {
      const src = read(rel);

      it('SELECT for existing retrospective fetches id + quality_score + metadata + generated_by', () => {
        // The guard cannot work if the SELECT only fetches 'id' — it needs to
        // see quality_score, metadata, and generated_by to make the skip decision.
        // Match: .select('id, quality_score, metadata, generated_by') with whitespace tolerance.
        const expandedSelectPattern = /\.select\s*\(\s*['"]id\s*,\s*quality_score\s*,\s*metadata\s*,\s*generated_by['"]\s*\)/;
        if (!expandedSelectPattern.test(src)) {
          throw new Error(
            `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: SELECT for existing retrospective is fetching only 'id' — must also fetch 'quality_score', 'metadata', 'generated_by' so the clobber guard can read them. Expected: .select('id, quality_score, metadata, generated_by')`
          );
        }
      });

      it('skipOverwrite predicate exists with manually_curated check', () => {
        // We require the literal token "manually_curated" to appear AND a
        // construct that prevents UPDATE when it's true.
        if (!/manually_curated/.test(src)) {
          throw new Error(
            `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: no 'manually_curated' check found. The clobber guard must consult metadata.manually_curated to preserve human-authored retros.`
          );
        }
      });

      it('skipOverwrite predicate covers generated_by MANUAL/CHAIRMAN/OPERATOR', () => {
        // Each of these tokens must appear as a string literal in the file —
        // they map to non-auto-generated retrospective sources that must NOT be
        // overwritten by a handoff retro-generator.
        for (const token of ['MANUAL', 'CHAIRMAN', 'OPERATOR']) {
          if (!new RegExp(`['"]${token}['"]`).test(src)) {
            throw new Error(
              `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: missing generated_by check for '${token}'. Manually-authored retrospectives sourced from ${token} must be preserved.`
            );
          }
        }
      });

      it('skipOverwrite predicate compares quality_score (existing > new)', () => {
        // Guard must skip UPDATE when existing row has higher quality_score
        // than the auto-generated payload (don't downgrade quality).
        if (!/existing.*quality_score\s*>\s*qualityScore/s.test(src)) {
          throw new Error(
            `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: missing quality_score downgrade check. Guard must skip UPDATE when existing.quality_score > NEW qualityScore.`
          );
        }
      });

      it('UPDATE branch is gated on (existing && !skipOverwrite)', () => {
        // The conditional UPDATE must check the skipOverwrite flag.
        if (!/if\s*\(\s*existing\s*&&\s*!skipOverwrite\s*\)/.test(src)) {
          throw new Error(
            `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: UPDATE branch is not gated on '!skipOverwrite'. Auto-gen UPDATE must be conditional.`
          );
        }
      });

      it('preservation log message is emitted when skipOverwrite triggers', () => {
        // User-visible signal that an auto-gen was suppressed (helps diagnose
        // why a retro wasn't refreshed during a handoff).
        if (!/preserved.*manually-curated/i.test(src)) {
          throw new Error(
            `[RETRO_CLOBBER_GUARD_MISSING] ${rel}: missing 'preserved' log message — operator visibility into the skip decision is required.`
          );
        }
      });
    });
  }

  it('cancel-sd.js no longer references non-existent cancelled_at column (QF-20260509-CANCEL-SD-COLDROP)', () => {
    // Bug 2 from the original feedback was already fixed in PR #3632; this assertion
    // pins the fix so a future regression shows up in CI.
    const src = read('scripts/cancel-sd.js');
    // Within the updates object literal — `cancelled_at:` followed by a value
    // would be a regression. We tolerate the token in comments / variable names.
    const linesWithKey = src
      .split('\n')
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) => /^\s*cancelled_at\s*:/.test(line));
    if (linesWithKey.length > 0) {
      const formatted = linesWithKey.map(({ line, idx }) => `  scripts/cancel-sd.js:${idx} — ${line.trim()}`).join('\n');
      throw new Error(
        `[CANCEL_SD_CANCELLED_AT_REGRESSION] cancelled_at column does not exist on strategic_directives_v2 (PGRST204). Found in:\n${formatted}\n\nRemove the field from the updates object; updated_at is trigger-managed.`
      );
    }
  });
});
