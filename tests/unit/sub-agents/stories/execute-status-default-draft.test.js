// QF-20260527-530: F12 second-writer regression guard.
//
// Pre-fix behavior: lib/sub-agents/modules/stories/execute.js:296 hardcoded
// status='ready' for every user_story row inserted, regardless of acceptance-
// criteria quality. When PRD creation produced 3 boilerplate stories, all
// landed at ready → PLAN-TO-EXEC USER_STORY_QUALITY gate blocked. Workaround
// required manual UPDATE rows to draft. 2nd writer of the F12 default-to-draft
// pattern that PR #4019 shipped to scripts/modules/auto-trigger-stories.mjs.
//
// Post-fix: status is `allAcsBoilerplate(criteria) ? 'draft' : 'ready'` —
// mirrors PR #4019's logic, reusing the same canonical helper.
//
// Static-pattern test asserts (1) the helper is imported from the canonical
// module, (2) the inline hardcoded `status: 'ready'` is gone, (3) the call
// shape is correct.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../../lib/sub-agents/modules/stories/execute.js');

describe('QF-20260527-530: stories/execute.js default-to-draft (F12 2nd writer)', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('imports allAcsBoilerplate from the canonical auto-trigger-stories module', () => {
    expect(code).toMatch(
      /import\s*\{\s*allAcsBoilerplate\s*\}\s*from\s*['"][^'"]*scripts\/modules\/auto-trigger-stories\.mjs['"]/,
    );
  });

  it('does not contain the prior hardcoded `status: \'ready\',` for user_story inserts', () => {
    // Match the EXACT pre-fix line shape — a bare `status: 'ready',` on its own
    // line inside the userStory object. Post-fix uses the ternary expression.
    // We allow `status: 'ready'` to still appear inside the ternary's else-branch.
    const hardcodedReady = /\n\s+status:\s+['"]ready['"],\s*\n\s+acceptance_criteria:/;
    expect(code).not.toMatch(hardcodedReady);
  });

  it('applies allAcsBoilerplate(storyContent.acceptance_criteria) to decide draft vs ready', () => {
    expect(code).toMatch(
      /status:\s*allAcsBoilerplate\s*\(\s*storyContent\.acceptance_criteria\s*\)\s*\?\s*['"]draft['"]\s*:\s*['"]ready['"]/,
    );
  });
});
