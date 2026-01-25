/**
 * Bypass Handling
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001
 *
 * Handles bypass file validation:
 * - Checks for .stop-hook-bypass.json
 * - Validates explanation (min 50 chars)
 * - Validates retrospective was committed
 * - Logs bypass to audit table
 * - Cleans up bypass file after use
 *
 * @module stop-subagent-enforcement/bypass-handler
 */

import fs from 'fs';
import path from 'path';

/**
 * Check for and validate bypass file
 *
 * @param {Object} supabase - Supabase client
 * @returns {{ allowed: boolean, blocked: boolean, response?: Object }}
 */
export async function checkBypass(supabase) {
  const bypassFile = path.join(
    process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    '.stop-hook-bypass.json'
  );

  if (fs.existsSync(bypassFile) === false) {
    return { allowed: false, blocked: false };
  }

  try {
    const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

    // Validate explanation
    if (bypass.explanation === undefined || bypass.explanation.length < 50) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass explanation must be at least 50 characters',
          current_length: bypass.explanation?.length || 0
        }
      };
    }

    // Validate retrospective committed
    if (bypass.retrospective_committed !== true) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass requires retrospective entry',
          action: 'Run: node scripts/generate-retrospective.js --bypass-entry'
        }
      };
    }

    // Log bypass to audit
    try {
      await supabase.from('audit_log').insert({
        event_type: 'STOP_HOOK_BYPASS',
        severity: 'warning',
        details: {
          sd_key: bypass.sd_key,
          explanation: bypass.explanation,
          skipped_agents: bypass.skipped_agents,
          retrospective_id: bypass.retrospective_id
        }
      });
    } catch (e) {
      console.error('Failed to log bypass to audit:', e.message);
    }

    // Clean up bypass file
    fs.unlinkSync(bypassFile);

    console.error(`⚠️ Bypass allowed for ${bypass.sd_key}: ${bypass.explanation.slice(0, 80)}...`);
    return { allowed: true, blocked: false };

  } catch (e) {
    return {
      allowed: false,
      blocked: true,
      response: {
        decision: 'block',
        reason: `Invalid bypass file: ${e.message}`
      }
    };
  }
}
