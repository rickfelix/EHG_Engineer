-- Create Gate Rule Integrity View
-- This view validates that gate validation rules sum to exactly 1.000
-- Used by CI/CD pipeline to ensure quality gate weights are properly configured

-- Create the view
CREATE OR REPLACE VIEW v_gate_rule_integrity AS
SELECT
  gate,
  COUNT(*) as rule_count,
  ROUND(SUM(weight)::numeric, 3) AS total_weight,
  CASE
    WHEN ROUND(SUM(weight)::numeric, 3) = 1.000 THEN 'VALID'
    WHEN ROUND(SUM(weight)::numeric, 3) > 1.000 THEN 'OVER (>1.000)'
    WHEN ROUND(SUM(weight)::numeric, 3) < 1.000 THEN 'UNDER (<1.000)'
    ELSE 'ERROR'
  END AS status,
  CASE
    WHEN ROUND(SUM(weight)::numeric, 3) = 1.000 THEN '✅'
    ELSE '❌'
  END AS icon
FROM leo_validation_rules
WHERE active = true
GROUP BY gate;

-- Create helper function for CI assertions
CREATE OR REPLACE FUNCTION check_gate_weights()
RETURNS TABLE(gate text, status text, total_weight numeric) AS $$
BEGIN
  -- Check if any gate has invalid weights
  IF EXISTS (
    SELECT 1 FROM v_gate_rule_integrity
    WHERE status != 'VALID'
  ) THEN
    -- Return details of invalid gates
    RETURN QUERY
    SELECT
      v.gate::text,
      v.status::text,
      v.total_weight
    FROM v_gate_rule_integrity v
    WHERE v.status != 'VALID';

    -- Raise error for CI
    RAISE EXCEPTION 'Gate weight validation failed: % gates have invalid weights',
      (SELECT COUNT(*)
       FROM v_gate_rule_integrity v WHERE v.status != 'VALID');
  ELSE
    -- All gates valid - return success message
    RETURN QUERY
    SELECT
      'ALL_GATES'::text AS gate,
      'VALID'::text AS status,
      NULL::numeric AS total_weight;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON v_gate_rule_integrity TO anon, authenticated;
