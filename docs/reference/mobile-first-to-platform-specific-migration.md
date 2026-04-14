# Migration Path: Option C → Option B (Mobile-Only to Platform-Specific Templates)

## Context

Board decision (2026-04-14, brainstorm b7df7fea): Deploy Option C (mobile-first, defer web) with a documented migration path to Option B (platform-specific templates) when web demand materializes.

**Current State (Option C):**
- Single template path: Expo for mobile/both, React/Next.js for web
- `buildReplitInstructions()` in replit-prompt-formatter.js handles both
- `detectStack()` in replit-format-strategies.js routes based on `targetPlatform`
- Security defaults shared via `mobile-security-defaults.js`

**Target State (Option B):**
- Separate template modules per platform for deeper optimization
- Platform-specific feature prompts, testing instructions, deployment guides
- Independent evolution of mobile and web template surfaces

## Migration Trigger

Migrate from C to B when ALL of the following are true:
1. **3+ ventures** have `target_platform = 'web'` and are actively building
2. **Web-specific optimization requests** have been logged (e.g., SSR, SEO meta tags, desktop keyboard shortcuts)
3. **Template divergence** exceeds 30% — mobile and web instructions share less than 70% content

## Migration Steps

### Step 1: Extract Template Modules (~100 LOC)

Split `buildReplitInstructions()` into two modules:

```
lib/eva/bridge/
  replit-template-mobile.js    ← Expo-specific: app.json, Expo Router, native components
  replit-template-web.js       ← React/Next.js-specific: SSR, routing, SEO, responsive CSS
  replit-prompt-formatter.js   ← Routes to correct template module based on targetPlatform
  mobile-security-defaults.js  ← UNCHANGED: shared security module imported by both templates
```

### Step 2: Split Format Strategies (~80 LOC)

Split `detectStack()` and format functions:

```
lib/eva/bridge/
  replit-format-strategies.js    ← Shared: extractSprintItems, formatArtifactContent
  replit-format-mobile.js        ← Mobile: formatMobilePlanMode, formatMobileFeaturePrompts
  replit-format-web.js           ← Web: formatWebPlanMode, formatWebFeaturePrompts
```

### Step 3: Platform-Specific Repo Seeder Docs (~60 LOC)

Enhance `replit-repo-seeder.js` with platform-specific doc generators:
- Mobile: `EXPO_SETUP.md` (app.json config, EAS Build, Expo Go testing)
- Web: `DEPLOYMENT.md` (hosting setup, SSR config, SEO checklist)
- Both: include both docs

### Step 4: Template Tests

Add platform-specific test suites:
- `tests/unit/eva/bridge/replit-template-mobile.test.js`
- `tests/unit/eva/bridge/replit-template-web.test.js`
- Regression: existing tests continue to pass unchanged

## Estimated Effort

| Step | LOC | Duration |
|------|-----|----------|
| Template extraction | ~100 | 1 day |
| Format strategies split | ~80 | 1 day |
| Seeder enhancement | ~60 | 0.5 day |
| Tests | ~100 | 0.5 day |
| **Total** | **~340** | **3 days** |

## Risk Mitigation

- **Risk**: Template drift after split (mobile gets updates, web doesn't)
  - **Mitigation**: Shared security-defaults module ensures critical patterns stay in sync
  - **Mitigation**: Lint rule enforcing both templates import the shared module

- **Risk**: Breaking existing mobile pipeline during migration
  - **Mitigation**: Feature flag — `USE_PLATFORM_TEMPLATES=true` enables B, defaults to C
  - **Mitigation**: Rollback: delete platform-specific modules, revert to single path

- **Risk**: Increased maintenance burden (2 templates instead of 1)
  - **Mitigation**: Only migrate when 3+ ventures justify the investment
  - **Mitigation**: Shared module contains all security/database patterns (biggest surface area)

## What NOT to Do

- Do NOT duplicate the security-defaults module — it stays shared
- Do NOT create separate Stitch projects per platform (excluded in brainstorm)
- Do NOT add tablet/wearable/TV targets (excluded in brainstorm)
- Do NOT loop through S19-S22 for web expansion (board rejected)

## Related Documents
- [Target Platform Decision Rubric](target-platform-decision-rubric.md)
- Vision: VISION-MOBILE-FIRST-BUILD-STRATEGY-L2-001
- Arch Plan: ARCH-MOBILE-FIRST-BUILD-STRATEGY-001
- Board Verdict: a6fa5b0a (Option C with conditions, 4-2 vote)
