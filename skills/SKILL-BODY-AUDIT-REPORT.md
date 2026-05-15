# Skill Body Audit Report

Progressive-disclosure body-LOC audit per Pocock pattern (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-E).

## Summary

- Total files audited: **61**
- Total body LOC: **16520**
- Threshold: body_loc > 200 LOC
- Offenders: **28**

## Top 3 Offenders

| Rank | Path | Body LOC | Overage | Recommendation |
|---:|------|--------:|--------:|----------------|
| 1 | `.claude/commands/brainstorm.md` | 2078 | +1878 | Refactor body to <=100 LOC; extract instructions to supporting doc adjacent to file. |
| 2 | `.claude/commands/document.md` | 1237 | +1037 | Refactor body to <=100 LOC; extract instructions to supporting doc adjacent to file. |
| 3 | `.claude/commands/ship.md` | 916 | +716 | Refactor body to <=100 LOC; extract instructions to supporting doc adjacent to file. |

## Full Audit Table

| Path | Scope | Body LOC | Status | Supporting Docs |
|------|-------|--------:|--------|----------------:|
| `.claude/commands/assist.md` | commands | 307 | OFFENDER | 0 |
| `.claude/commands/batch.md` | commands | 71 | COMPLIANT | 0 |
| `.claude/commands/brainstorm.md` | commands | 2078 | OFFENDER | 0 |
| `.claude/commands/claim.md` | commands | 293 | OFFENDER | 0 |
| `.claude/commands/context-compact.md` | commands | 145 | COMPLIANT | 0 |
| `.claude/commands/coordinator.md` | commands | 637 | OFFENDER | 0 |
| `.claude/commands/distill.md` | commands | 753 | OFFENDER | 0 |
| `.claude/commands/doc-audit.md` | commands | 117 | COMPLIANT | 0 |
| `.claude/commands/document.md` | commands | 1237 | OFFENDER | 0 |
| `.claude/commands/eva-support.md` | commands | 124 | COMPLIANT | 0 |
| `.claude/commands/execute.md` | commands | 200 | COMPLIANT | 0 |
| `.claude/commands/feedback.md` | commands | 25 | COMPLIANT | 0 |
| `.claude/commands/friday.md` | commands | 84 | COMPLIANT | 0 |
| `.claude/commands/gate-debug.md` | commands | 283 | OFFENDER | 0 |
| `.claude/commands/handoff-in.md` | commands | 105 | COMPLIANT | 0 |
| `.claude/commands/handoff-out.md` | commands | 48 | COMPLIANT | 0 |
| `.claude/commands/heal.md` | commands | 243 | OFFENDER | 0 |
| `.claude/commands/inbox.md` | commands | 270 | OFFENDER | 0 |
| `.claude/commands/learn.md` | commands | 308 | OFFENDER | 0 |
| `.claude/commands/leo-cleanup.md` | commands | 150 | COMPLIANT | 0 |
| `.claude/commands/leo-resume.md` | commands | 86 | COMPLIANT | 0 |
| `.claude/commands/leo-settings.md` | commands | 82 | COMPLIANT | 0 |
| `.claude/commands/leo.md` | commands | 676 | OFFENDER | 0 |
| `.claude/commands/prove.md` | commands | 545 | OFFENDER | 0 |
| `.claude/commands/quick-fix.md` | commands | 234 | OFFENDER | 0 |
| `.claude/commands/rca.md` | commands | 236 | OFFENDER | 0 |
| `.claude/commands/read-full.md` | commands | 48 | COMPLIANT | 0 |
| `.claude/commands/restart.md` | commands | 63 | COMPLIANT | 0 |
| `.claude/commands/sd-create.md` | commands | 158 | COMPLIANT | 0 |
| `.claude/commands/sd-start.md` | commands | 435 | OFFENDER | 0 |
| `.claude/commands/ship.md` | commands | 916 | OFFENDER | 0 |
| `.claude/commands/signal.md` | commands | 67 | COMPLIANT | 0 |
| `.claude/commands/simplify.md` | commands | 218 | OFFENDER | 0 |
| `.claude/commands/status.md` | commands | 73 | COMPLIANT | 0 |
| `.claude/commands/triangulation-protocol.md` | commands | 391 | OFFENDER | 0 |
| `.claude/commands/uat.md` | commands | 340 | OFFENDER | 0 |
| `.claude/skills/assist.md` | skills_stubs | 302 | OFFENDER | 0 |
| `.claude/skills/audit.md` | skills_stubs | 90 | COMPLIANT | 0 |
| `.claude/skills/barrel-remediation.md` | skills_stubs | 133 | COMPLIANT | 0 |
| `.claude/skills/claim.md` | skills_stubs | 365 | OFFENDER | 0 |
| `.claude/skills/doc-audit.md` | skills_stubs | 106 | COMPLIANT | 0 |
| `.claude/skills/eva-archplan.skill.md` | skills_stubs | 245 | OFFENDER | 0 |
| `.claude/skills/eva-constitution.skill.md` | skills_stubs | 111 | COMPLIANT | 0 |
| `.claude/skills/eva-mission.skill.md` | skills_stubs | 93 | COMPLIANT | 0 |
| `.claude/skills/eva-okr.skill.md` | skills_stubs | 120 | COMPLIANT | 0 |
| `.claude/skills/eva-research.skill.md` | skills_stubs | 217 | OFFENDER | 0 |
| `.claude/skills/eva-score.skill.md` | skills_stubs | 112 | COMPLIANT | 0 |
| `.claude/skills/eva-strategy.skill.md` | skills_stubs | 112 | COMPLIANT | 0 |
| `.claude/skills/eva-vision.skill.md` | skills_stubs | 244 | OFFENDER | 0 |
| `.claude/skills/eva.skill.md` | skills_stubs | 126 | COMPLIANT | 0 |
| `.claude/skills/feedback.md` | skills_stubs | 19 | COMPLIANT | 0 |
| `.claude/skills/flags.md` | skills_stubs | 430 | OFFENDER | 0 |
| `.claude/skills/inbox.md` | skills_stubs | 499 | OFFENDER | 0 |
| `.claude/skills/migration-safety.skill.md` | skills_stubs | 19 | COMPLIANT | 0 |
| `.claude/skills/prove.md` | skills_stubs | 532 | OFFENDER | 0 |
| `.claude/skills/README.md` | skills_stubs | 21 | COMPLIANT | 0 |
| `.claude/skills/research.md` | skills_stubs | 121 | COMPLIANT | 0 |
| `.claude/skills/review-vision.skill.md` | skills_stubs | 240 | OFFENDER | 0 |
| `.claude/skills/schema-design.skill.md` | skills_stubs | 20 | COMPLIANT | 0 |
| `.claude/skills/testing-agent.md` | skills_stubs | 177 | COMPLIANT | 0 |
| `skills/grill/SKILL.md` | skills | 20 | COMPLIANT | 1 |

## Methodology

Body LOC is computed by stripping BOM, removing YAML frontmatter only when anchored at file start with paired `---` fences,
removing HTML `reasoning_effort` metadata comments, normalizing CRLF to LF, dropping trailing blank lines, and counting the remaining lines.
Fenced code blocks are NOT stripped — every fence line counts toward body LOC.
Threshold is **strict greater-than**: exactly 200 LOC is compliant; 201 LOC is the first offender.

Generator: `scripts/pocock/audit-skill-bodies.mjs`

