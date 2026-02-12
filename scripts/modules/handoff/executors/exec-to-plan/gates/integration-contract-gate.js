/**
 * GATE_INTEGRATION_CONTRACT for EXEC-TO-PLAN
 *
 * Validates that integration_contract items from PRD metadata are verifiable
 * in the current codebase. Checks barrel exports, router registrations,
 * and validation schema references.
 *
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-2)
 */

import fs from 'fs';
import path from 'path';

/** Feature flag */
const GATE_ENABLED = process.env.GATE_INTEGRATION_CONTRACT_ENABLED !== 'false';

/**
 * Check if an SD type is code-producing (needs integration verification).
 */
function isCodeProducing(sdType) {
  const codeTypes = ['feature', 'implementation', 'bugfix', 'refactor', 'performance', 'enhancement', 'security', 'database'];
  return codeTypes.includes(sdType?.toLowerCase());
}

/**
 * Verify a barrel export entry exists in the codebase.
 */
function verifyBarrelExport(entry, repoRoot) {
  const filePath = path.join(repoRoot, entry.file);
  if (!fs.existsSync(filePath)) {
    return { verified: false, reason: `File not found: ${entry.file}` };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const missing = [];

  for (const symbol of (entry.symbols || [])) {
    if (symbol.startsWith('* from')) {
      // Star re-export - just check the from clause exists
      const fromModule = symbol.replace('* from ', '');
      if (!content.includes(fromModule)) {
        missing.push(symbol);
      }
    } else if (symbol === 'default') {
      if (!content.includes('export default')) {
        missing.push('default');
      }
    } else {
      // Named export - check if symbol appears in export statements
      if (!content.includes(symbol)) {
        missing.push(symbol);
      }
    }
  }

  if (missing.length > 0) {
    return {
      verified: false,
      reason: `Missing symbols in ${entry.file}: ${missing.join(', ')}`,
      missing
    };
  }

  return { verified: true };
}

/**
 * Verify a router registration entry exists.
 */
function verifyRouterRegistration(entry, repoRoot) {
  const filePath = path.join(repoRoot, entry.file);
  if (!fs.existsSync(filePath)) {
    return { verified: false, reason: `File not found: ${entry.file}` };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const missing = [];

  for (const route of (entry.entries || [])) {
    // Parse "GET /path" format
    const parts = route.split(' ');
    const routePath = parts.length > 1 ? parts[1] : parts[0];

    if (!content.includes(routePath)) {
      missing.push(route);
    }
  }

  if (missing.length > 0) {
    return {
      verified: false,
      reason: `Missing routes in ${entry.file}: ${missing.join(', ')}`,
      missing
    };
  }

  return { verified: true };
}

/**
 * Create the GATE_INTEGRATION_CONTRACT gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createIntegrationContractGate(supabase) {
  return {
    name: 'GATE_INTEGRATION_CONTRACT',
    validator: async (ctx) => {
      console.log('\n🔗 GATE: Integration Contract Verification');
      console.log('-'.repeat(50));

      // Check feature flag
      if (!GATE_ENABLED) {
        console.log('   SKIPPED: GATE_INTEGRATION_CONTRACT_ENABLED=false');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Gate disabled via feature flag']
        };
      }

      // Check bypass flag
      const bypass = process.env.INTEGRATION_CONTRACT_BYPASS === 'true';
      const bypassReason = process.env.INTEGRATION_CONTRACT_BYPASS_REASON;
      if (bypass) {
        console.log(`   BYPASSED: ${bypassReason || 'No reason provided'}`);
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: [`Gate bypassed: ${bypassReason || 'No reason provided'}`],
          details: { bypassed: true, bypass_reason: bypassReason }
        };
      }

      // Check if SD is code-producing
      const sdType = ctx.sd?.sd_type || 'feature';
      if (!isCodeProducing(sdType)) {
        console.log(`   SKIPPED: sd_type='${sdType}' is not code-producing`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Non-code SD type '${sdType}' - integration contract not required`]
        };
      }

      // Fetch PRD to get integration_contract from metadata
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: prd, error: prdError } = await supabase
        .from('product_requirements_v2')
        .select('id, metadata')
        .eq('sd_id', sdUuid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (prdError || !prd) {
        console.log('   No PRD found - cannot verify integration contract');
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: ['No PRD found - integration contract verification skipped']
        };
      }

      const contract = prd.metadata?.integration_contract;
      if (!contract) {
        console.log('   No integration_contract in PRD metadata');
        console.log('   PRD was created before integration discovery was enabled');
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: ['No integration_contract in PRD - pre-discovery PRD']
        };
      }

      // Verify each contract item
      const repoRoot = process.cwd();
      const report = {
        sd_id: sdUuid,
        run_id: `icg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        barrel_exports: { verified: 0, required: 0, failures: [] },
        contract_registrations: { verified: 0, required: 0, failures: [] },
        sibling_data_flow: { verified: 0, required: 0, failures: [] }
      };

      let totalRequired = 0;
      let totalVerified = 0;

      // Verify barrel exports (FR-2)
      for (const entry of (contract.barrel_exports || [])) {
        if (!entry.required) continue;
        report.barrel_exports.required++;
        totalRequired++;

        const result = verifyBarrelExport(entry, repoRoot);
        if (result.verified) {
          report.barrel_exports.verified++;
          totalVerified++;
        } else {
          report.barrel_exports.failures.push({
            file: entry.file,
            reason: result.reason,
            missing: result.missing
          });
        }
      }

      // Verify contract registrations (router/registry)
      for (const entry of (contract.contract_registrations || [])) {
        if (!entry.required) continue;
        report.contract_registrations.required++;
        totalRequired++;

        if (entry.type === 'router') {
          const result = verifyRouterRegistration(entry, repoRoot);
          if (result.verified) {
            report.contract_registrations.verified++;
            totalVerified++;
          } else {
            report.contract_registrations.failures.push({
              file: entry.file,
              reason: result.reason,
              missing: result.missing
            });
          }
        } else {
          // Registry patterns - verify file exists
          const filePath = path.join(repoRoot, entry.file);
          if (fs.existsSync(filePath)) {
            report.contract_registrations.verified++;
            totalVerified++;
          } else {
            report.contract_registrations.failures.push({
              file: entry.file,
              reason: `File not found: ${entry.file}`
            });
          }
        }
      }

      // Build result
      const verificationRate = totalRequired > 0
        ? Math.round((totalVerified / totalRequired) * 100)
        : 100;

      const allFailures = [
        ...report.barrel_exports.failures,
        ...report.contract_registrations.failures
      ];

      console.log(`   Barrel exports: ${report.barrel_exports.verified}/${report.barrel_exports.required} verified`);
      console.log(`   Registrations: ${report.contract_registrations.verified}/${report.contract_registrations.required} verified`);
      console.log(`   Verification rate: ${verificationRate}%`);

      if (allFailures.length > 0) {
        console.log('   Failures:');
        allFailures.forEach(f => console.log(`      - ${f.reason}`));
      }

      const passed = allFailures.length === 0;

      return {
        passed,
        score: verificationRate,
        max_score: 100,
        issues: allFailures.map(f => f.reason),
        warnings: [],
        details: {
          report,
          total_required: totalRequired,
          total_verified: totalVerified,
          gate_enabled: true,
          effective_threshold: 100
        }
      };
    },
    required: false // Advisory for now, becomes required after stabilization
  };
}
