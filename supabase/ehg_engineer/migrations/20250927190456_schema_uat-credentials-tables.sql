-- UAT Credentials Storage Tables
-- Secure storage for test credentials

-- Table for storing encrypted test credentials
CREATE TABLE IF NOT EXISTS uat_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  environment VARCHAR(50) NOT NULL UNIQUE,
  credentials JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for tracking test users created in EHG
CREATE TABLE IF NOT EXISTS uat_test_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password TEXT NOT NULL, -- Encrypted
  type VARCHAR(50) DEFAULT 'uat_test_user',
  metadata JSONB DEFAULT '{}',
  last_used TIMESTAMPTZ,
  rotation_due TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for credential rotation history
CREATE TABLE IF NOT EXISTS uat_credential_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  environment VARCHAR(50) NOT NULL,
  old_credentials JSONB,
  new_credentials JSONB,
  reason VARCHAR(255),
  rotated_by VARCHAR(255),
  rotated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_uat_credentials_environment ON uat_credentials(environment);
CREATE INDEX idx_uat_test_users_email ON uat_test_users(email);
CREATE INDEX idx_uat_test_users_type ON uat_test_users(type);
CREATE INDEX idx_uat_credential_history_environment ON uat_credential_history(environment);
CREATE INDEX idx_uat_credential_history_rotated_at ON uat_credential_history(rotated_at);

-- Row Level Security
ALTER TABLE uat_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_test_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_credential_history ENABLE ROW LEVEL SECURITY;

-- Policies (adjust as needed based on your authentication setup)
CREATE POLICY "Service role can manage credentials" ON uat_credentials
  FOR ALL USING (true);

CREATE POLICY "Service role can manage test users" ON uat_test_users
  FOR ALL USING (true);

CREATE POLICY "Service role can view history" ON uat_credential_history
  FOR SELECT USING (true);

-- Comments
COMMENT ON TABLE uat_credentials IS 'Stores encrypted test credentials for UAT environments';
COMMENT ON TABLE uat_test_users IS 'Tracks test users created in EHG for UAT testing';
COMMENT ON TABLE uat_credential_history IS 'Audit trail for credential rotations';

-- Initial data
INSERT INTO uat_credentials (environment, credentials)
VALUES
  ('development', '{"email": "test@ehg.test", "password": "[ENCRYPTED]", "admin_email": "admin@ehg.test", "admin_password": "[ENCRYPTED]"}'),
  ('staging', '{"email": "staging_test@ehg.test", "password": "[ENCRYPTED]", "admin_email": "staging_admin@ehg.test", "admin_password": "[ENCRYPTED]"}')
ON CONFLICT (environment) DO NOTHING;