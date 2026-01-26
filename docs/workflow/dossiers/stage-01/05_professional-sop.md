# Stage 1: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, validation, frontend

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:24-40 (substages)

## Entry Gate Checklist

✅ No entry gates defined (entry point to workflow)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:19 `"entry: []"`

## Execution Steps

### Substage 1.1: Idea Brief Creation ✅ IMPLEMENTED

**Done When**:
- Title captured
- Description written
- Category selected

**Procedure**:
1. User provides title (3-120 chars) via UI
2. User provides description (20-2000 chars) via UI
3. User selects category from predefined list
4. System validates all fields meet criteria (frontend + database + API validation)

**Implementation**: `/mnt/c/_EHG/EHG/src/components/stages/Stage1DraftIdea.tsx` (lines 199-283)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:25-30

### Substage 1.2: Assumption Listing ❌ NOT IMPLEMENTED

**Done When**:
- Key assumptions documented
- Risk factors identified

**Procedure** (AS DOCUMENTED):
1. User documents key assumptions about market, product, execution
2. System prompts for risk identification
3. User lists potential risk factors

**Implementation Status**: NOT found in actual UI component (Stage1DraftIdea.tsx). No "assumptions" or "risk factors" input fields exist.

**Alternative**: Strategic Context fields implemented instead (Vision Alignment slider, Strategic Focus badges, Performance Drive Phase selection).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:31-35

### Substage 1.3: Initial Success Criteria ❌ NOT IMPLEMENTED

**Done When**:
- Success metrics defined
- Validation rules applied

**Procedure** (AS DOCUMENTED):
1. User defines success metrics (quantitative if possible)
2. System applies validation rules to criteria
3. Criteria stored in venture record

**Implementation Status**: NOT found in actual UI component (Stage1DraftIdea.tsx). No "success metrics" or "success criteria" input fields exist.

**Alternative**: System generates EVA quality score (0-100) based on automated analysis of title, description, and strategic context.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:36-40

## Exit Gate Criteria

- [x] Title validated (3-120 chars)
- [x] Description validated (20-2000 chars)
- [x] Category assigned

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:20-23

## Error Handling

**Note**: No explicit error handling defined in stages.yaml. Gap identified in critique (Weakness #4).

**Recommendation**: Define rollback procedures (see 10_gaps-backlog.md)

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 19 |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 20-23 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 24-40 |
