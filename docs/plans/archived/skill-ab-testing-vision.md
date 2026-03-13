# Vision: Skill Assessment System & Triage Auto-Escalation

## Executive Summary
Claude Code's skill system (22 `.md` files in `.claude/skills/`) is the primary mechanism for extending orchestrator behavior with domain-specific workflows. However, 18 of 22 skills lack the `description` frontmatter field that enables contextual auto-triggering — meaning they only fire on explicit `/command` invocation. There is no system to measure skill triggering quality, compare description variants, or track improvements.

This vision establishes a skill quality intelligence layer: a scoring rubric for skill descriptions, baseline measurements for all skills, an automated AB testing harness that measures trigger accuracy against a labeled prompt corpus, and a HEAL-loop-inspired iterative improvement cycle. The goal is to transform skills from "commands you must remember" to "intelligent behaviors that activate when needed."

## Problem Statement
**What problem this addresses:** Claude Code skills have no quality feedback loop. When a skill fails to trigger (false negative) or triggers incorrectly (false positive), there is no measurement, no baseline to compare against, and no systematic way to improve descriptions. The 18 skills without descriptions represent a 82% coverage gap in auto-triggering capability.

**Who is affected:**
- **LEO Orchestrator sessions** — Must explicitly invoke skills by name, adding cognitive overhead and missing opportunities for contextual invocation
- **Skill authors** — Write descriptions (or don't) with no feedback on effectiveness; no way to compare variants
- **New users** — Cannot discover skills through natural conversation; must know exact `/command` names

**Current impact:** Skills that could save time and reduce errors (like `/heal`, `/rca`, `/learn`) are underutilized because they depend on the user remembering to invoke them. Auto-triggering descriptions, when present, are written by intuition rather than data.

## Personas

### LEO Session Operator (Primary)
- **Goals**: Have skills activate contextually when relevant, without memorizing 22 command names
- **Mindset**: "If I'm discussing a test failure, `/rca` should suggest itself. If I'm finishing an SD, `/learn` should auto-invoke."
- **Key Activities**: Running SD workflows, responding to errors, completing phases, reviewing output

### Skill Author (Builder)
- **Goals**: Write skill descriptions that trigger correctly — not too broad, not too narrow
- **Mindset**: Wants data: "My description triggers on 8/10 relevant prompts and 0/10 irrelevant ones"
- **Key Activities**: Creating new skills, editing descriptions, reviewing trigger accuracy reports

### Protocol Maintainer (Quality Owner)
- **Goals**: Ensure the skill catalog is healthy — all skills discoverable, no conflicts, no dead skills
- **Mindset**: "Give me a dashboard showing skill health scores, trending up or down"
- **Key Activities**: Running skill audits, reviewing AB test results, approving description changes

## Information Architecture

### Data Layer Structure
```
skill_assessment_scores (baseline + ongoing)
├── skill_name, skill_file, version
├── description_text (current description)
├── rubric_scores JSONB {keyword_coverage, specificity, exclusion_clarity, ...}
├── total_score, assessed_at, assessed_by
└── trigger_test_results JSONB (from automated runs)

skill_ab_test_results (Phase 2)
├── skill_name, variant_a, variant_b
├── test_prompts JSONB [{prompt, expected, a_result, b_result}]
├── variant_a_accuracy, variant_b_accuracy, winner
└── tested_at

skill_test_corpus (ground truth)
├── skill_name, prompt_text, should_trigger (boolean)
├── confidence (high/medium/low), category
└── created_at, last_validated_at
```

### Views
- **Skill Health Dashboard** — Aggregate scores per skill with trend (improving/declining/stable)
- **Trigger Accuracy Matrix** — Per-skill precision/recall against test corpus
- **Conflict Detection** — Prompts where 2+ skills claim to trigger (overlap analysis)

### Navigation
- `npm run skill:audit` — Run rubric scoring against all skills, save baselines
- `npm run skill:test` — Run test corpus against current descriptions (Phase 2)
- `npm run skill:ab <skill> <variant>` — AB test a description variant (Phase 2)

## Key Decision Points

1. **Scoring rubric design**: What dimensions define a "good" skill description? (keyword coverage, specificity, exclusion clarity, trigger word density, conflict avoidance)
2. **Test harness mechanism**: How to simulate "which skill triggers" — API-based conversation simulation vs. log parsing vs. description-matching heuristic
3. **Ground truth labeling**: Who defines "this prompt should trigger /heal" — automated classification or human labeling?
4. **Conflict resolution**: When 2+ skills match a prompt, which wins? Priority system or description refinement?

## Integration Patterns

### Existing System Integration
- **HEAL Loop Pattern**: Reuse score → fix → re-score cycle for skill descriptions
- **EVA Vision Scoring**: Skill health scores tracked alongside other EVA dimensions
- **Brainstorm Question Effectiveness**: Same pattern — track what works, promote effective approaches
- **Pre-commit hooks**: Could validate skill descriptions against rubric before commit

### Skill File Format
Skills are `.md` files with optional YAML frontmatter:
```yaml
---
description: "Trigger text that Claude uses for auto-invocation decisions"
---
# /command-name - Human Title
...instructions...
```
The `description` field is injected into the system-reminder and is the primary lever for auto-triggering.

## Evolution Plan

### Phase 1: Baseline Scoring + Description Addition (~50 LOC)
- Define 5-dimension scoring rubric
- Score all 22 skills against rubric
- Add/optimize `description` frontmatter for 18 missing skills
- Save baselines to `skill_assessment_scores` table
- Create `/skill-audit` skill to run scoring on demand

### Phase 2: Test Corpus + Automated Harness
- Build labeled test corpus (5-10 prompts per skill = ~110-220 prompts)
- Create description-matching heuristic (keyword overlap + semantic similarity)
- Automated trigger accuracy measurement
- AB test framework: swap descriptions, re-run corpus, compare

### Phase 3: Continuous Improvement Loop
- Integration with session telemetry (which skills actually triggered per session)
- Auto-suggest description improvements based on false positive/negative patterns
- Conflict detection and resolution recommendations

## Triage Auto-Escalation

### Problem
The work item triage gate (`triage-gate.js`) uses a default 10 LOC / 50% confidence estimate when it cannot analyze actual scope. When a vision document and architecture plan exist with explicit LOC estimates (e.g., 200-300 LOC), the triage gate ignores this evidence and still recommends Quick Fix. This leads to scope reduction when the user accepts the QF recommendation.

### Solution
1. **Triage gate context awareness**: Accept `--estimated-loc` override flag; when vision/architecture docs exist for the topic, use their LOC estimates instead of the default heuristic
2. **`/leo create` auto-escalation**: When architecture LOC > tier limit, auto-escalate to full SD without presenting QF as an option
3. **`create-quick-fix.js` pre-check**: If a matching EVA vision/architecture doc exists, warn that scope likely exceeds QF limits
4. **CLAUDE.md Work Item Routing**: Add escalation rule to the protocol section via `leo_protocol_sections` DB update
5. **`issue_patterns` logging**: Record this as a pattern for future session learning

### Success Criteria
- Triage gate accepts `--estimated-loc` and `--arch-key` flags
- When arch plan LOC > 75, triage auto-returns tier 3 (full SD)
- `/leo create` skill instructions include auto-escalation logic
- Protocol section updated via DB + regeneration

## Out of Scope
- Changing how Claude Code loads or evaluates skill descriptions (that's Anthropic's codebase)
- Creating a GUI for skill management (CLI-only)
- Modifying skill content/instructions (only descriptions are in scope)
- Real-time skill routing changes (we measure and recommend, not intercept)

## UI/UX Wireframes
N/A — no UI component. All interaction via CLI commands:
```
$ npm run skill:audit
Skill Assessment Report (2026-03-05)
─────────────────────────────────────
  /heal         ████████░░  8.2/10  ↑ (+0.5 from baseline)
  /rca          ███████░░░  7.0/10  → (no change)
  /claim        ██████░░░░  6.1/10  ↓ (-0.3 — overlap with /status)
  /inbox        ░░░░░░░░░░  0.0/10  ✗ NO DESCRIPTION
  ...
  Overall: 4.2/10 (18 skills missing descriptions)
```

## Success Criteria
1. **100% description coverage**: All 22 skills have `description` frontmatter (currently 4/22 = 18%)
2. **Baseline scores captured**: All skills scored against rubric and stored in Supabase
3. **Mean score >= 7.0/10**: Average skill description quality across all 22 skills
4. **Zero high-conflict pairs**: No two skills with >50% prompt overlap in test corpus
5. **Trigger accuracy >= 80%**: When tested against labeled corpus, skills trigger correctly 80%+ of the time (Phase 2)
6. **Re-scoring capability**: `/skill-audit` skill can re-run assessment and compare to baseline
