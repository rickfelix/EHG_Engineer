/**
 * PRD Auto-Generation for LEAD-TO-PLAN
 * Part of SD-LEO-INFRA-PRD-CREATION-CONSOLIDATION-001
 *
 * Directly invokes the canonical PRD creation method (add-prd-to-database.js)
 * when LEAD approves an SD. This ensures PRDs are created with:
 * - LLM-based content generation (no TODO placeholders)
 * - Sub-agent orchestration (DESIGN, DATABASE, SECURITY, RISK)
 * - Persona ingestion and component recommendations
 *
 * CONSOLIDATION NOTE (2026-01-23):
 * Previously this called generate-prd-script.js which created template-based
 * scripts with TODO placeholders. Now calls the canonical method directly.
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Auto-create PRD directly using canonical method on LEAD→PLAN handoff
 *
 * @param {string} sdId - SD ID (can be legacy_id like SD-XXX-001 or UUID)
 * @param {Object} sd - Strategic Directive object
 */
export async function autoGeneratePRDScript(sdId, sd) {
  try {
    console.log('\n🤖 AUTO-CREATING PRD (Canonical Method)');
    console.log('='.repeat(70));

    console.log(`   SD: ${sd.title || sdId}`);
    console.log('   Method: add-prd-to-database.js (LLM-based, no TODOs)');

    // Use the canonical PRD creation script directly
    // This is the modular version that delegates to scripts/prd/index.js
    const scriptPath = path.join(process.cwd(), 'scripts', 'add-prd-to-database.js');
    const title = sd.title || 'Technical Implementation';

    // Determine the correct ID to pass (prefer UUID if available)
    const idToUse = sd.id || sdId;
    console.log(`   Running: node scripts/add-prd-to-database.js ${idToUse} "${title}"`);
    console.log('');

    try {
      const output = execSync(
        `node "${scriptPath}" ${idToUse} "${title}"`,
        { encoding: 'utf-8', cwd: process.cwd(), timeout: 180000 } // 3 min timeout for LLM generation
      );

      console.log(output);
      console.log('✅ PRD created successfully with LLM-generated content!');

    } catch (execError) {
      // Check for specific error conditions
      if (execError.message.includes('already exists')) {
        console.log('   ℹ️  PRD already exists for this SD');
        console.log('   Skipping PRD creation (existing PRD will be used)');
      } else if (execError.message.includes('not found')) {
        console.log(`   ❌ SD not found in database: ${idToUse}`);
        console.log('   Ensure SD exists before running LEAD-TO-PLAN handoff');
      } else {
        console.log(`   ⚠️  PRD creation failed: ${execError.message}`);
        console.log('');
        console.log('📝 TROUBLESHOOTING:');
        console.log('   1. Check Supabase connection (NEXT_PUBLIC_SUPABASE_URL)');
        console.log('   2. Check service role key (SUPABASE_SERVICE_ROLE_KEY)');
        console.log('   3. Check OpenAI key for LLM generation (OPENAI_API_KEY)');
        console.log('');
        console.log('📝 MANUAL FALLBACK:');
        console.log(`   node scripts/add-prd-to-database.js ${idToUse} "${title}"`);
      }
    }
    console.log('');

  } catch (error) {
    console.log('\n⚠️  Auto-creation error:', error.message);
    console.log('   PRD can be created manually:');
    console.log(`   node scripts/add-prd-to-database.js ${sdId}`);
  }
}
