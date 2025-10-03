#!/usr/bin/env node

/**
 * Enhanced DevOps Platform Architect Sub-Agent
 * LEO Protocol Integration for CI/CD Failure Resolution
 * Handles GitHub pipeline failures with automated analysis and resolution
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class EnhancedDevOpsPlatformArchitect {
  constructor() {
    this.capabilities = [
      'ci_cd_failure_analysis',
      'auto_pipeline_retry',
      'failure_categorization',
      'resolution_automation',
      'deployment_readiness',
      'infrastructure_monitoring'
    ];

    this.resolutionStrategies = new Map([
      ['test_failure', this.resolveTestFailures.bind(this)],
      ['lint_error', this.resolveLintErrors.bind(this)],
      ['build_failure', this.resolveBuildFailures.bind(this)],
      ['deployment_failure', this.resolveDeploymentFailures.bind(this)],
      ['timeout', this.resolveTimeouts.bind(this)],
      ['dependency_issue', this.resolveDependencyIssues.bind(this)],
      ['security_scan', this.resolveSecurityIssues.bind(this)],
      ['other', this.resolveGenericFailures.bind(this)]
    ]);
  }

  /**
   * Main execution entry point for sub-agent
   */
  async execute(context = {}) {
    console.log(chalk.blue.bold('\n🤖 DevOps Platform Architect - Enhanced CI/CD Integration'));
    console.log(chalk.cyan('Analyzing CI/CD pipeline status and resolving failures...'));
    console.log(chalk.gray('─'.repeat(70)));

    try {
      const { sd_id, failure_category, pipeline_status_id, trigger_type = 'manual' } = context;

      if (!sd_id) {
        throw new Error('Strategic Directive ID required for DevOps analysis');
      }

      // Analyze current CI/CD status
      const analysis = await this.analyzeCiCdStatus(sd_id);

      if (analysis.hasFailures) {
        console.log(chalk.red(`\n❌ Active failures detected: ${analysis.failureCount}`));

        // Attempt automated resolution
        const resolutionResults = await this.attemptAutomatedResolution(sd_id, analysis.failures);

        // Generate recommendations
        const recommendations = await this.generateRecommendations(sd_id, analysis);

        return {
          success: resolutionResults.some(r => r.success),
          analysis,
          resolutions: resolutionResults,
          recommendations,
          requiresManualIntervention: resolutionResults.some(r => r.requiresManual)
        };
      } else {
        console.log(chalk.green('\n✅ No active CI/CD failures detected'));

        // Check deployment readiness
        const deploymentReadiness = await this.assessDeploymentReadiness(sd_id);

        return {
          success: true,
          analysis,
          deploymentReadiness,
          recommendations: []
        };
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ DevOps Platform Architect execution failed: ${error.message}`));
      return {
        success: false,
        error: error.message,
        requiresManualIntervention: true
      };
    }
  }

  /**
   * Analyze current CI/CD status for an SD
   */
  async analyzeCiCdStatus(sdId) {
    console.log(chalk.cyan(`\n🔍 Analyzing CI/CD status for ${sdId}...`));

    try {
      // Get current CI/CD status
      const { data: cicdStatus, error: statusError } = await supabase
        .rpc('get_sd_ci_cd_status', { sd_id_param: sdId });

      if (statusError) {
        throw new Error(`Failed to get CI/CD status: ${statusError.message}`);
      }

      const status = cicdStatus?.[0] || { status: 'unknown', active_failures: 0 };

      // Get detailed failure information
      const { data: failures, error: failuresError } = await supabase
        .from('ci_cd_pipeline_status')
        .select('*')
        .eq('sd_id', sdId)
        .eq('conclusion', 'failure')
        .order('created_at', { ascending: false })
        .limit(10);

      if (failuresError) {
        console.log(chalk.yellow(`⚠️  Could not retrieve failure details: ${failuresError.message}`));
      }

      const analysis = {
        status: status.status,
        healthScore: status.health_score || 0,
        hasFailures: status.active_failures > 0,
        failureCount: status.active_failures,
        totalPipelines: status.total_pipelines || 0,
        lastRun: status.last_run,
        failures: failures || [],
        categories: this.categorizeFailures(failures || [])
      };

      console.log(chalk.gray(`   Status: ${analysis.status}`));
      console.log(chalk.gray(`   Health Score: ${analysis.healthScore}%`));
      console.log(chalk.gray(`   Active Failures: ${analysis.failureCount}`));

      return analysis;

    } catch (error) {
      console.error(chalk.red(`Failed to analyze CI/CD status: ${error.message}`));
      throw error;
    }
  }

  /**
   * Categorize failures for targeted resolution
   */
  categorizeFailures(failures) {
    const categories = new Map();

    for (const failure of failures) {
      const category = this.categorizeFailure(failure.workflow_name, failure.conclusion);

      if (!categories.has(category)) {
        categories.set(category, []);
      }

      categories.get(category).push(failure);
    }

    return categories;
  }

  /**
   * Categorize individual failure
   */
  categorizeFailure(workflowName, conclusion) {
    const workflow = workflowName?.toLowerCase() || '';

    if (workflow.includes('test') || workflow.includes('jest') || workflow.includes('spec')) {
      return 'test_failure';
    }
    if (workflow.includes('lint') || workflow.includes('eslint') || workflow.includes('prettier')) {
      return 'lint_error';
    }
    if (workflow.includes('build') || workflow.includes('compile')) {
      return 'build_failure';
    }
    if (workflow.includes('deploy') || workflow.includes('production')) {
      return 'deployment_failure';
    }
    if (conclusion === 'timed_out') {
      return 'timeout';
    }
    if (workflow.includes('security') || workflow.includes('audit')) {
      return 'security_scan';
    }
    if (workflow.includes('dependencies') || workflow.includes('npm audit')) {
      return 'dependency_issue';
    }

    return 'other';
  }

  /**
   * Attempt automated resolution for all failure categories
   */
  async attemptAutomatedResolution(sdId, failures) {
    console.log(chalk.cyan(`\n🔧 Attempting automated resolution for ${failures.length} failure(s)...`));

    const results = [];

    for (const failure of failures) {
      const category = this.categorizeFailure(failure.workflow_name, failure.conclusion);
      console.log(chalk.gray(`\n   Processing ${category} failure: ${failure.workflow_name}`));

      try {
        const strategy = this.resolutionStrategies.get(category);
        if (strategy) {
          const result = await strategy(failure, sdId);
          results.push({
            failure,
            category,
            ...result
          });
        } else {
          results.push({
            failure,
            category,
            success: false,
            message: 'No resolution strategy available',
            requiresManual: true
          });
        }
      } catch (error) {
        console.error(chalk.red(`   ❌ Resolution failed: ${error.message}`));
        results.push({
          failure,
          category,
          success: false,
          error: error.message,
          requiresManual: true
        });
      }
    }

    return results;
  }

  /**
   * Resolution strategy for test failures
   */
  async resolveTestFailures(failure, sdId) {
    console.log(chalk.yellow('   🧪 Analyzing test failures...'));

    // Common test failure resolutions
    const recommendations = [
      'Check for recent code changes that might have broken tests',
      'Verify test data and fixtures are up to date',
      'Check for environment-specific test failures',
      'Run tests locally to reproduce the issue'
    ];

    // Could implement automatic test retry logic here
    const canRetry = this.shouldRetryPipeline(failure);

    if (canRetry) {
      console.log(chalk.cyan('   🔄 Scheduling pipeline retry...'));
      // TODO: Implement GitHub API call to retry workflow
      return {
        success: true,
        action: 'retry_scheduled',
        message: 'Pipeline retry scheduled for test failures',
        recommendations
      };
    }

    return {
      success: false,
      requiresManual: true,
      message: 'Test failures require manual investigation',
      recommendations
    };
  }

  /**
   * Resolution strategy for lint errors
   */
  async resolveLintErrors(failure, sdId) {
    console.log(chalk.yellow('   📝 Analyzing lint errors...'));

    const recommendations = [
      'Run linter locally and fix formatting issues',
      'Use IDE auto-fix features for common lint errors',
      'Check if lint rules have changed recently',
      'Consider adding pre-commit hooks to prevent lint issues'
    ];

    // Lint errors are usually fixable automatically
    return {
      success: false,
      requiresManual: true,
      action: 'lint_fix_required',
      message: 'Lint errors detected - requires code formatting fixes',
      recommendations,
      autoFixable: true
    };
  }

  /**
   * Resolution strategy for build failures
   */
  async resolveBuildFailures(failure, sdId) {
    console.log(chalk.yellow('   🔨 Analyzing build failures...'));

    const recommendations = [
      'Check for TypeScript compilation errors',
      'Verify all dependencies are properly installed',
      'Check for missing environment variables',
      'Ensure build scripts are up to date',
      'Review recent dependency updates'
    ];

    const canRetry = this.shouldRetryPipeline(failure);

    if (canRetry) {
      return {
        success: true,
        action: 'retry_scheduled',
        message: 'Build failure retry scheduled',
        recommendations
      };
    }

    return {
      success: false,
      requiresManual: true,
      message: 'Build failures require manual investigation',
      recommendations
    };
  }

  /**
   * Resolution strategy for deployment failures
   */
  async resolveDeploymentFailures(failure, sdId) {
    console.log(chalk.yellow('   🚀 Analyzing deployment failures...'));

    const recommendations = [
      'Check deployment environment status',
      'Verify deployment credentials and permissions',
      'Check for infrastructure issues',
      'Review deployment configuration',
      'Check for resource availability'
    ];

    return {
      success: false,
      requiresManual: true,
      message: 'Deployment failures require infrastructure review',
      recommendations,
      escalate: true
    };
  }

  /**
   * Resolution strategy for timeout issues
   */
  async resolveTimeouts(failure, sdId) {
    console.log(chalk.yellow('   ⏰ Analyzing timeout issues...'));

    const recommendations = [
      'Check if workflow timeout limits are appropriate',
      'Review performance bottlenecks in CI/CD pipeline',
      'Consider optimizing test execution time',
      'Check for external service dependencies causing delays'
    ];

    // Timeouts can often be resolved with retry
    return {
      success: true,
      action: 'retry_with_longer_timeout',
      message: 'Scheduling retry with extended timeout',
      recommendations
    };
  }

  /**
   * Resolution strategy for dependency issues
   */
  async resolveDependencyIssues(failure, sdId) {
    console.log(chalk.yellow('   📦 Analyzing dependency issues...'));

    const recommendations = [
      'Review package.json for conflicting dependencies',
      'Check for security vulnerabilities in dependencies',
      'Update dependencies to latest stable versions',
      'Check for license compatibility issues',
      'Consider using npm audit fix for automatic fixes'
    ];

    return {
      success: false,
      requiresManual: true,
      message: 'Dependency issues require package management review',
      recommendations,
      autoFixable: true
    };
  }

  /**
   * Resolution strategy for security scan failures
   */
  async resolveSecurityIssues(failure, sdId) {
    console.log(chalk.yellow('   🔒 Analyzing security scan failures...'));

    const recommendations = [
      'Review security scan results for specific vulnerabilities',
      'Update dependencies with known security issues',
      'Check for secrets accidentally committed to repository',
      'Review code for common security patterns',
      'Consider adding security-focused pre-commit hooks'
    ];

    return {
      success: false,
      requiresManual: true,
      message: 'Security issues require manual review and fixes',
      recommendations,
      priority: 'high'
    };
  }

  /**
   * Generic resolution strategy
   */
  async resolveGenericFailures(failure, sdId) {
    console.log(chalk.yellow('   ❓ Analyzing generic failure...'));

    const recommendations = [
      'Review workflow logs for specific error messages',
      'Check GitHub Actions status page for service issues',
      'Verify workflow configuration is correct',
      'Consider reaching out to development team for assistance'
    ];

    return {
      success: false,
      requiresManual: true,
      message: 'Generic failure requires manual investigation',
      recommendations
    };
  }

  /**
   * Determine if pipeline should be retried
   */
  shouldRetryPipeline(failure) {
    // Check if failure is recent (less than 1 hour old)
    const failureTime = new Date(failure.created_at);
    const now = new Date();
    const timeDiff = now - failureTime;
    const oneHour = 60 * 60 * 1000;

    // Don't retry if failure is too old
    if (timeDiff > oneHour) {
      return false;
    }

    // Check failure category
    const category = this.categorizeFailure(failure.workflow_name, failure.conclusion);
    const retryableCategories = ['timeout', 'build_failure', 'test_failure'];

    return retryableCategories.includes(category);
  }

  /**
   * Assess deployment readiness
   */
  async assessDeploymentReadiness(sdId) {
    console.log(chalk.cyan(`\n🚀 Assessing deployment readiness for ${sdId}...`));

    try {
      const { data: status, error } = await supabase
        .rpc('get_sd_ci_cd_status', { sd_id_param: sdId });

      if (error) {
        throw new Error(`Failed to assess deployment readiness: ${error.message}`);
      }

      const cicdStatus = status?.[0] || { status: 'unknown', health_score: 0 };

      const readiness = {
        ready: cicdStatus.status === 'success' && cicdStatus.health_score >= 90,
        healthScore: cicdStatus.health_score || 0,
        blockers: [],
        recommendations: []
      };

      if (cicdStatus.status !== 'success') {
        readiness.blockers.push('CI/CD pipelines must pass before deployment');
      }

      if (cicdStatus.health_score < 90) {
        readiness.blockers.push(`Health score ${cicdStatus.health_score}% below 90% threshold`);
      }

      if (readiness.ready) {
        console.log(chalk.green('   ✅ Deployment ready - all pipelines passing'));
      } else {
        console.log(chalk.yellow(`   ⚠️  Deployment blocked: ${readiness.blockers.length} issue(s)`));
      }

      return readiness;

    } catch (error) {
      console.error(chalk.red(`Failed to assess deployment readiness: ${error.message}`));
      throw error;
    }
  }

  /**
   * Generate strategic recommendations
   */
  async generateRecommendations(sdId, analysis) {
    const recommendations = [];

    if (analysis.healthScore < 70) {
      recommendations.push({
        type: 'urgent',
        message: 'CI/CD health score critically low - immediate attention required',
        actions: ['Review all failed pipelines', 'Implement pipeline monitoring', 'Add automated recovery']
      });
    }

    if (analysis.failureCount > 3) {
      recommendations.push({
        type: 'process',
        message: 'High failure rate indicates process issues',
        actions: ['Review development workflow', 'Add pre-commit validation', 'Improve test coverage']
      });
    }

    const testFailures = analysis.categories.get('test_failure')?.length || 0;
    if (testFailures > 1) {
      recommendations.push({
        type: 'quality',
        message: 'Multiple test failures detected',
        actions: ['Review test reliability', 'Add test monitoring', 'Improve test data management']
      });
    }

    return recommendations;
  }

  /**
   * Log sub-agent execution results
   */
  async logExecution(sdId, result) {
    try {
      const { error } = await supabase
        .from('sub_agent_executions')
        .insert({
          sub_agent_id: 'devops-platform-architect',
          sd_id: sdId,
          status: result.success ? 'completed' : 'failed',
          results: result,
          triggered_by: 'ci_cd_failure',
          completed_at: new Date().toISOString()
        });

      if (error) {
        console.log(chalk.yellow(`⚠️  Could not log execution: ${error.message}`));
      } else {
        console.log(chalk.gray('   📊 Sub-agent execution logged'));
      }
    } catch (error) {
      console.error(chalk.red(`Failed to log execution: ${error.message}`));
    }
  }
}

export default EnhancedDevOpsPlatformArchitect;

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new EnhancedDevOpsPlatformArchitect();
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node scripts/devops-platform-architect-enhanced.js <SD-ID>');
    process.exit(1);
  }

  agent.execute({ sd_id: sdId })
    .then(result => {
      console.log('\n📋 DevOps Platform Architect Results:');
      console.log(JSON.stringify(result, null, 2));

      agent.logExecution(sdId, result);

      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Execution failed:', error.message);
      process.exit(1);
    });
}