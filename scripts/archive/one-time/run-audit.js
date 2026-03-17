#!/usr/bin/env node
/**
 * /audit Command Entry Point
 *
 * SD-LEO-SELF-IMPROVE-001I Phase 4: Self-Audit
 *
 * Usage:
 *   node scripts/run-audit.js                    # Dry run, all SDs
 *   node scripts/run-audit.js --execute          # Execute and post to feedback
 *   node scripts/run-audit.js --scope active     # Only active SDs
 *   node scripts/run-audit.js --scope stale      # Only potentially stale SDs
 *   node scripts/run-audit.js --sd SD-XXX-001    # Single SD
 *   node scripts/run-audit.js --json             # Output JSON
 */

import { runAudit } from './modules/audit/audit-runner.js';

async function main() {
  const args = process.argv.slice(2);

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
LEO Self-Audit Command

Usage:
  node scripts/run-audit.js [options]

Options:
  --execute       Execute audit and post findings to feedback system
  --dry-run       Preview findings without posting (default)
  --scope <type>  Filter SDs: all, active, stale (default: all)
  --sd <id>       Audit a specific SD by ID
  --json          Output full JSON result

Examples:
  node scripts/run-audit.js                    # Preview all SDs
  node scripts/run-audit.js --execute          # Execute and post findings
  node scripts/run-audit.js --scope stale      # Find stale SDs
  node scripts/run-audit.js --sd SD-FEATURE-001 --json
`);
    process.exit(0);
  }

  const options = {
    mode: 'manual',
    dry_run: !args.includes('--execute'),
    scope: args.includes('--scope') ? args[args.indexOf('--scope') + 1] : 'all',
    sd_id: args.includes('--sd') ? args[args.indexOf('--sd') + 1] : undefined
  };

  try {
    const result = await runAudit(options);

    if (args.includes('--json')) {
      console.log('\n--- JSON OUTPUT ---');
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Print chairman summary
      console.log('\n--- CHAIRMAN SUMMARY ---');
      console.log(result.chairman_summary);

      // Print top findings
      if (result.findings.length > 0) {
        console.log('\n--- TOP FINDINGS ---');
        const highFindings = result.findings.filter(f => f.severity === 'high').slice(0, 5);
        for (const finding of highFindings) {
          console.log(`  [${finding.severity.toUpperCase()}] ${finding.sd_id}: ${finding.message}`);
        }
        if (result.findings.length > 5) {
          console.log(`  ... and ${result.findings.length - 5} more findings`);
        }
      }
    }

    // Exit code based on high-severity findings
    if (result.summary.findings_by_severity.high > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(2);
  }
}

main();
