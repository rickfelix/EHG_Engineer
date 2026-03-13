#!/usr/bin/env node
/**
 * Codebase Health Scan Orchestrator
 * SD: SD-LEO-INFRA-DEAD-CODE-SCANNER-001
 *
 * Main entry point for running health dimension scanners.
 * Supports: --dry-run, --dimension <name>, --report, --json
 *
 * Usage:
 *   npm run health:scan          # Full scan, store results
 *   npm run health:dry           # Dry run (no SD generation)
 *   npm run health:report        # Show latest report
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import { loadConfig, evaluateThreshold, getConsecutiveBreaches, supabase } from './health-config.mjs';
import { scan as scanDeadCode } from './dead-code-scanner.mjs';
import { scan as scanCoverage } from './coverage-trend-tracker.mjs';
import { scan as scanComplexity } from './complexity-scorer.mjs';

dotenv.config();

const DIMENSION_SCANNERS = {
  dead_code: scanDeadCode,
  coverage_trend: scanCoverage,
  complexity: scanComplexity
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('--dry');
  const isReport = args.includes('--report');
  const isJson = args.includes('--json');
  const dimensionFilter = args.includes('--dimension')
    ? args[args.indexOf('--dimension') + 1]
    : null;

  if (isReport) {
    await showReport(isJson);
    return;
  }

  const rootDir = resolve(process.cwd());
  console.log(`\n🔍 Codebase Health Scan${isDryRun ? ' (DRY RUN)' : ''}`);
  console.log(`   Root: ${rootDir}`);
  console.log('─'.repeat(60));

  // Load enabled dimension configs
  const configs = await loadConfig();
  const enabledConfigs = Array.isArray(configs) ? configs : [configs];
  const results = [];

  for (const config of enabledConfigs) {
    if (dimensionFilter && config.dimension !== dimensionFilter) continue;

    const scanner = DIMENSION_SCANNERS[config.dimension];
    if (!scanner) {
      console.log(`   ⚠️  No scanner for dimension: ${config.dimension}`);
      continue;
    }

    console.log(`\n📊 Scanning: ${config.dimension}`);
    const result = await scanner(rootDir, { config });
    const threshold = evaluateThreshold(result.score, config);
    const breaches = threshold.breached
      ? await getConsecutiveBreaches(config.dimension, config)
      : 0;

    // Determine trend direction from previous snapshots
    const trend = await determineTrend(config.dimension, result.score);

    results.push({
      dimension: config.dimension,
      score: result.score,
      threshold,
      breaches: breaches + (threshold.breached ? 1 : 0), // include current
      trend,
      findings: result.findings,
      finding_count: result.finding_count,
      metadata: result.metadata,
      config
    });

    // Display results
    const icon = threshold.level === 'critical' ? '🔴' : threshold.level === 'warning' ? '🟡' : '🟢';
    console.log(`   ${icon} Score: ${result.score}/100 (${threshold.level})`);
    console.log(`   📈 Trend: ${trend}`);
    console.log(`   📋 Findings: ${result.finding_count}`);

    if (result.findings.length > 0 && !isJson) {
      const grouped = groupByStrategy(result.findings);
      for (const [strategy, items] of Object.entries(grouped)) {
        console.log(`      ${strategy}: ${items.length} items`);
        items.slice(0, 5).forEach(f => console.log(`        - ${f.file}`));
        if (items.length > 5) console.log(`        ... and ${items.length - 5} more`);
      }
    }
  }

  // Store snapshots (even in dry-run for trending)
  for (const result of results) {
    const { error } = await supabase.from('codebase_health_snapshots').insert({
      dimension: result.dimension,
      score: result.score,
      trend_direction: result.trend,
      findings: result.findings.slice(0, 100), // cap at 100 findings per snapshot
      finding_count: result.finding_count,
      metadata: {
        ...result.metadata,
        dry_run: isDryRun,
        threshold_level: result.threshold.level,
        consecutive_breaches: result.breaches
      },
      target_application: 'EHG_Engineer'
    });

    if (error) {
      console.error(`   ❌ Failed to store snapshot for ${result.dimension}: ${error.message}`);
    } else {
      console.log(`   ✅ Snapshot stored for ${result.dimension}`);
    }
  }

  // Evaluate SD generation eligibility
  console.log('\n─'.repeat(60));
  const sdCandidates = results.filter(r =>
    r.threshold.breached && r.breaches >= r.config.min_occurrences
  );

  if (isDryRun) {
    console.log(`\n🔍 DRY RUN: ${sdCandidates.length} dimensions would trigger SD generation`);
    for (const c of sdCandidates) {
      console.log(`   - ${c.dimension}: score=${c.score}, breaches=${c.breaches}, level=${c.threshold.level}`);
    }
    console.log('\n   No SDs generated (dry-run mode)');
  } else if (sdCandidates.length > 0) {
    // Rate limit: max_sds_per_cycle
    const maxSDs = Math.min(...sdCandidates.map(c => c.config.max_sds_per_cycle));
    const toGenerate = sdCandidates
      .sort((a, b) => a.score - b.score) // worst first
      .slice(0, maxSDs);

    console.log(`\n🚀 Generating ${toGenerate.length} SD(s) (rate limit: ${maxSDs}/cycle)`);
    for (const candidate of toGenerate) {
      console.log(`   📝 Would generate SD for ${candidate.dimension} (score: ${candidate.score})`);
      // EVA pipeline integration: feed into trend detector
      await feedToEvaPipeline(candidate);
    }
  } else {
    console.log('\n✅ No SD generation triggered');
    if (results.some(r => r.threshold.breached)) {
      const pending = results.filter(r => r.threshold.breached);
      console.log(`   ⏳ ${pending.length} dimension(s) breached but below min_occurrences threshold`);
    }
  }

  // JSON output
  if (isJson) {
    console.log('\n' + JSON.stringify({
      scan_time: new Date().toISOString(),
      dry_run: isDryRun,
      results: results.map(r => ({
        dimension: r.dimension,
        score: r.score,
        level: r.threshold.level,
        trend: r.trend,
        finding_count: r.finding_count,
        breaches: r.breaches,
        min_occurrences: r.config.min_occurrences,
        sd_eligible: r.threshold.breached && r.breaches >= r.config.min_occurrences
      }))
    }, null, 2));
  }

  // Output signal for automation
  const worstResult = results.sort((a, b) => a.score - b.score)[0];
  if (worstResult) {
    console.log(`\nHEALTH_SCAN_STATUS=${worstResult.threshold.breached ? 'NEEDS_ATTENTION' : 'PASS'}`);
    console.log(`HEALTH_SCAN_SCORE=${worstResult.score}`);
    console.log(`HEALTH_SCAN_DIMENSION=${worstResult.dimension}`);
  }
}

/**
 * Show latest health report from stored snapshots
 */
async function showReport(isJson) {
  const { data: snapshots } = await supabase
    .from('codebase_health_snapshots')
    .select('*')
    .order('scanned_at', { ascending: false })
    .limit(20);

  if (!snapshots || snapshots.length === 0) {
    console.log('No health snapshots found. Run health:scan first.');
    return;
  }

  // Group by dimension, take latest per dimension
  const latest = {};
  for (const snap of snapshots) {
    if (!latest[snap.dimension]) {
      latest[snap.dimension] = snap;
    }
  }

  if (isJson) {
    console.log(JSON.stringify(latest, null, 2));
    return;
  }

  console.log('\n📊 Codebase Health Report');
  console.log('─'.repeat(60));

  for (const [dim, snap] of Object.entries(latest)) {
    const icon = snap.score >= 70 ? '🟢' : snap.score >= 50 ? '🟡' : '🔴';
    console.log(`\n${icon} ${dim}: ${snap.score}/100 (${snap.trend_direction})`);
    console.log(`   Findings: ${snap.finding_count}`);
    console.log(`   Last scan: ${new Date(snap.scanned_at).toLocaleString()}`);
  }
}

/**
 * Determine trend direction by comparing to previous snapshots
 */
async function determineTrend(dimension, currentScore) {
  const { data: previous } = await supabase
    .from('codebase_health_snapshots')
    .select('score')
    .eq('dimension', dimension)
    .order('scanned_at', { ascending: false })
    .limit(3);

  if (!previous || previous.length === 0) return 'new';

  const avgPrevious = previous.reduce((sum, s) => sum + Number(s.score), 0) / previous.length;
  const delta = currentScore - avgPrevious;

  if (delta > 5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}

/**
 * Feed health findings into EVA trend detector as signal source
 */
async function feedToEvaPipeline(candidate) {
  try {
    const { error } = await supabase.from('eva_consultant_trends').insert({
      trend_type: 'codebase_health',
      title: `Health degradation: ${candidate.dimension} at ${candidate.score}/100`,
      description: `Codebase health dimension "${candidate.dimension}" scored ${candidate.score}/100 (${candidate.threshold.level}). ${candidate.finding_count} findings detected across ${Object.keys(candidate.metadata.strategies || {}).length} strategies. Consecutive breaches: ${candidate.breaches}.`,
      confidence: candidate.threshold.level === 'critical' ? 0.9 : 0.7,
      impact_assessment: candidate.threshold.level === 'critical' ? 'high' : 'medium',
      recommended_actions: [`Review ${candidate.finding_count} findings in ${candidate.dimension} dimension`, 'Run health:report for details'],
      source_items: candidate.findings.slice(0, 10).map(f => f.file),
      target_application: 'EHG_Engineer',
      status: 'active',
      metadata: {
        origin: 'codebase_health',
        dimension: candidate.dimension,
        score: candidate.score,
        breaches: candidate.breaches
      }
    });

    if (error) {
      console.log(`   ⚠️  EVA pipeline feed failed: ${error.message}`);
    } else {
      console.log(`   ✅ Fed to EVA trend detector`);
    }
  } catch (err) {
    console.log(`   ⚠️  EVA pipeline feed error: ${err.message}`);
  }
}

function groupByStrategy(findings) {
  const grouped = {};
  for (const f of findings) {
    if (!grouped[f.strategy]) grouped[f.strategy] = [];
    grouped[f.strategy].push(f);
  }
  return grouped;
}

main().catch(err => {
  console.error('Health scan failed:', err.message);
  process.exit(1);
});
