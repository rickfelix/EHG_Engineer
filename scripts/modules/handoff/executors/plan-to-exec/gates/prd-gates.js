/**
 * PRD-Related Gates
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * GATE_PRD_EXISTS: Ensures PRD exists and is approved (SD-LEARN-008)
 * GATE_ARCHITECTURE_VERIFICATION: Prevents architecture mismatches (SD-BACKEND-002A)
 */

/**
 * Create the GATE_PRD_EXISTS gate validator
 *
 * @param {Object} prdRepo - PRD repository instance
 * @returns {Object} Gate configuration
 */
export function createPrdExistsGate(prdRepo) {
  return {
    name: 'GATE_PRD_EXISTS',
    validator: async (ctx) => {
      console.log('\n📋 GATE: PRD Existence Check');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEARN-008 (prevent undocumented EXEC)');

      try {
        // RCA-PRD-FRICTION: Check validation profile for sd_type exemption
        // UAT, documentation, and infrastructure SDs may not require PRDs
        const sdType = ctx.sd?.sd_type || 'feature';
        if (ctx.supabase) {
          const { data: profile } = await ctx.supabase
            .from('sd_type_validation_profiles')
            .select('requires_prd')
            .eq('sd_type', sdType)
            .maybeSingle();

          if (profile && profile.requires_prd === false) {
            console.log(`   ✅ PRD not required for sd_type='${sdType}' (validation profile)`);
            return {
              passed: true,
              score: 100,
              max_score: 100,
              issues: [],
              warnings: [`PRD exempted for sd_type='${sdType}' per validation profile`],
              details: { exemption_reason: 'validation_profile_requires_prd_false', sd_type: sdType }
            };
          }
        }

        // Get PRD for this SD
        const sdUuid = ctx.sd?.id || ctx.sdId;
        const prd = await prdRepo?.getBySdId(sdUuid);

        // SD-LEARN-010:US-003: ERR_NO_PRD error code when PRD missing
        if (!prd) {
          console.log('   ❌ ERR_NO_PRD: No PRD found for this SD');
          console.log('');
          console.log('   PLAN-TO-EXEC requires a PRD to ensure:');
          console.log('   • Requirements are documented');
          console.log('   • Acceptance criteria exist');
          console.log('   • Implementation can be validated');

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              'ERR_NO_PRD: No PRD found for this SD - create PRD before proceeding to EXEC',
              'PRD is mandatory before EXEC phase can begin'
            ],
            warnings: [],
            remediation: [
              'Create a PRD for this SD using:',
              '  node scripts/add-prd-to-database.js --sd-id <SD-ID>',
              'Or use the PRD creation wizard in the UI',
              'Ensure PRD status is set to "approved" before retrying'
            ].join('\n')
          };
        }

        // Check PRD status
        const validStatuses = ['approved', 'ready_for_exec', 'in_progress'];
        if (!validStatuses.includes(prd.status)) {
          console.log(`   ⚠️  PRD exists but status is '${prd.status}'`);
          console.log('   ❌ PRD must be approved before EXEC phase');

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `BLOCKING: PRD status is '${prd.status}', expected one of: ${validStatuses.join(', ')}`,
              'PRD must be approved before implementation can begin'
            ],
            warnings: [],
            remediation: [
              `Update PRD status from '${prd.status}' to 'approved'`,
              'Complete any required PRD review steps',
              'Then retry this handoff'
            ].join('\n')
          };
        }

        console.log('   ✅ PRD exists and is approved');
        console.log(`      PRD ID: ${prd.id}`);
        console.log(`      Title: ${prd.title}`);
        console.log(`      Status: ${prd.status}`);

        // Store PRD for later gates
        ctx._prd = prd;

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            prd_id: prd.id,
            prd_title: prd.title,
            prd_status: prd.status
          }
        };

      } catch (error) {
        console.log(`   ⚠️  PRD check error: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`PRD check failed: ${error.message}`],
          warnings: [],
          remediation: 'Check database connectivity and PRD table access'
        };
      }
    },
    required: true
  };
}

/**
 * Create the GATE_ARCHITECTURE_VERIFICATION gate validator
 * Catastrophic Prevention from SD-BACKEND-002A Lesson
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Function} determineTargetRepository - Function to determine target repo
 * @returns {Object} Gate configuration
 */
export function createArchitectureVerificationGate(prdRepo, determineTargetRepository) {
  return {
    name: 'GATE_ARCHITECTURE_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🏗️  GATE: Architecture Verification (Catastrophic Prevention)');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-BACKEND-002A (30-52h rework prevented)');

      try {
        // Dynamically import the architecture verifier
        const { verifyArchitecture } = await import('../../../../../../scripts/verify-app-architecture.js');

        // Get the target application path
        const targetPath = ctx.options?._appPath || determineTargetRepository(ctx.sd);

        console.log(`\n   Target: ${targetPath}`);

        // Run architecture verification
        const archResult = await verifyArchitecture(targetPath);

        if (!archResult.success) {
          console.log('\n   ❌ ARCHITECTURE VERIFICATION FAILED');
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              'BLOCKING: Could not verify application architecture',
              ...archResult.errors
            ],
            warnings: archResult.warnings,
            remediation: [
              'Verify the target application path exists and contains package.json',
              'Run: node scripts/verify-app-architecture.js --app-path <path>',
              'Ensure PRD specifies correct target_application'
            ].join('\n')
          };
        }

        // Store architecture info for later use in EXEC phase
        ctx._architectureProfile = archResult;

        // Check for critical warnings that should block (Vite SPA with API route intentions)
        const prd = await prdRepo?.getBySdId(ctx.sd?.id);
        const prdContent = prd?.implementation_details || prd?.technical_approach || '';
        const hasApiRouteIntention = /api.route|NextRequest|NextResponse|pages\/api|app\/api/i.test(prdContent);

        if (archResult.framework === 'VITE_SPA' && hasApiRouteIntention) {
          console.log('\n   🚨 CRITICAL MISMATCH DETECTED');
          console.log('      PRD mentions API routes but target is Vite SPA!');
          console.log('      This is EXACTLY what caused SD-BACKEND-002A failure.');

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              'BLOCKING: PRD specifies API routes but target is Vite SPA',
              'This mismatch caused 30-52 hours of wasted work in SD-BACKEND-002A',
              'Vite SPAs use Supabase client directly, NOT API routes'
            ],
            warnings: archResult.warnings,
            remediation: [
              'STOP: Do not proceed with implementation',
              'UPDATE PRD: Remove API route references',
              'USE: Supabase client calls directly from React components',
              'PATTERN: src/lib/supabase.ts → createClient → direct queries'
            ].join('\n'),
            details: {
              detectedFramework: archResult.framework,
              intendedApproach: 'API Routes',
              conflict: 'Vite SPA cannot use Next.js API routes'
            }
          };
        }

        // Success - architecture verified
        console.log('\n   ✅ Architecture verified successfully');
        console.log(`      Framework: ${archResult.framework}`);
        console.log(`      API Mechanism: ${archResult.apiMechanism}`);
        console.log(`      Build Tool: ${archResult.buildTool}`);

        if (archResult.warnings.length > 0) {
          console.log('\n   ⚠️  Warnings (non-blocking):');
          archResult.warnings.forEach(w => console.log(`      • ${w}`));
        }

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: archResult.warnings,
          details: {
            framework: archResult.framework,
            apiMechanism: archResult.apiMechanism,
            buildTool: archResult.buildTool,
            profile: archResult.profile?.description
          }
        };

      } catch (error) {
        console.log(`\n   ⚠️  Architecture verification error: ${error.message}`);

        // Non-blocking on script errors - allow manual override
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [
            `Architecture verification script error: ${error.message}`,
            'Proceeding with manual verification recommended'
          ],
          details: { error: error.message }
        };
      }
    },
    required: true
  };
}
