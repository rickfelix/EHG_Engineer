-- Migration: Fix e-commerce archetype to use underscore (canonical format)
-- SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001
-- RCA: PAT-TAXONOMY-COLLISION-001
-- Purpose: Align design_reference_library.archetype_category with canonical ARCHETYPES list

-- Fix hyphenated value to underscore (matches stage-01-constants.js)
UPDATE design_reference_library
SET archetype_category = 'e_commerce'
WHERE archetype_category = 'e-commerce';

-- Map 'portfolio' and 'corporate' to nearest canonical archetypes
-- portfolio → creator_tools (creative/design focus)
-- corporate → services (enterprise/B2B focus)
UPDATE design_reference_library
SET archetype_category = 'creator_tools'
WHERE archetype_category = 'portfolio';

UPDATE design_reference_library
SET archetype_category = 'services'
WHERE archetype_category = 'corporate';

-- Update the CHECK constraint to use canonical values
ALTER TABLE design_reference_library
DROP CONSTRAINT IF EXISTS design_reference_library_archetype_category_check;

ALTER TABLE design_reference_library
ADD CONSTRAINT design_reference_library_archetype_category_check
CHECK (archetype_category IN ('saas', 'marketplace', 'ai_product', 'e_commerce', 'fintech', 'healthtech', 'edtech', 'media', 'creator_tools', 'services', 'deeptech', 'real_estate'));

-- Rollback:
-- UPDATE design_reference_library SET archetype_category = 'e-commerce' WHERE archetype_category = 'e_commerce';
-- UPDATE design_reference_library SET archetype_category = 'portfolio' WHERE archetype_category = 'creator_tools' AND url IN (SELECT url FROM design_reference_library WHERE archetype_category = 'creator_tools');
-- UPDATE design_reference_library SET archetype_category = 'corporate' WHERE archetype_category = 'services';
