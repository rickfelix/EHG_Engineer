# Brainstorm: Skill AB Testing & Description Optimization

## Metadata
- **Date**: 2026-03-05
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD (phased)
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (infrastructure/protocol improvement)

---

## Problem Statement
Claude Code has 22 skills defined as markdown files in `.claude/skills/`, but only 4 of them have `description` frontmatter enabling auto-triggering. The remaining 18 skills only fire on explicit `/command` invocation. There is no system to measure skill triggering quality, compare description variants, or track improvements over time.

## Discovery Summary

### Current State
- **22 skills** in `.claude/skills/` (mix of `.md` and `.skill.md` files)
- **Only 4 have descriptions**: assist, claim, research, testing-agent
- **18 lack descriptions**: audit, barrel-remediation, doc-audit, eva (7 variants), feedback, flags, inbox, migration-safety, review-vision, schema-design
- Skills listed in system-reminder get descriptions from somewhere (settings, file content), but most lack the frontmatter `description` field

### User Goals
1. **All of the above**: Skills not triggering when they should, wrong skills triggering, AND measuring description quality
2. **Automated test harness**: Send N test prompts → measure which skill triggers → compare variants
3. **Supabase storage**: Persistent baseline scores and AB test results

### Key Technical Challenge
Claude Code has no "test mode" API. You can't programmatically ask "which skill would trigger for prompt X?" without running a full conversation or using the Anthropic API to simulate skill selection.

## Analysis

### Arguments For
1. **18 of 22 skills have no description** — massive low-hanging fruit just adding them
2. **Measurable improvement** — baseline scores create accountability and track progress
3. **Reuses the HEAL pattern** — score → improve → re-score is already proven in the codebase
4. **Skill reliability compounds** — every improved trigger saves time across all future sessions

### Arguments Against
1. **No test mode API** — automated AB testing requires solving a non-trivial infrastructure problem
2. **Ground truth is subjective** — "should this prompt trigger /heal or /doc-audit?" often has no clear answer
3. **Diminishing returns** — most skills work fine with explicit `/command` invocation

## Friction/Value/Risk Analysis

| Dimension | Score | Details |
|-----------|-------|---------|
| Friction Reduction | **7/10** | 18/22 skills never auto-trigger (4/5 pain); affects every session (3/5 breadth) |
| Value Addition | **7/10** | Saves cognitive load (3/5 direct); enables quality tracking + future skill gen (4/5 compound) |
| Risk Profile | **4/10** | Adding descriptions is additive, not breaking (2/5); over-triggering bounded (2/5) |
| **Decision** | **IMPLEMENT** | (7+7)=14 > (4×2)=8 |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) No test mode API means automated harness is non-trivial; (2) Skill triggering depends on context, not just description text; (3) Over-optimization risk — aggressive descriptions cause false positives
- **Assumptions at Risk**: (1) Description text is the primary lever (system-reminder format and ordering may matter more); (2) Synthetic test prompts reflect real usage
- **Worst Case**: Over-optimized descriptions cause skill conflicts, worse UX than explicit invocation

### Visionary
- **Opportunities**: (1) Feedback loop — every session improves skills over time; (2) Foundation for skill auto-generation; (3) Cross-pollination with EVA HEAL scoring
- **Synergies**: HEAL loop pattern reuse; `brainstorm_question_effectiveness` tracking pattern
- **Upside Scenario**: All 22 skills auto-trigger correctly, reducing cognitive load to zero. New skills auto-generate optimal descriptions.

### Pragmatist
- **Feasibility**: 7/10 — scoring + DB straightforward; automated harness is the hard part
- **Resource Requirements**: Supabase schema, scoring script, test prompt corpus (~110-220 prompts), API credits
- **Constraints**: (1) No skill-selection API; (2) Need ground truth labels; (3) No gradual rollout for description changes
- **Recommended Path**: Phase 1 = manual scoring rubric + add missing descriptions; Phase 2 = automated harness

### Synthesis
- **Consensus**: Scoring/storage layer is valuable and feasible. Automated harness is hardest piece.
- **Tension Points**: Challenger warns over-optimization vs Visionary wants aggressive auto-triggering. Balance = clear ground-truth definitions.
- **Composite Risk**: Medium

## Suggested Next Steps

### Phase 1: Baseline Scores + Description Optimization (Quick Fix / Small SD)
1. Define scoring rubric for skill descriptions (keyword coverage, specificity, exclusion clarity)
2. Score all 22 existing skills against the rubric
3. Add/optimize `description` frontmatter for the 18 skills that lack it
4. Save baseline scores to new Supabase table `skill_assessment_scores`
5. Create the `/skill-test` skill (or `/skill-audit`) that runs the rubric

### Phase 2: Automated AB Testing (Full SD)
1. Build test prompt corpus (5-10 prompts per skill, labeled with expected trigger)
2. Create harness using Anthropic API to simulate skill selection
3. AB framework: swap description variants, re-run corpus, compare trigger accuracy
4. Store results in `skill_ab_test_results` table
5. Dashboard or report for comparing variants

### Proposed Supabase Schema
```sql
-- Baseline and ongoing scores
CREATE TABLE skill_assessment_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_name TEXT NOT NULL,
  skill_file TEXT NOT NULL,
  version TEXT NOT NULL,           -- git hash or date stamp
  description_text TEXT,
  rubric_scores JSONB NOT NULL,    -- {keyword_coverage: 8, specificity: 7, ...}
  total_score NUMERIC(5,2),
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessed_by TEXT DEFAULT 'manual' -- 'manual' | 'automated'
);

-- AB test results (Phase 2)
CREATE TABLE skill_ab_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_name TEXT NOT NULL,
  variant_a TEXT NOT NULL,         -- description text A
  variant_b TEXT NOT NULL,         -- description text B
  test_prompts JSONB NOT NULL,    -- [{prompt, expected_trigger, a_triggered, b_triggered}]
  variant_a_accuracy NUMERIC(5,2),
  variant_b_accuracy NUMERIC(5,2),
  winner TEXT,                    -- 'a' | 'b' | 'tie'
  tested_at TIMESTAMPTZ DEFAULT NOW()
);
```
