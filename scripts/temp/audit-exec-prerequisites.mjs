#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function audit() {
  console.log("=== AUDIT: SDs in EXEC Phase Without Prerequisites ===\n");

  // Get all SDs in EXEC phase
  const { data: sds, error } = await supabase
    .from("strategic_directives_v2")
    .select("id, title, current_phase, sd_type, status")
    .eq("current_phase", "EXEC")
    .eq("is_active", true);

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(`Found ${sds.length} SDs in EXEC phase\n`);

  let nonCompliantCount = 0;

  for (const sd of sds) {
    // Check PRD
    const { data: prd } = await supabase
      .from("product_requirements_v2")
      .select("id")
      .or(`directive_id.eq.${sd.id},id.eq.PRD-${sd.id}`)
      .limit(1);

    // Check user stories
    const { data: stories } = await supabase
      .from("user_stories")
      .select("id")
      .eq("sd_id", sd.id);

    // Check PLAN-TO-EXEC handoff
    const { data: handoff } = await supabase
      .from("sd_phase_handoffs")
      .select("id")
      .eq("sd_id", sd.id)
      .ilike("handoff_type", "PLAN-TO-EXEC")
      .eq("status", "accepted")
      .limit(1);

    const hasPrd = prd && prd.length > 0;
    const hasStories = stories && stories.length > 0;
    const hasHandoff = handoff && handoff.length > 0;

    // Get SD type profile to check requirements
    const { data: profile } = await supabase
      .from("sd_type_validation_profiles")
      .select("requires_prd, requires_e2e_tests")
      .eq("sd_type", sd.sd_type || "feature")
      .single();

    const requiresPrd = profile?.requires_prd ?? true;
    const requiresStories = profile?.requires_e2e_tests ?? true;

    const missingPrd = requiresPrd && !hasPrd;
    const missingStories = requiresStories && !hasStories;
    const missingHandoff = !hasHandoff;

    if (missingPrd || missingStories || missingHandoff) {
      nonCompliantCount++;
      console.log(`  ${sd.id}:`);
      console.log(`    Title: ${sd.title.substring(0, 60)}...`);
      console.log(`    SD Type: ${sd.sd_type || "feature"}`);
      console.log(`    PRD: ${hasPrd ? "YES" : "MISSING"} (required: ${requiresPrd})`);
      console.log(`    Stories: ${hasStories ? "YES (" + stories.length + ")" : "MISSING"} (required: ${requiresStories})`);
      console.log(`    Handoff: ${hasHandoff ? "YES" : "MISSING"}`);
      console.log();
    }
  }

  console.log(`=== AUDIT COMPLETE ===`);
  console.log(`Total SDs in EXEC: ${sds.length}`);
  console.log(`Non-compliant: ${nonCompliantCount}`);
  console.log(`Compliant: ${sds.length - nonCompliantCount}`);
}

audit();
