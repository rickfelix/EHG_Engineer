#!/usr/bin/env node
/**
 * User Story Requirements Template
 * SD: SD-LEO-INFRA-USER-STORY-REQUIREMENTS-001
 *
 * Outputs all user story quality gate requirements so sessions can write
 * gate-passing stories on the first attempt.
 *
 * Usage:
 *   npm run story:template              # Show all requirements
 *   npm run story:template SD-XXX-001   # Show with SD-type-specific thresholds
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SD_TYPE_THRESHOLDS = {
  documentation: 50, docs: 50,
  infrastructure: 50, infra: 50,
  quality: 50, qa: 50, testing: 50, e2e: 50,
  tooling: 55, devops: 55,
  feature: 55, enhancement: 55,
  bugfix: 55, bug_fix: 55, fix: 55,
  database: 68, security: 68,
  default: 70
};

const RUBRIC_WEIGHTS = {
  acceptance_criteria_clarity_testability: { weight: 50, label: 'Acceptance Criteria Clarity & Testability' },
  story_independence_implementability: { weight: 30, label: 'Story Independence & Implementability' },
  benefit_articulation: { weight: 15, label: 'Benefit Articulation' },
  given_when_then_format: { weight: 5, label: 'Given-When-Then Format' }
};

async function getSDType(sdKey) {
  if (!sdKey) return null;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase.from('strategic_directives_v2')
    .select('sd_type').eq('sd_key', sdKey).single();
  return data?.sd_type || null;
}

function getThreshold(sdType) {
  if (!sdType) return SD_TYPE_THRESHOLDS.default;
  return SD_TYPE_THRESHOLDS[sdType.toLowerCase()] || SD_TYPE_THRESHOLDS.default;
}

async function main() {
  const sdKey = process.argv[2];
  const sdType = sdKey ? await getSDType(sdKey) : null;
  const threshold = getThreshold(sdType);

  console.log(`
════════════════════════════════════════════════════════════
  USER STORY QUALITY REQUIREMENTS
════════════════════════════════════════════════════════════`);

  if (sdKey) {
    console.log(`  SD: ${sdKey}`);
    console.log(`  Type: ${sdType || 'unknown'}`);
    console.log(`  Pass Threshold: ${threshold}%`);
  } else {
    console.log(`  Default Threshold: ${threshold}% (pass --sd-key for type-specific)`);
  }

  console.log(`
── STRUCTURAL REQUIREMENTS (NOT NULL) ─────────────────────

  These columns must have values or INSERT will fail:

  ✦ implementation_context  (text, NOT NULL)
    What: Technical approach and file locations for the story
    Min: 20+ characters recommended
    Example: "Modify lib/auth/session.js to add token rotation.
              Use existing refreshToken() method as base."

  ✦ given_when_then  (JSONB array)
    What: Structured BDD scenarios
    Format: [{given: "...", when: "...", then_clause: "..."}]
    Min: 1 scenario per story, 3+ recommended

  ✦ testing_scenarios  (JSONB array of strings)
    What: Concrete test cases
    Format: ["Run X and verify Y", "Submit form with Z..."]
    Min: 1 scenario, 3+ recommended

  ✦ architecture_references  (JSONB array)
    What: References to architecture plan phases/components
    Format: ["Phase 1: Component Name", "API endpoint: /foo"]
    Note: Populate when architecture plan exists for the SD

── SEMANTIC QUALITY CRITERIA (AI-SCORED) ──────────────────

  Stories are scored 0-100 by an LLM rubric with these weights:
`);

  for (const [key, info] of Object.entries(RUBRIC_WEIGHTS)) {
    console.log(`  ${info.label} (${info.weight}%)`);
  }

  console.log(`
  Scoring scale per criterion (0-10):
    0-3: No criteria, boilerplate, or untestable
    4-6: Some specific elements but vague or missing testability
    7-8: Most elements specific, testable, and verifiable
    9-10: Excellent — fully testable with clear pass/fail

── ACCEPTANCE CRITERIA RULES (50% weight) ─────────────────

  ✦ Must be specific, measurable, pass/fail assertions
    BAD:  "System works correctly"
    GOOD: "GIVEN user submits form WHEN email is invalid
           THEN error message 'Invalid email format' appears"

  ✦ For feature/bugfix SDs: ≥1 criterion must be human-verifiable
    BAD:  "Data saved to database correctly" (all technical)
    GOOD: "User sees success message after clicking Submit"

  ✦ For infrastructure/docs SDs: Technical-only criteria OK
    OK:   "Deploy time < 30s" or "Query returns < 100ms"

  ✦ Minimum: 2 acceptance criteria per story

── BENEFIT ARTICULATION RULES (15% weight) ────────────────

  ✦ Must be specific, user-centric, and 400+ characters recommended
    BAD:  "Improves the system" (generic, <50 chars)
    GOOD: "Reduces chairman daily triage time from 30-60 minutes
           of manual YouTube scanning to <60 seconds of digest
           review, with >70% relevance precision validated by
           chairman feedback over a 30-day supervised period"

  ✦ For infrastructure SDs: Technical benefits acceptable
    OK:   "Eliminates 2-3 failed handoff cycles per SD, saving
           30-90 minutes of rework each time"

── GIVEN-WHEN-THEN RULES (5% weight) ─────────────────────

  ✦ Structured as JSONB array of objects
  ✦ Each object: {given, when, then_clause}
  ✦ Map 1:1 with acceptance criteria where possible

── SD TYPE THRESHOLDS ─────────────────────────────────────
`);

  const types = Object.entries(SD_TYPE_THRESHOLDS)
    .filter(([k]) => !['default', 'docs', 'infra', 'qa', 'e2e', 'bug_fix'].includes(k));

  for (const [type, thresh] of types) {
    const marker = sdType && type === sdType.toLowerCase() ? ' ◄ THIS SD' : '';
    console.log(`  ${type.padEnd(18)} ${thresh}%${marker}`);
  }

  console.log(`
── EXAMPLE STORY (Scoring 80%+) ───────────────────────────

  title: "View Story Requirements Before Writing"
  user_role: "LEO Protocol session (Claude Code agent)"
  user_want: "run npm run story:template to see all quality
              requirements before writing stories"
  user_benefit: "First-attempt PLAN-TO-EXEC handoff pass rate
                 increases from ~30% to >80% by eliminating
                 discovery-through-failure loops, saving
                 30-90 minutes of rework per SD"
  acceptance_criteria:
    - "GIVEN template command exists WHEN running
       npm run story:template THEN output displays all
       structural constraints (NOT NULL columns, min chars)"
    - "GIVEN command is run THEN semantic quality criteria
       listed with minimum score expectations"
  given_when_then:
    - {given: "template command exists",
       when: "running npm run story:template",
       then_clause: "output displays all structural constraints"}
  testing_scenarios:
    - "Run npm run story:template with no args, verify output"
    - "Run npm run story:template SD-XXX, verify thresholds"
  implementation_context: "Create scripts/story-requirements-
    template.js. Read curated requirements from hardcoded
    summary. Accept optional SD-KEY argument."

── VALIDATOR SOURCE ───────────────────────────────────────

  Gate:   userStoryQualityValidation (PLAN-TO-EXEC)
  Rubric: scripts/modules/rubrics/user-story-quality-rubric.js
  Verifier: scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js
  Validator: scripts/modules/user-story-quality-validation.js

════════════════════════════════════════════════════════════`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
