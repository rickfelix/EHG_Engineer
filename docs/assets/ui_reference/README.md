# UI Reference Images

This directory contains reference images for UI components and layouts used in the EHG Glass Cockpit interface.

## Purpose

Reference images serve as the source of truth for UI implementation. When creating new components:

1. Check this directory for existing references
2. Use the `ui-reference-workflow` skill for the image-to-component workflow
3. Map visual elements to design tokens (see `design-token-map` skill)

## Directory Structure

```
ui_reference/
├── dashboards/          # Full dashboard layouts
│   ├── glass-cockpit-main.png
│   └── briefing-panel.png
├── components/          # Individual component references
│   ├── decision-card.png
│   ├── metric-tile.png
│   └── action-button.png
└── patterns/            # UI patterns and compositions
    ├── data-table.png
    └── form-layout.png
```

## Adding New References

1. **Name convention**: `kebab-case.png` (e.g., `decision-card.png`)
2. **Resolution**: 2x for retina (e.g., 800x600 for a 400x300 component)
3. **Format**: PNG preferred for UI, JPG acceptable for photos
4. **Document**: Reference the image in your SD/PRD

## Using References in Implementation

### In SD/PRD

```markdown
## UI Reference
- Image: `docs/assets/ui_reference/components/decision-card.png`
- Target component: DecisionCard
- Key elements: Header, body, action buttons
```

### In Code Comments

```tsx
/**
 * DecisionCard component
 * Reference: docs/assets/ui_reference/components/decision-card.png
 */
```

## Design Token Mapping

When analyzing a reference image, map visual elements to design tokens:

| Visual Element | Design Token |
|----------------|--------------|
| Blue button | `bg-primary` |
| Card shadow | `shadow-card` |
| Heading | `text-lg font-semibold` |
| Body text | `text-sm text-muted-foreground` |

See `~/.claude/skills/design-token-map/SKILL.md` for the complete token reference.

## Workflow

1. **LEAD Phase**: Select reference image, define acceptance criteria
2. **PLAN Phase**: Document component mapping, bind to API types
3. **EXEC Phase**: Implement using `frontend-design` skill guidance
4. **Validation**: Run DESIGN sub-agent for compliance check

## Related Skills

- `frontend-design` - Overall design guidance
- `ui-reference-workflow` - Step-by-step implementation workflow
- `design-token-map` - Authoritative design tokens
- `design-validation-gates` - Validation requirements
