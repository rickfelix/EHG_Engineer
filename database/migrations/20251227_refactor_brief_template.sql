-- Migration: Refactor Brief Template
-- Created: 2025-12-27
-- Purpose: Add lighter-weight documentation template for refactoring SDs
--
-- The Refactor Brief is a streamlined alternative to full PRD for cosmetic/structural refactoring.
-- It focuses on:
-- - Current state vs desired state
-- - Files affected
-- - Risk zones
-- - Verification criteria
--
-- Used when: sd_type = 'refactor' AND intensity_level IN ('cosmetic', 'structural')
-- Full PRD required when: intensity_level = 'architectural'

BEGIN;

-- ============================================================================
-- INSERT REFACTOR BRIEF TEMPLATE INTO PROTOCOL SECTIONS
-- ============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'template',
  'Refactor Brief Template',
  E'# Refactor Brief: [SD-ID]

## Document Information
| Field | Value |
|-------|-------|
| **SD ID** | [SD-XXX] |
| **Intensity** | [cosmetic \\| structural] |
| **Created** | [YYYY-MM-DD] |
| **Author** | [Claude/Human] |

---

## 1. Current State

### 1.1 Code Location
- **Primary file(s)**: `path/to/file.ts`
- **Related files**: List of files that import/use this code

### 1.2 Current Implementation
[Brief description of what the code currently does and why it needs refactoring]

### 1.3 Code Smell / Technical Debt
[Identify the specific issue: duplication, long method, tight coupling, etc.]

---

## 2. Desired State

### 2.1 Proposed Structure
[Describe what the refactored code should look like]

### 2.2 Key Changes
- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

### 2.3 Expected Benefits
- Improved readability
- Better maintainability
- Reduced complexity
- [Other benefits]

---

## 3. Files Affected

| File | Change Type | Risk Level | Notes |
|------|-------------|------------|-------|
| `path/to/file.ts` | Modify | Low | Main refactoring target |
| `path/to/importer.ts` | Modify | Low | Import path update |
| `path/to/test.test.ts` | None | None | Verify still passes |

**Total files affected**: X
**Estimated LOC changed**: Y

---

## 4. Risk Zones

### 4.1 Dependency Risks
- [ ] **Circular dependency risk**: [Description or N/A]
- [ ] **Breaking import risk**: [Description or N/A]
- [ ] **Type compatibility risk**: [Description or N/A]

### 4.2 Public API Risks
- [ ] **Export changes**: [List any exports being renamed/moved]
- [ ] **Function signature changes**: [None expected for refactoring]
- [ ] **Type definition changes**: [Description or N/A]

### 4.3 Test Risks
- [ ] **Tests needing updates**: [List or "None - behavior unchanged"]
- [ ] **Coverage impact**: [Should remain same or improve]

---

## 5. Verification Criteria

### 5.1 Pre-Refactor Baseline (capture before changes)
- [ ] All existing tests pass
- [ ] Build succeeds without errors
- [ ] Lint passes without new warnings
- [ ] Current test coverage: X%

### 5.2 Post-Refactor Validation
- [ ] All existing tests pass **without modification**
- [ ] Build succeeds without errors
- [ ] Lint passes without new warnings
- [ ] Test coverage: >= X% (not decreased)
- [ ] All import paths resolve correctly
- [ ] No new TypeScript errors
- [ ] [Additional criteria based on intensity]

### 5.3 REGRESSION-VALIDATOR Checklist
- [ ] Baseline snapshot captured
- [ ] API signatures documented
- [ ] Import graph analyzed
- [ ] Post-refactor comparison complete
- [ ] Verdict: [PASS | CONDITIONAL_PASS | FAIL]

---

## 6. Rollback Plan

### 6.1 Git Rollback
```bash
# If issues discovered after merge:
git revert [commit-hash]
```

### 6.2 Manual Rollback Steps
1. [Step 1 if git revert is insufficient]
2. [Step 2]

---

## 7. Sign-off

| Role | Status | Date |
|------|--------|------|
| LEAD Approval | [ ] Approved | |
| Pre-refactor baseline | [ ] Captured | |
| Post-refactor validation | [ ] Passed | |
| REGRESSION Verdict | [ ] PASS | |

---

*This Refactor Brief was generated for LEO Protocol v4.3.3*
*Template version: 1.0.0*',
  200,  -- order_index after other templates
  jsonb_build_object(
    'template_type', 'refactor_brief',
    'version', '1.0.0',
    'applies_to_sd_type', 'refactor',
    'intensity_levels', ARRAY['cosmetic', 'structural'],
    'replaces_prd_for', ARRAY['cosmetic', 'structural'],
    'full_prd_required_for', ARRAY['architectural'],
    'related_tables', ARRAY['product_requirements_v2', 'strategic_directives_v2'],
    'validation_gates', ARRAY['REGRESSION_VALIDATION', 'E2E_TESTING'],
    'generator_script', 'scripts/create-refactor-brief.js'
  )
)
ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- ============================================================================
-- ADD document_type TO product_requirements_v2 IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_requirements_v2'
    AND column_name = 'document_type'
  ) THEN
    ALTER TABLE product_requirements_v2
    ADD COLUMN document_type VARCHAR(50) DEFAULT 'prd'
    CHECK (document_type IN ('prd', 'refactor_brief', 'architecture_decision_record'));

    COMMENT ON COLUMN product_requirements_v2.document_type IS
    'Type of requirements document:
      - prd: Full Product Requirements Document (default)
      - refactor_brief: Lightweight refactoring documentation
      - architecture_decision_record: ADR for architectural decisions';
  END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTION: Get Refactor Brief Template
-- ============================================================================

CREATE OR REPLACE FUNCTION get_refactor_brief_template()
RETURNS TEXT AS $$
DECLARE
  template_content TEXT;
BEGIN
  SELECT content INTO template_content
  FROM leo_protocol_sections
  WHERE section_type = 'template'
    AND title = 'Refactor Brief Template'
  ORDER BY protocol_id DESC
  LIMIT 1;

  RETURN template_content;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_refactor_brief_template IS
'Returns the current Refactor Brief template content for use by generator scripts.';

-- ============================================================================
-- HELPER FUNCTION: Check Document Type Required
-- ============================================================================

CREATE OR REPLACE FUNCTION get_required_document_type(sd_id_param VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  sd RECORD;
BEGIN
  SELECT sd_type, intensity_level INTO sd
  FROM strategic_directives_v2
  WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN 'prd';  -- Default
  END IF;

  -- Refactoring SDs use document type based on intensity
  IF sd.sd_type = 'refactor' THEN
    CASE sd.intensity_level
      WHEN 'cosmetic' THEN RETURN 'refactor_brief';
      WHEN 'structural' THEN RETURN 'refactor_brief';
      WHEN 'architectural' THEN RETURN 'prd';  -- Full PRD + ADR
      ELSE RETURN 'refactor_brief';  -- Default for refactor
    END CASE;
  END IF;

  -- All other SD types use PRD
  RETURN 'prd';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_required_document_type IS
'Returns the required document type for an SD based on type and intensity.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

COMMIT;

DO $$
DECLARE
  template_exists BOOLEAN;
  doc_type_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM leo_protocol_sections
    WHERE section_type = 'template'
    AND title = 'Refactor Brief Template'
  ) INTO template_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_requirements_v2'
    AND column_name = 'document_type'
  ) INTO doc_type_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Refactor Brief Template Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Template added: %', template_exists;
  RAISE NOTICE 'document_type column exists: %', doc_type_exists;
  RAISE NOTICE '';
  RAISE NOTICE 'Refactor Brief sections:';
  RAISE NOTICE '  1. Current State (code location, implementation, code smell)';
  RAISE NOTICE '  2. Desired State (proposed structure, key changes, benefits)';
  RAISE NOTICE '  3. Files Affected (table with risk levels)';
  RAISE NOTICE '  4. Risk Zones (dependency, API, test risks)';
  RAISE NOTICE '  5. Verification Criteria (pre/post validation)';
  RAISE NOTICE '  6. Rollback Plan';
  RAISE NOTICE '  7. Sign-off';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  -- Get template:';
  RAISE NOTICE '  SELECT get_refactor_brief_template();';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Check required document type for SD:';
  RAISE NOTICE '  SELECT get_required_document_type(''SD-XXX'');';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Generate brief:';
  RAISE NOTICE '  node scripts/create-refactor-brief.js SD-XXX';
  RAISE NOTICE '============================================================';
END $$;
