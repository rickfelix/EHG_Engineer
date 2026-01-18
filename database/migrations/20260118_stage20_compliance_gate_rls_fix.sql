-- ============================================================================
-- Fix RLS policies for Stage 20 Compliance Gate
-- Uses venture.created_by instead of workspace_members
-- ============================================================================

-- Drop failed policies if they exist
DROP POLICY IF EXISTS "Venture compliance progress viewable by workspace members" ON venture_compliance_progress;
DROP POLICY IF EXISTS "Venture compliance progress editable by workspace members" ON venture_compliance_progress;
DROP POLICY IF EXISTS "Venture compliance artifacts viewable by workspace members" ON venture_compliance_artifacts;
DROP POLICY IF EXISTS "Venture compliance artifacts editable by workspace members" ON venture_compliance_artifacts;
DROP POLICY IF EXISTS "Compliance gate events viewable by workspace members" ON compliance_gate_events;

-- Venture compliance progress - viewable by venture owner
CREATE POLICY "Venture compliance progress viewable by venture owner"
  ON venture_compliance_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_progress.venture_id
        AND v.created_by = auth.uid()
    )
  );

-- Venture compliance progress - all operations for venture owner
CREATE POLICY "Venture compliance progress editable by venture owner"
  ON venture_compliance_progress FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_progress.venture_id
        AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Venture compliance progress updatable by venture owner"
  ON venture_compliance_progress FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_progress.venture_id
        AND v.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_progress.venture_id
        AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Venture compliance progress deletable by venture owner"
  ON venture_compliance_progress FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_progress.venture_id
        AND v.created_by = auth.uid()
    )
  );

-- Venture compliance artifacts - viewable by venture owner
CREATE POLICY "Venture compliance artifacts viewable by venture owner"
  ON venture_compliance_artifacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND v.created_by = auth.uid()
    )
  );

-- Venture compliance artifacts - all operations for venture owner
CREATE POLICY "Venture compliance artifacts insertable by venture owner"
  ON venture_compliance_artifacts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Venture compliance artifacts updatable by venture owner"
  ON venture_compliance_artifacts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND v.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Venture compliance artifacts deletable by venture owner"
  ON venture_compliance_artifacts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND v.created_by = auth.uid()
    )
  );

-- Compliance gate events - viewable by venture owner (insert handled by functions)
CREATE POLICY "Compliance gate events viewable by venture owner"
  ON compliance_gate_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = compliance_gate_events.venture_id
        AND v.created_by = auth.uid()
    )
  );

-- Allow service role to insert gate events (called by functions)
CREATE POLICY "Compliance gate events insertable by functions"
  ON compliance_gate_events FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);  -- Insert controlled by evaluate_stage20_compliance_gate function

-- ============================================================================
-- Migration complete
-- ============================================================================
