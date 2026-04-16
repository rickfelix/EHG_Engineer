/**
 * Wiring Validation Gate for EXEC-TO-PLAN
 * SD: SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D
 *
 * Blocks EXEC-TO-PLAN when the SD opts into wiring verification but
 * strategic_directives_v2.wiring_validated is not true (either null = checks
 * missing, or false = at least one required check failed unwaived).
 *
 * **Opt-in semantics**: Gate is only active when
 *   sd.metadata.wiring_required === true
 * OR the SD's parent orchestrator has metadata.wiring_enforcement === true.
 * Otherwise the gate is advisory (passes with a warning) so legacy SDs that
 * predate the framework are not retroactively blocked.
 *
 * **Remediation text** (DESIGN sub-agent condition DC2): points back to the
 * runner (`node scripts/wiring-validators/wiring-validation-runner.js <SD>`),
 * the inspection query, and the vision document key.
 *
 * @module scripts/modules/handoff/executors/exec-to-plan/gates/wiring-validation
 */

const VISION_DOC_KEY = 'VISION-LEO-WIRING-VERIFICATION-L2-001';

/**
 * Create the WIRING_VALIDATION gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createWiringValidationGate(supabase) {
  return {
    name: 'WIRING_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🔌 WIRING VALIDATION: Cross-verifier Integration Check');
      console.log('-'.repeat(50));

      const sd = ctx.sd;
      const sdKey = sd?.sd_key || sd?.id;

      // ── Opt-in resolution ────────────────────────────────────────────────
      const selfOptIn = sd?.metadata?.wiring_required === true;
      let parentOptIn = false;
      if (!selfOptIn && sd?.parent_sd_id) {
        try {
          const { data: parent } = await supabase
            .from('strategic_directives_v2')
            .select('metadata')
            .eq('id', sd.parent_sd_id)
            .maybeSingle();
          parentOptIn = parent?.metadata?.wiring_enforcement === true;
        } catch (e) {
          // Non-blocking: if we can't read parent, treat as non-opted-in.
          console.log(`   ⚠️  Parent lookup failed (${e?.message || e}) — treating as advisory`);
        }
      }

      const optedIn = selfOptIn || parentOptIn;
      if (!optedIn) {
        console.log('   ℹ️  Not opted in (metadata.wiring_required !== true) — advisory only');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Wiring validation advisory (SD has not opted in via metadata.wiring_required)'],
        };
      }

      // ── Read derived column ──────────────────────────────────────────────
      // Trust strategic_directives_v2.wiring_validated (maintained by the
      // trg_zz_maintain_wiring_validated trigger). Do NOT re-aggregate here.
      const { data: sdRow, error: sdErr } = await supabase
        .from('strategic_directives_v2')
        .select('wiring_validated')
        .eq('sd_key', sdKey)
        .single();

      if (sdErr) {
        console.log(`   ❌ Failed to read wiring_validated: ${sdErr.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`wiring_validated column unreadable: ${sdErr.message}`],
          warnings: [],
          remediation: buildRemediation(sdKey, 'db_read_failure'),
        };
      }

      const wiringValidated = sdRow?.wiring_validated;

      // ── Also fetch per-check breakdown for remediation text ─────────────
      const { data: checks } = await supabase
        .from('leo_wiring_validations')
        .select('check_type, status, signals_detected, waived_by')
        .eq('sd_key', sdKey)
        .order('check_type');

      const issues = [];
      const warnings = [];
      const checkCount = checks?.length || 0;
      const failed = (checks || []).filter(c => c.status === 'failed' && !c.waived_by);
      const warned = (checks || []).filter(c => c.status === 'warning');

      if (wiringValidated === true) {
        console.log(`   ✅ wiring_validated=true (${checkCount} check rows, ${warned.length} warnings)`);
        warned.forEach(c => warnings.push(`${c.check_type} returned warning (signals=${c.signals_detected})`));
        return { passed: true, score: 100, max_score: 100, issues, warnings };
      }

      if (wiringValidated === false) {
        console.log(`   ❌ wiring_validated=false — ${failed.length} failed check(s)`);
        failed.forEach(c => {
          console.log(`     • ${c.check_type}: failed (signals_detected=${c.signals_detected})`);
          issues.push(`Wiring check ${c.check_type} failed with ${c.signals_detected} signal(s)`);
        });
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues,
          warnings,
          remediation: buildRemediation(sdKey, 'checks_failed', failed),
        };
      }

      // null — checks missing.
      console.log(`   ❌ wiring_validated=null — required checks not yet run (${checkCount} present)`);
      issues.push(`Wiring checks incomplete for ${sdKey} — required checks missing or pending`);
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues,
        warnings,
        remediation: buildRemediation(sdKey, 'checks_missing'),
      };
    },
  };
}

/**
 * Build remediation text per DESIGN sub-agent condition DC2:
 * must cite the re-run command, the inspection query, and the vision doc.
 */
function buildRemediation(sdKey, kind, failedChecks = []) {
  const runCmd = `node scripts/wiring-validators/wiring-validation-runner.js ${sdKey}`;
  const inspectSql =
    `SELECT check_type, status, signals_detected, waived_by, waive_reason ` +
    `FROM leo_wiring_validations WHERE sd_key = '${sdKey}';`;
  const bypass = `node scripts/handoff.js execute EXEC-TO-PLAN ${sdKey} --bypass-wiring --bypass-reason "<justification>"`;
  const waive = `SELECT waive_wiring_check('${sdKey}', '<check_type>', '<reason>');`;

  const lines = [];
  if (kind === 'checks_missing') {
    lines.push(`Run the wiring validation runner to populate check results:`);
    lines.push(`  ${runCmd}`);
  } else if (kind === 'checks_failed') {
    lines.push(`Re-run the wiring validator(s) after fixing the signals detected:`);
    lines.push(`  ${runCmd}`);
    if (failedChecks.length > 0) {
      lines.push(`Failing check(s): ${failedChecks.map(c => c.check_type).join(', ')}`);
    }
    lines.push(`If a failing check is a known false positive, file a per-check waiver:`);
    lines.push(`  ${waive}`);
  } else {
    lines.push(`Diagnose the wiring_validated read failure; then:`);
    lines.push(`  ${runCmd}`);
  }
  lines.push(`Inspect current state:`);
  lines.push(`  ${inspectSql}`);
  lines.push(`If you must proceed despite failures, use --bypass-wiring (rate-limited, audited):`);
  lines.push(`  ${bypass}`);
  lines.push(`Framework context: vision document ${VISION_DOC_KEY}.`);
  return lines.join('\n');
}
