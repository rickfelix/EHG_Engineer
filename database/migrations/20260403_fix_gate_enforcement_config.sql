-- SD-LEO-FIX-FIX-STAGE-VENTURE-001: Configure full gate enforcement
-- Updates hard_gate_stages to match CHAIRMAN_GATES.BLOCKING and enables all taste gates

-- Fix 5: Update hard_gate_stages to full blocking set
UPDATE chairman_dashboard_config
SET hard_gate_stages = ARRAY[3, 5, 10, 13, 17, 18, 19, 23, 24, 25]
WHERE config_key = 'default';

-- Fix 6: Enable all 3 taste gates
UPDATE chairman_dashboard_config
SET taste_gate_config = taste_gate_config || '{"s10_enabled": true, "s13_enabled": true, "s16_enabled": true}'::jsonb
WHERE config_key = 'default';
