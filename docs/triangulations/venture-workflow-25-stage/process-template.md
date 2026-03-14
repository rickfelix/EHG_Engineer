# Hierarchical Triangulation Process Template

## Overview

This template documents the multi-phase triangulation process used to evaluate a complex system through iterative external AI review. It can be reused for future evaluations (e.g., Operations workflow, Chairman dashboard, etc.).

## Process Structure

### Phase 1: High-Level Assessment
- **Scope**: Entire system at a glance — all components, all groupings
- **AIs consulted**: OpenAI, Gemini, Claude (Anthropic)
- **Goal**: Identify systemic patterns, structural issues, major gaps
- **Output**: `phase-1-high-level/consensus.md`

### Phase 2: Group-Level Deep Dive
- **Scope**: Each logical grouping analyzed independently
- **Built on**: Phase 1 findings (targeted review based on identified themes)
- **AIs consulted**: Same three AIs, with Phase 1 consensus as context
- **Goal**: Per-group detailed assessment with stage-by-stage review
- **Output**: `phase-2-groups/group-N-*/consensus.md` (one per group)

### Phase 3: Final Synthesis
- **Scope**: All Phase 1 + Phase 2 opinions consolidated
- **Built on**: All previous findings
- **AIs consulted**: Same three AIs, given ALL prior opinions
- **Goal**: Final consensus, prioritized improvements, strategic recommendations
- **Output**: `phase-3-final-synthesis/final-consensus.md`

## Folder Structure

```
docs/triangulations/<system-name>/
  process-template.md        # This file
  phase-1-high-level/
    prompt.md                # Prompt sent to external AIs
    openai-opinion.md        # OpenAI response
    gemini-opinion.md        # Gemini response
    claude-opinion.md        # Claude/Anthropic response
    ground-truth.md          # Claude Code ground-truth validation
    consensus.md             # Synthesized findings
  phase-2-groups/
    group-N-<name>/
      prompt.md              # Group-specific prompt (includes Phase 1 context)
      openai-opinion.md
      gemini-opinion.md
      claude-opinion.md
      ground-truth.md
      consensus.md
  phase-3-final-synthesis/
    prompt.md
    openai-opinion.md
    gemini-opinion.md
    claude-opinion.md
    final-consensus.md
```

## Evaluation Dimensions

Each phase evaluates along these dimensions:

| Dimension | Question |
|-----------|----------|
| **Logic & Flow** | Is the stage ordering and progression logical? |
| **Functionality** | Does each stage work correctly end-to-end? |
| **UI/Visual Design** | Does it look professional and consistent? |
| **UX/Workflow** | Is the user experience intuitive and efficient? |
| **Architecture** | Is the technical design clean, maintainable, scalable? |

## Scoring

Each dimension scored 1-10 per stage and per group. Final scores represent consensus across all three AIs, adjusted by Claude Code ground-truth validation.

## Key Rules

1. **External AIs first** — Send prompt before Claude Code analyzes
2. **Ground-truth validation** — Claude Code verifies disputed claims with codebase access
3. **Evidence required** — Every claim needs file paths, line numbers, or code snippets
4. **Multi-repo awareness** — Check both EHG (frontend) and EHG_Engineer (backend)
5. **Phase building** — Each phase's prompt includes findings from previous phases
