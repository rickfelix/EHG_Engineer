-- Database Optimization Script
-- Generated: 2025-09-04T01:33:08.051Z
-- Score: 0/100

-- Missing Indexes
CREATE INDEX idx_status ON table_name(status);
CREATE INDEX idx_user_id ON table_name(user_id);

-- Schema Fixes

-- Row Level Security
Enable RLS: ALTER TABLE strategic_directives_v2 ENABLE ROW LEVEL SECURITY;
Enable RLS: ALTER TABLE product_requirements_v2 ENABLE ROW LEVEL SECURITY;

