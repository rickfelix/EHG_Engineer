/**
 * PRD Script Auto-Generation for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Automatically generates a PRD creation script when LEAD approves an SD.
 * This integration ensures PRD scripts are created immediately after approval.
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Auto-generate and execute PRD script on LEAD→PLAN handoff
 *
 * @param {string} sdId - SD ID
 * @param {Object} sd - Strategic Directive
 */
export async function autoGeneratePRDScript(sdId, sd) {
  try {
    console.log('\n🤖 AUTO-GENERATING PRD SCRIPT');
    console.log('='.repeat(70));

    console.log(`   SD: ${sd.title || sdId}`);

    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-prd-script.js');
    const title = sd.title || 'Technical Implementation';

    console.log(`   Running: node scripts/generate-prd-script.js ${sdId} "${title}"`);

    try {
      const output = execSync(
        `node "${scriptPath}" ${sdId} "${title}"`,
        { encoding: 'utf-8', cwd: process.cwd() }
      );

      console.log('\n' + output);
      console.log('✅ PRD script auto-generated successfully!');

      // Gap #3 Fix (2026-01-01): Auto-execute the generated PRD script
      const prdScriptPath = path.join(process.cwd(), 'scripts', `create-prd-${sdId.toLowerCase()}.js`);

      console.log('');
      console.log('📄 AUTO-EXECUTING PRD SCRIPT...');
      console.log(`   Running: node ${prdScriptPath}`);
      console.log('');

      try {
        const prdOutput = execSync(
          `node "${prdScriptPath}"`,
          { encoding: 'utf-8', cwd: process.cwd(), timeout: 120000 }
        );
        console.log(prdOutput);
        console.log('✅ PRD created and sub-agents invoked successfully!');
      } catch (prdExecError) {
        console.log(`   ⚠️  PRD script execution failed: ${prdExecError.message}`);
        console.log('');
        console.log('📝 MANUAL STEPS (if needed):');
        console.log(`   1. Edit: scripts/create-prd-${sdId.toLowerCase()}.js`);
        console.log('      - Update TODO sections');
        console.log('      - Add requirements, architecture, test scenarios');
        console.log('');
        console.log(`   2. Run: node scripts/create-prd-${sdId.toLowerCase()}.js`);
        console.log('      - Creates PRD in database');
        console.log('      - Validates schema automatically');
        console.log('      - Triggers sub-agents');
      }
      console.log('');

    } catch (execError) {
      if (execError.message.includes('already exists')) {
        console.log('   ℹ️  PRD script already exists - skipping generation');
        // Gap #3 Fix: Even if script exists, try to execute it
        const prdScriptPath = path.join(process.cwd(), 'scripts', `create-prd-${sdId.toLowerCase()}.js`);
        console.log('   📄 Attempting to execute existing PRD script...');
        try {
          execSync(`node "${prdScriptPath}"`, { encoding: 'utf-8', cwd: process.cwd(), timeout: 120000 });
          console.log('   ✅ Existing PRD script executed successfully');
        } catch (existingError) {
          console.log(`   ⚠️  Existing script execution failed: ${existingError.message}`);
        }
      } else {
        console.log(`   ⚠️  Generation failed: ${execError.message}`);
        console.log('   You can manually run: npm run prd:new ' + sdId);
      }
    }

  } catch (error) {
    console.log('\n⚠️  Auto-generation error:', error.message);
    console.log('   PRD script can be generated manually:');
    console.log(`   npm run prd:new ${sdId}`);
  }
}
