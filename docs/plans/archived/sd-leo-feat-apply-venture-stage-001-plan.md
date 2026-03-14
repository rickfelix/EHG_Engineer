<!-- Archived from: C:/Users/rickf/.claude/plans/venture-stage-design-standards-1-3.md -->
<!-- SD Key: SD-LEO-FEAT-APPLY-VENTURE-STAGE-001 -->
<!-- Archived at: 2026-03-09T23:15:48.654Z -->

# Plan: Apply Venture Stage Design Standards (Stages 1-3)

## Goal

Implement the 12 universal design rules from `ehg/docs/design-system/venture-stage-design-standards.md` for stages 1, 2, and 3 plus shared components. First batch of an incremental rollout — Chairman reviews after this batch before proceeding to stages 4+.

## Summary

The Chairman persona demands density, zero decoration, and consistent action placement. This SD applies the design standards established through the UI Design Evaluation Process to the first 3 stages (covering Simple Content Display and Gate Decision View templates) and the shared components they depend on.

## Success Criteria

- [ ] BuildingHero removed from rendering for stages 1-3 (Rule 1)
- [ ] JourneyBadge replaced with inline "Stage N/25" badge for all stages (Rule 2)
- [ ] Action buttons (Mark Complete / Approve / Reject) always render top-right in header row (Rule 12)
- [ ] No full-width gate banners — gate actions are inline buttons same position as Mark Complete
- [ ] Stage name appears exactly once per screen — no redundancy between header and card (Rule 5)
- [ ] AdvisoryDataPanel accepts `exclude` prop and Stage 1-3 renderers pass keys they already display (Rule 5)
- [ ] ArtifactListPanel returns null when empty instead of showing placeholder card (Rule 11)
- [ ] Decorative header icons removed from AdvisoryDataPanel and ArtifactListPanel (Rule 10)
- [ ] Decorative icons removed from Stage 1 and Stage 3 renderer card headers (Rule 10)
- [ ] DecisionCard removed from non-gate stages (Rule 9)
- [ ] Gate verdict banner shows verdict + score + rationale in single compact unit (Rule 6)
- [ ] Failing metrics sorted above passing metrics in Stage 3 (Rule 4)

## Files Modified

| File | Change |
|------|--------|
| `src/components/ventures/building-mode/BuildingMode.tsx` | Remove BuildingHero, inline JourneyBadge, add header row with action buttons |
| `src/components/ventures/building-mode/BuildingHero.tsx` | Extract action button logic before removal |
| `src/components/ventures/building-mode/JourneyBadge.tsx` | May be simplified or replaced with inline badge |
| `src/components/stages/shared/AdvisoryDataPanel.tsx` | Add `exclude` prop, remove ClipboardList icon |
| `src/components/stages/shared/ArtifactListPanel.tsx` | Return null when empty, remove FolderOpen icon |
| `src/components/stages/Stage1DraftIdea.tsx` | Remove Lightbulb icon, pass exclude list, remove stage name from card header |
| `src/components/stages/Stage3KillGate.tsx` | Remove decorative icons, add verdict banner, worst-first metric sorting |
| `src/components/ventures/building-mode/DecisionCard.tsx` | Remove from non-gate stages |

## Design Reference

Full design standards: `ehg/docs/design-system/venture-stage-design-standards.md`
Implementation checklist: IC-1 through IC-10 in the same document

## Incremental Rollout

- **This SD**: Stages 1-3 + shared components
- **Next SD**: Stages 4-7 (after Chairman feedback on this batch)
- **Subsequent**: Remaining stages in batches of 3-4
