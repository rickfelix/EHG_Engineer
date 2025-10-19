-- Ensure user_company_access has required columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_company_access' AND column_name = 'role'
  ) THEN
    ALTER TABLE user_company_access
      ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','editor','viewer'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_company_access' AND column_name = 'access_level'
  ) THEN
    ALTER TABLE user_company_access
      ADD COLUMN access_level VARCHAR(50) DEFAULT 'standard' CHECK (access_level IN ('full','standard','limited','read_only'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_company_access' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE user_company_access
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_company_access' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE user_company_access
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
  END IF;
END $$;

-- Create index on role if missing
CREATE INDEX IF NOT EXISTS idx_user_company_access_role ON user_company_access(role);
CREATE INDEX IF NOT EXISTS idx_user_company_access_user ON user_company_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_company_access_company ON user_company_access(company_id);
CREATE INDEX IF NOT EXISTS idx_user_company_access_active ON user_company_access(is_active);

-- Enable RLS if not already
ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;

-- Basic SELECT policy if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_company_access' AND policyname = 'Users can view their own access records'
  ) THEN
    CREATE POLICY "Users can view their own access records" ON user_company_access
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;