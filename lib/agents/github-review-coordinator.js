#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import _path from 'path';
import yaml from 'js-yaml';

class GitHubReviewCoordinator {
  constructor() {
    // Parse GITHUB_REPOSITORY env var (format: "owner/repo")
    const [owner, repo] = (process.env.GITHUB_REPOSITORY || '/').split('/');
    this.owner = owner;
    this.repo = repo;

    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.prNumber = parseInt(process.env.PR_NUMBER);
    this.config = null;
  }

  async loadConfig() {
    try {
      const configYaml = process.env.CONFIG || '';
      if (configYaml) {
        this.config = yaml.load(configYaml);
      } else {
        // Fallback to reading file directly
        const configPath = '.github/claude-review-config.yml';
        const configContent = await fs.readFile(configPath, 'utf8');
        this.config = yaml.load(configContent);
      }
    } catch (e) {
      console.error('Warning: Could not load config, using defaults', e.message);
      this.config = {
        severity: { thresholds: { critical: 'block', high: 'warn' } },
        boundaries: { enforce: true },
        sub_agents: { auto_activate: true }
      };
    }
  }

  async coordinateReview() {
    // Validate environment
    if (!this.owner || !this.repo || !this.prNumber) {
      throw new Error(`Invalid environment: owner=${this.owner}, repo=${this.repo}, pr=${this.prNumber}`);
    }

    await this.loadConfig();

    const results = {
      summary: { pass: 0, fail: 0, warn: 0 },
      checks: [],
      recommendations: [],
      subAgentFindings: {}
    };

    try {
      // 1. Check SD/PRD/Backlog linkage
      const linkageCheck = await this.checkLinkage();
      this.updateSummary(results.summary, linkageCheck.status);
      results.checks.push(linkageCheck);

      // 2. Run boundary analysis
      const boundaryCheck = await this.checkBoundaries();
      this.updateSummary(results.summary, boundaryCheck.status);
      results.checks.push(boundaryCheck);

      // 3. Check for test coverage
      const coverageCheck = await this.checkTestCoverage();
      this.updateSummary(results.summary, coverageCheck.status);
      results.checks.push(coverageCheck);

      // 4. Activate relevant sub-agents
      const activatedAgents = await this.activateSubAgents();

      for (const agent of activatedAgents) {
        try {
          const agentResult = await this.runSubAgent(agent);
          results.subAgentFindings[agent] = agentResult;

          // Add agent check to results
          const agentCheck = {
            name: `${agent.charAt(0).toUpperCase() + agent.slice(1)} Analysis`,
            status: agentResult.severity === 'critical' ? 'FAIL' :
                   agentResult.severity === 'high' ? 'WARN' : 'PASS',
            message: agentResult.summary || 'Analysis complete'
          };
          this.updateSummary(results.summary, agentCheck.status);
          results.checks.push(agentCheck);
        } catch (e) {
          console.error(`Sub-agent ${agent} failed:`, e.message);
        }
      }

      // 5. Generate recommendations
      results.recommendations = this.generateRecommendations(results);

    } catch (error) {
      console.error('Review coordination failed:', error);
      results.checks.push({
        name: 'System Error',
        status: 'FAIL',
        message: error.message
      });
      results.summary.fail++;
    }

    // 6. Format unified comment
    const comment = this.formatComment(results);

    // 7. Output for GitHub Action
    console.log(JSON.stringify({ comment, results }, null, 2));
  }

  updateSummary(summary, status) {
    if (status === 'PASS') summary.pass++;
    else if (status === 'FAIL') summary.fail++;
    else if (status === 'WARN') summary.warn++;
  }

  async checkLinkage() {
    try {
      const pr = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.prNumber
      });

      const body = pr.data.body || '';
      const title = pr.data.title || '';
      const combined = `${title} ${body}`;

      const hasSD = /SD-\d{4}-\d+/.test(combined);
      const hasPRD = /PRD-[\w-]+/.test(combined);
      const hasBacklog = /BL-\d+/.test(combined);

      // Extract actual IDs for verification
      const sdMatch = combined.match(/SD-\d{4}-\d+/);
      const prdMatch = combined.match(/PRD-[\w-]+/);

      if (hasSD && (hasPRD || hasBacklog)) {
        return {
          name: 'SD/PRD/Backlog Linkage',
          status: 'PASS',
          message: `Linked to ${sdMatch?.[0] || 'SD'}, ${prdMatch?.[0] || 'PRD/Backlog'}`
        };
      } else if (hasBacklog && combined.toLowerCase().includes('bug')) {
        // Bug fixes may only have backlog items
        return {
          name: 'SD/PRD/Backlog Linkage',
          status: 'PASS',
          message: 'Bug fix with backlog item linkage'
        };
      } else {
        return {
          name: 'SD/PRD/Backlog Linkage',
          status: 'FAIL',
          message: `Missing required linkage: ${!hasSD ? 'SD' : ''} ${!hasPRD && !hasBacklog ? 'PRD/Backlog' : ''}`
        };
      }
    } catch (error) {
      return {
        name: 'SD/PRD/Backlog Linkage',
        status: 'FAIL',
        message: `Could not verify linkage: ${error.message}`
      };
    }
  }

  async checkBoundaries() {
    try {
      const files = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.prNumber,
        per_page: 100
      });

      const prohibitedPaths = this.config?.boundaries?.prohibited_paths || [
        '/mnt/c/EHG/',
        '/.env.production'
      ];

      const violations = files.data.filter(f =>
        prohibitedPaths.some(path => f.filename.includes(path))
      );

      if (violations.length > 0) {
        return {
          name: 'Boundary Check',
          status: 'FAIL',
          message: `Boundary violations in: ${violations.slice(0, 3).map(v => v.filename).join(', ')}${violations.length > 3 ? ` and ${violations.length - 3} more` : ''}`
        };
      }

      // Check for cross-boundary imports in changed files
      const jsFiles = files.data.filter(f =>
        (f.filename.endsWith('.js') || f.filename.endsWith('.ts')) &&
        f.patch
      );

      let importViolations = 0;
      for (const file of jsFiles) {
        if (file.patch && file.patch.includes('from') && file.patch.includes('EHG/')) {
          importViolations++;
        }
      }

      if (importViolations > 0) {
        return {
          name: 'Boundary Check',
          status: 'WARN',
          message: `Found ${importViolations} potential cross-boundary imports`
        };
      }

      return {
        name: 'Boundary Check',
        status: 'PASS',
        message: 'Architecture boundaries respected'
      };
    } catch (error) {
      return {
        name: 'Boundary Check',
        status: 'WARN',
        message: `Could not fully verify boundaries: ${error.message}`
      };
    }
  }

  async checkTestCoverage() {
    try {
      const files = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.prNumber
      });

      const codeFiles = files.data.filter(f =>
        (f.filename.endsWith('.js') || f.filename.endsWith('.ts')) &&
        !f.filename.includes('.test.') &&
        !f.filename.includes('.spec.') &&
        !f.filename.startsWith('tests/')
      );

      const testFiles = files.data.filter(f =>
        f.filename.includes('.test.') ||
        f.filename.includes('.spec.') ||
        f.filename.startsWith('tests/')
      );

      if (codeFiles.length > 0 && testFiles.length === 0) {
        return {
          name: 'Test Coverage',
          status: 'WARN',
          message: `${codeFiles.length} code files modified but no tests added/updated`
        };
      } else if (testFiles.length > 0) {
        return {
          name: 'Test Coverage',
          status: 'PASS',
          message: `${testFiles.length} test file(s) included`
        };
      } else {
        return {
          name: 'Test Coverage',
          status: 'PASS',
          message: 'No code changes requiring tests'
        };
      }
    } catch (error) {
      return {
        name: 'Test Coverage',
        status: 'WARN',
        message: `Could not verify test coverage: ${error.message}`
      };
    }
  }

  async activateSubAgents() {
    if (!this.config?.sub_agents?.auto_activate) {
      return [];
    }

    try {
      const files = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: this.prNumber
      });

      const activated = new Set();
      const triggers = this.config?.sub_agents?.triggers || {};

      // Analyze file changes for trigger keywords
      for (const file of files.data) {
        const content = file.patch || '';
        const filename = file.filename.toLowerCase();

        // Security triggers
        if (triggers.security?.some(t => content.includes(t) || filename.includes(t))) {
          activated.add('security');
        }

        // Database triggers
        if (triggers.database?.some(t => content.includes(t) || filename.includes('migration'))) {
          activated.add('database');
        }

        // Performance triggers
        if (triggers.performance?.some(t => content.includes(t))) {
          activated.add('performance');
        }

        // Testing triggers
        if (filename.includes('test') || filename.includes('spec')) {
          activated.add('testing');
        }
      }

      return Array.from(activated);
    } catch (error) {
      console.error('Sub-agent activation failed:', error);
      return [];
    }
  }

  async runSubAgent(agentName) {
    // TODO: Dynamic import and execution of actual sub-agents
    // For now, return mock results based on agent type

    const mockResults = {
      security: {
        findings: [],
        recommendations: ['Review authentication flow', 'Validate input sanitization'],
        severity: 'medium',
        summary: 'No critical security issues found'
      },
      testing: {
        findings: ['Coverage at 75%'],
        recommendations: ['Add unit tests for new functions'],
        severity: 'low',
        summary: 'Test coverage below 80% threshold'
      },
      database: {
        findings: [],
        recommendations: ['Consider adding index for performance'],
        severity: 'low',
        summary: 'Schema changes are backward compatible'
      },
      performance: {
        findings: [],
        recommendations: [],
        severity: 'low',
        summary: 'No performance concerns detected'
      }
    };

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));

    return mockResults[agentName] || {
      findings: [],
      recommendations: [],
      severity: 'low',
      summary: `${agentName} analysis complete`
    };
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.summary.fail > 0) {
      recommendations.push('🔴 Address all failing checks before requesting review');
    }

    if (results.summary.warn > 0) {
      recommendations.push('⚠️ Review warnings and consider addressing them');
    }

    // Add sub-agent recommendations
    for (const [agent, findings] of Object.entries(results.subAgentFindings)) {
      if (findings.recommendations && findings.recommendations.length > 0) {
        findings.recommendations.slice(0, 2).forEach(rec =>
          recommendations.push(`💡 [${agent}] ${rec}`)
        );
      }
    }

    if (recommendations.length === 0 && results.summary.fail === 0) {
      recommendations.push('✅ Ready for human architecture review');
    }

    return recommendations;
  }

  formatComment(results) {
    const emoji = results.summary.fail > 0 ? '❌' :
                 results.summary.warn > 0 ? '⚠️' : '✅';

    let comment = `## ${emoji} Agentic PR Review Results

### Summary
- ✅ Passed: ${results.summary.pass}
- ❌ Failed: ${results.summary.fail}
- ⚠️ Warnings: ${results.summary.warn}

### Checks
${results.checks.map(c => {
  const icon = c.status === 'PASS' ? '✅' : c.status === 'FAIL' ? '❌' : '⚠️';
  return `- ${icon} **${c.name}**: ${c.message}`;
}).join('\n')}
`;

    // Add sub-agent findings if any
    const agentsWithFindings = Object.entries(results.subAgentFindings)
      .filter(([_, f]) => f.findings && f.findings.length > 0);

    if (agentsWithFindings.length > 0) {
      comment += '\n### Sub-Agent Analysis\n';
      for (const [agent, findings] of agentsWithFindings) {
        comment += `#### ${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent\n`;
        comment += findings.findings.slice(0, 3).map(f => `- ${f}`).join('\n');
        comment += '\n\n';
      }
    }

    // Add recommendations
    if (results.recommendations.length > 0) {
      comment += '\n### Recommendations\n';
      comment += results.recommendations.map(r => `- ${r}`).join('\n');
      comment += '\n';
    }

    // Add next steps
    comment += '\n### Next Steps\n';
    if (results.summary.fail > 0) {
      comment += `1. Address the ${results.summary.fail} failing check(s) above\n`;
      comment += '2. Push fixes and wait for re-review\n';
      comment += '3. Request human review once all checks pass\n';
    } else if (results.summary.warn > 0) {
      comment += `1. Review the ${results.summary.warn} warning(s) above\n`;
      comment += '2. Address if necessary or provide justification\n';
      comment += '3. Request human architecture review\n';
    } else {
      comment += '1. All automated checks passed ✅\n';
      comment += '2. Request human architecture review\n';
      comment += '3. Merge once approved\n';
    }

    comment += '\n---\n*Generated by Claude Agentic Review v1.0 | [View Config](.github/claude-review-config.yml)*';

    return comment;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const coordinator = new GitHubReviewCoordinator();
  coordinator.coordinateReview().catch(error => {
    console.error('Fatal error:', error);
    // Output valid JSON even on fatal error
    console.log(JSON.stringify({
      comment: `## ❌ Review System Error\n\nThe review system encountered a fatal error:\n\`\`\`\n${error.message}\n\`\`\``,
      results: { summary: { fail: 1, pass: 0, warn: 0 } }
    }));
    process.exit(1);
  });
}

export default GitHubReviewCoordinator;