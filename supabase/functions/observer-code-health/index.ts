// Code Health Observer Edge Function
// LEO Protocol v4.4: Proactive SD Proposal System
// Monitors CI/CD code health metrics and proposes SDs for degrading trends

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CoverageReport {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
  files?: Record<string, {
    lines: { pct: number };
    path: string;
  }>;
}

interface LintReport {
  errorCount: number;
  warningCount: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
  results?: Array<{
    filePath: string;
    errorCount: number;
    warningCount: number;
  }>;
}

interface TypeCheckReport {
  errorCount: number;
  errors?: Array<{
    file: string;
    line: number;
    message: string;
    code: number;
  }>;
}

interface CodeHealthPayload {
  coverage?: CoverageReport;
  lint?: LintReport;
  typecheck?: TypeCheckReport;
  commit_sha?: string;
  branch?: string;
  build_url?: string;
  target_application?: string;
  venture_id?: string;
  dry_run?: boolean;
}

interface HealthMetric {
  type: 'coverage' | 'lint' | 'typecheck';
  metric: string;
  value: number;
  threshold: number;
  path?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// Get current week number for dedupe key
function getWeekNumber(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  const weekNum = Math.floor(diff / oneWeek);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Generate deterministic dedupe key for metric
function generateDedupeKey(metric: HealthMetric): string {
  const week = getWeekNumber();
  const pathSuffix = metric.path ? `:${metric.path.replace(/\//g, '_')}` : '';
  return `code_health:${metric.type}:${metric.metric}${pathSuffix}:${week}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const body: CodeHealthPayload = await req.json();
    const {
      coverage,
      lint,
      typecheck,
      commit_sha,
      branch = 'main',
      build_url,
      target_application = 'EHG_Engineer',
      venture_id,
      dry_run = false,
    } = body;

    const results = {
      proposals_created: 0,
      proposals_skipped: 0,
      issues_detected: 0,
      errors: [] as string[],
      proposals: [] as any[],
      metrics: [] as HealthMetric[],
    };

    // Analyze code health metrics
    const healthIssues: HealthMetric[] = [];

    // Coverage analysis
    if (coverage?.total) {
      const lineCoverage = coverage.total.lines.pct;
      const branchCoverage = coverage.total.branches.pct;

      // Critical: coverage below 40%
      if (lineCoverage < 40) {
        healthIssues.push({
          type: 'coverage',
          metric: 'line_coverage',
          value: lineCoverage,
          threshold: 40,
          severity: 'critical',
        });
      }
      // High: coverage below 60%
      else if (lineCoverage < 60) {
        healthIssues.push({
          type: 'coverage',
          metric: 'line_coverage',
          value: lineCoverage,
          threshold: 60,
          severity: 'high',
        });
      }
      // Medium: coverage below 80%
      else if (lineCoverage < 80) {
        healthIssues.push({
          type: 'coverage',
          metric: 'line_coverage',
          value: lineCoverage,
          threshold: 80,
          severity: 'medium',
        });
      }

      // Branch coverage separately tracked
      if (branchCoverage < 50) {
        healthIssues.push({
          type: 'coverage',
          metric: 'branch_coverage',
          value: branchCoverage,
          threshold: 50,
          severity: 'high',
        });
      }

      // Check for specific low-coverage files
      if (coverage.files) {
        for (const [path, fileData] of Object.entries(coverage.files)) {
          if (fileData.lines.pct < 30) {
            healthIssues.push({
              type: 'coverage',
              metric: 'file_coverage',
              value: fileData.lines.pct,
              threshold: 30,
              path: path,
              severity: 'medium',
            });
          }
        }
      }
    }

    // Lint analysis
    if (lint) {
      // Critical: more than 50 lint errors
      if (lint.errorCount > 50) {
        healthIssues.push({
          type: 'lint',
          metric: 'error_count',
          value: lint.errorCount,
          threshold: 50,
          severity: 'critical',
        });
      }
      // High: more than 20 lint errors
      else if (lint.errorCount > 20) {
        healthIssues.push({
          type: 'lint',
          metric: 'error_count',
          value: lint.errorCount,
          threshold: 20,
          severity: 'high',
        });
      }
      // Medium: more than 10 lint errors
      else if (lint.errorCount > 10) {
        healthIssues.push({
          type: 'lint',
          metric: 'error_count',
          value: lint.errorCount,
          threshold: 10,
          severity: 'medium',
        });
      }

      // Track files with many errors
      if (lint.results) {
        for (const file of lint.results) {
          if (file.errorCount > 10) {
            healthIssues.push({
              type: 'lint',
              metric: 'file_errors',
              value: file.errorCount,
              threshold: 10,
              path: file.filePath,
              severity: 'medium',
            });
          }
        }
      }
    }

    // TypeScript analysis
    if (typecheck) {
      // Critical: more than 20 type errors
      if (typecheck.errorCount > 20) {
        healthIssues.push({
          type: 'typecheck',
          metric: 'error_count',
          value: typecheck.errorCount,
          threshold: 20,
          severity: 'critical',
        });
      }
      // High: more than 10 type errors
      else if (typecheck.errorCount > 10) {
        healthIssues.push({
          type: 'typecheck',
          metric: 'error_count',
          value: typecheck.errorCount,
          threshold: 10,
          severity: 'high',
        });
      }
      // Medium: any type errors
      else if (typecheck.errorCount > 0) {
        healthIssues.push({
          type: 'typecheck',
          metric: 'error_count',
          value: typecheck.errorCount,
          threshold: 0,
          severity: 'medium',
        });
      }
    }

    results.issues_detected = healthIssues.length;
    results.metrics = healthIssues;

    if (healthIssues.length === 0) {
      console.log('No code health issues detected');
      return new Response(
        JSON.stringify({
          success: true,
          dry_run,
          message: 'Code health is good - no issues detected',
          ...results
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${healthIssues.length} code health issues`);

    // Create proposals for significant issues (high/critical, or grouped medium)
    // Group medium issues by type to avoid proposal spam
    const criticalIssues = healthIssues.filter(i => i.severity === 'critical');
    const highIssues = healthIssues.filter(i => i.severity === 'high');
    const mediumIssues = healthIssues.filter(i => i.severity === 'medium');

    // Process critical/high issues individually
    for (const issue of [...criticalIssues, ...highIssues]) {
      const dedupeKey = generateDedupeKey(issue);

      // Check if proposal already exists
      const { data: existing } = await supabase
        .from('sd_proposals')
        .select('id, status')
        .eq('dedupe_key', dedupeKey)
        .in('status', ['pending', 'seen', 'snoozed'])
        .single();

      if (existing) {
        console.log(`Skipping ${issue.type}:${issue.metric}: proposal already exists`);
        results.proposals_skipped++;
        continue;
      }

      // Calculate confidence
      let confidence = 0.75;
      if (issue.severity === 'critical') confidence = 0.95;
      else if (issue.severity === 'high') confidence = 0.85;

      const proposal = {
        title: `Address ${issue.severity.toUpperCase()} ${issue.type} issue: ${issue.metric}`,
        description: `Code health analysis detected a ${issue.severity} issue:\n\n` +
          `**Metric**: ${issue.type} - ${issue.metric}\n` +
          `**Current Value**: ${issue.value.toFixed(1)}${issue.type === 'coverage' ? '%' : ' errors'}\n` +
          `**Threshold**: ${issue.threshold}${issue.type === 'coverage' ? '%' : ' errors'}\n` +
          (issue.path ? `**Path**: ${issue.path}\n` : '') +
          (commit_sha ? `**Commit**: ${commit_sha}\n` : '') +
          (build_url ? `**Build**: ${build_url}\n` : '') +
          `\nThis issue was detected on branch: ${branch}`,
        trigger_type: 'code_health',
        trigger_source_id: commit_sha || build_url || getWeekNumber(),
        trigger_event_type: `${issue.type}_degradation`,
        confidence_score: Math.min(confidence, 1.0),
        impact_score: issue.severity === 'critical' ? 0.95 :
                       issue.severity === 'high' ? 0.80 : 0.65,
        urgency_level: issue.severity === 'critical' ? 'critical' : 'medium',
        dedupe_key: dedupeKey,
        target_application: target_application,
        venture_id: venture_id || null,
        created_by: 'observer:code_health',
        proposed_scope: {
          objectives: [
            `Improve ${issue.metric} ${issue.type === 'coverage' ? 'to above' : 'to below'} ${issue.threshold}${issue.type === 'coverage' ? '%' : ' errors'}`,
            `Analyze root cause of ${issue.type} degradation`,
            issue.path ? `Focus on ${issue.path}` : 'Review overall codebase health',
            'Implement fixes without introducing regressions'
          ],
          success_criteria: [
            `${issue.metric} ${issue.type === 'coverage' ? '>=' : '<='} ${issue.threshold}${issue.type === 'coverage' ? '%' : ' errors'}`,
            'All existing tests pass',
            'No new issues introduced'
          ],
          risks: [
            {
              risk: 'Rushed fixes may introduce bugs',
              mitigation: 'Thorough testing and code review required'
            },
            {
              risk: issue.type === 'coverage' ? 'Low-value tests added just for coverage' : "Quick fixes that don't address root cause",
              mitigation: issue.type === 'coverage' ? 'Focus on meaningful test scenarios' : 'Investigate underlying patterns'
            }
          ]
        },
        evidence_data: {
          metric_type: issue.type,
          metric_name: issue.metric,
          current_value: issue.value,
          threshold: issue.threshold,
          severity: issue.severity,
          path: issue.path || null,
          commit_sha: commit_sha || null,
          branch: branch,
          build_url: build_url || null,
          week: getWeekNumber(),
          detected_at: new Date().toISOString()
        }
      };

      if (dry_run) {
        results.proposals.push(proposal);
        results.proposals_created++;
        continue;
      }

      // Insert proposal
      const { data: insertedProposal, error: insertError } = await supabase
        .from('sd_proposals')
        .insert(proposal)
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert proposal:', insertError);
        results.errors.push(`${issue.type}:${issue.metric}: ${insertError.message}`);
        continue;
      }

      results.proposals.push(insertedProposal);
      results.proposals_created++;

      // For critical issues, create chairman alert
      if (issue.severity === 'critical') {
        try {
          await supabase
            .from('chairman_alerts')
            .insert({
              severity: 'critical',
              title: `CRITICAL: Code health degradation in ${issue.type}`,
              message: proposal.description,
              source: 'sd_proposal',
              source_id: insertedProposal.id,
              metadata: {
                trigger_type: 'code_health',
                metric_type: issue.type,
                current_value: issue.value,
                threshold: issue.threshold
              }
            });
        } catch (alertErr) {
          console.error('Failed to create chairman alert:', alertErr);
        }
      }

      // Log system event
      try {
        await supabase.rpc('fn_log_system_event', {
          p_event_type: 'PROPOSAL_GENERATED',
          p_correlation_id: insertedProposal.correlation_id,
          p_payload: {
            proposal_id: insertedProposal.id,
            trigger_type: 'code_health',
            metric_type: issue.type,
            severity: issue.severity,
            confidence: proposal.confidence_score
          }
        });
      } catch (eventErr) {
        console.log('System event logging skipped');
      }
    }

    // Group medium issues by type and create one proposal per type
    const mediumByType = new Map<string, HealthMetric[]>();
    for (const issue of mediumIssues) {
      if (!mediumByType.has(issue.type)) {
        mediumByType.set(issue.type, []);
      }
      mediumByType.get(issue.type)!.push(issue);
    }

    for (const [type, issues] of mediumByType.entries()) {
      if (issues.length < 3) continue; // Only if 3+ medium issues of same type

      const dedupeKey = `code_health:${type}:multiple_medium:${getWeekNumber()}`;

      // Check if proposal already exists
      const { data: existing } = await supabase
        .from('sd_proposals')
        .select('id, status')
        .eq('dedupe_key', dedupeKey)
        .in('status', ['pending', 'seen', 'snoozed'])
        .single();

      if (existing) {
        results.proposals_skipped++;
        continue;
      }

      const proposal = {
        title: `Address multiple ${type} issues (${issues.length} found)`,
        description: `Code health analysis detected ${issues.length} ${type}-related issues:\n\n` +
          issues.slice(0, 5).map(i =>
            `- ${i.metric}${i.path ? ` in ${i.path}` : ''}: ${i.value.toFixed(1)} (threshold: ${i.threshold})`
          ).join('\n') +
          (issues.length > 5 ? `\n... and ${issues.length - 5} more` : ''),
        trigger_type: 'code_health',
        trigger_source_id: getWeekNumber(),
        trigger_event_type: `multiple_${type}_issues`,
        confidence_score: 0.75,
        impact_score: 0.70,
        urgency_level: 'low' as const,
        dedupe_key: dedupeKey,
        target_application: target_application,
        venture_id: venture_id || null,
        created_by: 'observer:code_health',
        proposed_scope: {
          objectives: [
            `Address ${issues.length} ${type} issues systematically`,
            'Prioritize highest-impact fixes',
            'Establish baseline for future monitoring'
          ],
          success_criteria: [
            'At least 50% of issues resolved',
            'No regression in other metrics'
          ],
          risks: [
            {
              risk: 'Scope creep addressing all issues',
              mitigation: 'Focus on top 5 most impactful issues'
            }
          ]
        },
        evidence_data: {
          issue_type: type,
          issue_count: issues.length,
          issues: issues.slice(0, 10),
          week: getWeekNumber(),
          detected_at: new Date().toISOString()
        }
      };

      if (!dry_run) {
        const { data: insertedProposal, error: insertError } = await supabase
          .from('sd_proposals')
          .insert(proposal)
          .select()
          .single();

        if (insertError) {
          results.errors.push(`grouped_${type}: ${insertError.message}`);
        } else {
          results.proposals.push(insertedProposal);
          results.proposals_created++;
        }
      } else {
        results.proposals.push(proposal);
        results.proposals_created++;
      }
    }

    console.log(`Observer complete: ${results.proposals_created} proposals created, ${results.proposals_skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Observer error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
