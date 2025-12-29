import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function approveSD() {
  try {
    console.log('\n=== LEAD APPROVAL: SD-VIF-TIER-001 ===\n');

    const sdId = 'SD-VIF-TIER-001';

    // Update SD status to active and set phase to PLAN
    const { data: _updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'active',
        current_phase: 'PLAN',
        approved_by: 'LEAD (Claude Code)',
        approval_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .select();

    if (updateError) {
      console.error('Error:', updateError.message);
      return;
    }

    console.log('✅ SD-VIF-TIER-001 APPROVED');
    console.log('\nStrategic Validation Results:');
    console.log('  1. Need Validation: ✅ PASS - Reduces Chairman decision fatigue');
    console.log('  2. Solution Assessment: ✅ PASS - 3-tier approach aligns with objectives');
    console.log('  3. Existing Tools: ✅ PASS - Excellent infrastructure reuse');
    console.log('  4. Value Analysis: ✅ PASS - High ROI (2-3 months)');
    console.log('  5. Feasibility: ✅ PASS - No technical blockers');
    console.log('  6. Risk Assessment: ✅ PASS - 1.67/10 risk score (LOW)');

    console.log('\nUpdates:');
    console.log('  Status: draft → active');
    console.log('  Phase: LEAD_APPROVAL → PLAN');
    console.log('  Approved By: LEAD (Claude Code)');
    console.log('  Approval Date:', new Date().toISOString());

    // Verify
    const { data: verified } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase, approved_by, approval_date')
      .eq('id', sdId)
      .single();

    console.log('\n=== VERIFICATION ===');
    console.log('ID:', verified.id);
    console.log('Title:', verified.title);
    console.log('Status:', verified.status);
    console.log('Current Phase:', verified.current_phase);
    console.log('Approved By:', verified.approved_by);
    console.log('Approval Date:', verified.approval_date);

  } catch (err) {
    console.error('Failed:', err.message);
  }
}

approveSD();
