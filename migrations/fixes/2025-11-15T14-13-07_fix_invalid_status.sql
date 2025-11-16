-- Fix Invalid Status Values
-- Generated: 2025-11-15T14:13:07.035Z

-- Strategic Directives: Normalize invalid statuses to draft
UPDATE strategic_directives_v2
SET status = 'draft'
WHERE status NOT IN ('draft', 'active', 'in_progress', 'on_hold', 'completed', 'archived', 'cancelled');

-- Product Requirements: Normalize invalid statuses to draft
UPDATE product_requirements_v2
SET status = 'draft'
WHERE status NOT IN ('draft', 'in_review', 'approved', 'active', 'completed', 'archived');

-- User Stories: Normalize invalid statuses to draft
UPDATE user_stories
SET status = 'draft'
WHERE status NOT IN ('draft', 'ready', 'in_progress', 'implemented', 'verified', 'archived');