-- Database Optimization Script
-- Generated: 2025-09-03T13:29:54.911Z
-- Score: 69/100

-- Missing Indexes
CREATE INDEX idx_status ON table_name(status);
CREATE INDEX idx_user_id ON table_name(user_id);

-- Schema Fixes

-- Row Level Security
Enable RLS: ALTER TABLE strategic_directives_v2 ENABLE ROW LEVEL SECURITY;
Enable RLS: ALTER TABLE product_requirements_v2 ENABLE ROW LEVEL SECURITY;

