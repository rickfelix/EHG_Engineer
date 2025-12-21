/**
 * Context-Aware Documentation Sub-Agent
 * =====================================
 * Intelligent documentation management for multi-application environments
 * Inspired by Stripe, Notion, GitBook, and Confluence best practices
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

export class ContextAwareDocumentationAgent {
  constructor() {
    this.name = 'Documentation Sub-Agent';

    // Require environment variables - no hardcoded fallbacks for security
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set - database features disabled');
    }

    this.supabase = supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;
    this.backstory = null;
    this.applicationContexts = new Map();
    this.documentationHealth = {
      organization_score: 0,
      completeness_score: 0,
      freshness_score: 0,
      link_health: 0,
      context_accuracy: 0
    };
  }

  async initialize() {
    await this.loadBackstory();
    await this.discoverApplicationContexts();
    console.log('📚 CONTEXT-AWARE DOCUMENTATION SUB-AGENT ACTIVATED');
    console.log(`📖 ${this.backstory?.summary || 'Multi-application documentation architect'}`);
    console.log(`💭 Mantra: "${this.backstory?.mantras?.[0] || 'Documentation is the user interface of your codebase'}"`);
  }

  async loadBackstory() {
    try {
      const { data } = await this.supabase
        .from('leo_sub_agents')
        .select('metadata')
        .eq('id', 'documentation-sub')
        .single();
      
      if (data?.metadata?.backstory) {
        this.backstory = data.metadata.backstory;
      }
    } catch (error) {
      console.warn('Could not load backstory from database:', error.message);
    }
  }

  /**
   * Discover Application Contexts
   * Identifies whether we're in EHG_Engineer (meta) or a generated application
   */
  async discoverApplicationContexts() {
    const cwd = process.cwd();
    
    // Check if we're in the EHG_Engineer meta-application
    if (cwd.includes('EHG_Engineer') && !cwd.includes('applications/')) {
      this.applicationContexts.set('current', {
        type: 'meta-application',
        name: 'EHG_Engineer',
        role: 'Framework that builds other applications',
        root: cwd,
        docsPath: path.join(cwd, 'docs'),
        applicationsPath: path.join(cwd, 'applications'),
        specialFiles: ['CLAUDE.md', 'CLAUDE-LEO.md', 'README.md'],
        documentationFocus: [
          'System architecture and protocols (LEO)',
          'Sub-agent system documentation', 
          'Application generation workflows',
          'Cross-application integration patterns'
        ]
      });
      
      // Discover generated applications
      try {
        const applicationsDir = path.join(cwd, 'applications');
        const appDirs = await fs.readdir(applicationsDir, { withFileTypes: true });
        
        for (const dir of appDirs) {
          if (dir.isDirectory()) {
            const appPath = path.join(applicationsDir, dir.name);
            const appContext = await this.analyzeApplicationContext(appPath, dir.name);
            this.applicationContexts.set(dir.name, appContext);
          }
        }
      } catch (error) {
        // No applications directory or access issues
      }
    } else if (cwd.includes('applications/')) {
      // We're inside a generated application
      const appMatch = cwd.match(/applications\/([^\/]+)/);
      if (appMatch) {
        const appId = appMatch[1];
        const appContext = await this.analyzeApplicationContext(cwd, appId);
        this.applicationContexts.set('current', appContext);
      }
    }
    
    console.log(`🎯 Discovered ${this.applicationContexts.size} application context(s)`);
  }

  async analyzeApplicationContext(appPath, appId) {
    try {
      // Check for package.json to understand application type
      let appType = 'client-application';
      let technology = 'unknown';
      
      const packageJsonPath = path.join(appPath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        if (packageJson.dependencies) {
          if (packageJson.dependencies.react || packageJson.dependencies['@react']) {
            technology = 'react';
          } else if (packageJson.dependencies.vue) {
            technology = 'vue';
          } else if (packageJson.dependencies.angular) {
            technology = 'angular';
          } else if (packageJson.dependencies.next) {
            technology = 'nextjs';
          }
        }
      } catch (e) {
        // No package.json or parse error
      }
      
      return {
        type: 'client-application',
        name: appId,
        technology,
        role: 'Specific application built by EHG_Engineer',
        root: appPath,
        docsPath: path.join(appPath, 'docs'),
        documentationFocus: [
          'Application-specific features and APIs',
          'User guides and tutorials', 
          'Deployment and configuration',
          'Business logic and workflows'
        ]
      };
    } catch (error) {
      return {
        type: 'unknown',
        name: appId,
        role: 'Unanalyzed application',
        root: appPath,
        error: error.message
      };
    }
  }

  /**
   * Get Context-Aware Documentation Structure
   * Returns the appropriate documentation structure for the current context
   */
  getDocumentationStructure(contextName = 'current') {
    const context = this.applicationContexts.get(contextName);
    if (!context) return null;
    
    const baseStructure = {
      'README.md': 'Documentation index and overview',
      '01_architecture/': 'System architecture and design',
      '02_api/': 'API documentation and references',
      '03_guides/': 'How-to guides and tutorials',
      '04_features/': 'Feature-specific documentation',
      '05_testing/': 'Testing documentation and guides',
      '06_deployment/': 'Deployment and operations',
      '07_reports/': 'Generated reports and analytics'
    };
    
    if (context.type === 'meta-application') {
      return {
        ...baseStructure,
        '03_protocols_and_standards/': 'LEO Protocol and coding standards',
        '05_sub_agents/': 'Sub-agent documentation',
        '08_applications/': 'Generated applications documentation',
        '09_retrospectives/': 'Project retrospectives and lessons learned'
      };
    } else if (context.type === 'client-application') {
      return {
        ...baseStructure,
        '08_business_logic/': 'Business rules and workflows',
        '09_user_guides/': 'End-user documentation',
        '10_troubleshooting/': 'Common issues and solutions'
      };
    }
    
    return baseStructure;
  }

  /**
   * Audit Documentation Organization
   * Scans for misplaced documentation and provides correction suggestions
   */
  async auditDocumentationOrganization(contextName = 'current') {
    const context = this.applicationContexts.get(contextName);
    if (!context) {
      throw new Error(`Context '${contextName}' not found`);
    }
    
    console.log(`🔍 Auditing documentation for ${context.name} (${context.type})`);
    
    const audit = {
      context: contextName,
      timestamp: new Date().toISOString(),
      findings: {
        misplaced_files: [],
        missing_structure: [],
        broken_links: [],
        outdated_docs: [],
        missing_metadata: []
      },
      recommendations: [],
      health_score: 0
    };
    
    // Find all markdown files in the application
    const allMdFiles = await this.findMarkdownFiles(context.root);
    
    // Check for misplaced files
    for (const file of allMdFiles) {
      const relativePath = path.relative(context.root, file);
      const isInDocs = relativePath.startsWith('docs/');
      const isSpecialFile = context.specialFiles?.includes(path.basename(file));
      const isRootReadme = relativePath === 'README.md';
      
      if (!isInDocs && !isSpecialFile && !isRootReadme) {
        audit.findings.misplaced_files.push({
          file: relativePath,
          current_location: file,
          suggested_location: await this.suggestCorrectLocation(file, context),
          reason: 'Documentation should be organized in docs/ directory'
        });
      }
    }
    
    // Check for missing directory structure
    const expectedStructure = this.getDocumentationStructure(contextName);
    const docsDir = context.docsPath;
    
    try {
      await fs.access(docsDir);
      
      for (const [dirName] of Object.entries(expectedStructure)) {
        if (dirName.endsWith('/')) {
          const expectedDir = path.join(docsDir, dirName);
          try {
            await fs.access(expectedDir);
          } catch (e) {
            audit.findings.missing_structure.push({
              directory: dirName,
              expected_path: expectedDir,
              reason: 'Standard documentation structure missing'
            });
          }
        }
      }
    } catch (e) {
      audit.findings.missing_structure.push({
        directory: 'docs/',
        expected_path: docsDir,
        reason: 'Root documentation directory missing'
      });
    }
    
    // Generate recommendations
    audit.recommendations = this.generateRecommendations(audit.findings, context);
    
    // Calculate health score
    audit.health_score = this.calculateHealthScore(audit.findings, allMdFiles.length);
    
    return audit;
  }

  async findMarkdownFiles(rootPath) {
    const files = [];
    
    async function scanDirectory(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && 
              !entry.name.startsWith('.') && 
              entry.name !== 'node_modules') {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory access issues
      }
    }
    
    await scanDirectory(rootPath);
    return files;
  }

  async suggestCorrectLocation(filePath, context) {
    const fileName = path.basename(filePath);
    const fileContent = await fs.readFile(filePath, 'utf-8').catch(() => '');
    
    // Analyze file content to suggest location
    if (fileName.toLowerCase().includes('api') || fileContent.includes('endpoint') || fileContent.includes('POST') || fileContent.includes('GET')) {
      return path.join(context.docsPath, '02_api', fileName);
    } else if (fileName.toLowerCase().includes('guide') || fileName.toLowerCase().includes('tutorial') || fileContent.includes('step-by-step')) {
      return path.join(context.docsPath, '03_guides', fileName);
    } else if (fileName.toLowerCase().includes('test') || fileContent.includes('playwright') || fileContent.includes('jest')) {
      return path.join(context.docsPath, '05_testing', fileName);
    } else if (fileName.toLowerCase().includes('deploy') || fileContent.includes('docker') || fileContent.includes('kubernetes')) {
      return path.join(context.docsPath, '06_deployment', fileName);
    } else if (fileName.toLowerCase().includes('architecture') || fileContent.includes('diagram') || fileContent.includes('system design')) {
      return path.join(context.docsPath, '01_architecture', fileName);
    } else {
      return path.join(context.docsPath, '04_features', fileName);
    }
  }

  generateRecommendations(findings, context) {
    const recommendations = [];
    
    if (findings.misplaced_files.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Organize misplaced documentation',
        description: `Move ${findings.misplaced_files.length} files to appropriate locations`,
        commands: findings.misplaced_files.map(f => 
          `mkdir -p "${path.dirname(f.suggested_location)}" && mv "${f.current_location}" "${f.suggested_location}"`
        )
      });
    }
    
    if (findings.missing_structure.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Create standard documentation structure',
        description: `Create ${findings.missing_structure.length} missing directories`,
        commands: findings.missing_structure.map(s => `mkdir -p "${s.expected_path}"`)
      });
    }
    
    recommendations.push({
      priority: 'low',
      action: 'Add documentation metadata headers',
      description: 'Ensure all documentation includes required metadata',
      commands: ['node scripts/add-doc-metadata.js']
    });
    
    return recommendations;
  }

  calculateHealthScore(findings, totalFiles) {
    let score = 100;
    
    // Deduct points for issues
    score -= findings.misplaced_files.length * 10; // 10 points per misplaced file
    score -= findings.missing_structure.length * 5; // 5 points per missing directory
    score -= findings.broken_links.length * 3; // 3 points per broken link
    score -= findings.outdated_docs.length * 2; // 2 points per outdated doc
    score -= findings.missing_metadata.length * 1; // 1 point per missing metadata
    
    return Math.max(0, score);
  }

  /**
   * Auto-Organize Documentation
   * Automatically moves files to correct locations
   */
  async autoOrganizeDocumentation(contextName = 'current', dryRun = true) {
    const audit = await this.auditDocumentationOrganization(contextName);
    const context = this.applicationContexts.get(contextName);
    
    console.log(`🤖 ${dryRun ? 'Simulating' : 'Executing'} auto-organization for ${context.name}`);
    
    const actions = [];
    
    // Create missing directories
    for (const missing of audit.findings.missing_structure) {
      if (!dryRun) {
        await fs.mkdir(missing.expected_path, { recursive: true });
      }
      actions.push(`📁 Create directory: ${missing.directory}`);
    }
    
    // Move misplaced files
    for (const misplaced of audit.findings.misplaced_files) {
      if (!dryRun) {
        await fs.mkdir(path.dirname(misplaced.suggested_location), { recursive: true });
        await fs.rename(misplaced.current_location, misplaced.suggested_location);
      }
      actions.push(`📄 Move ${misplaced.file} → ${path.relative(context.root, misplaced.suggested_location)}`);
    }
    
    // Create documentation index if missing
    const indexPath = path.join(context.docsPath, 'README.md');
    try {
      await fs.access(indexPath);
    } catch (e) {
      if (!dryRun) {
        const indexContent = this.generateDocumentationIndex(context);
        await fs.writeFile(indexPath, indexContent);
      }
      actions.push('📋 Create documentation index: docs/README.md');
    }
    
    return {
      context: context.name,
      dry_run: dryRun,
      actions_taken: actions.length,
      actions: actions,
      new_health_score: dryRun ? 'N/A (dry run)' : await this.calculateHealthScore((await this.auditDocumentationOrganization(contextName)).findings, audit.findings.misplaced_files.length)
    };
  }

  generateDocumentationIndex(context) {
    const structure = this.getDocumentationStructure(context.name);
    
    return `# ${context.name} Documentation

## Overview
This directory contains all documentation for ${context.name}, a ${context.type.replace('-', ' ')}.

${context.documentationFocus ? `
## Documentation Focus
${context.documentationFocus.map(focus => `- ${focus}`).join('\n')}
` : ''}

## Documentation Structure

${Object.entries(structure).map(([dir, desc]) => 
  `- **${dir}**: ${desc}`
).join('\n')}

## Quick Links
- [Architecture Overview](01_architecture/README.md)
- [API Reference](02_api/README.md)
- [Getting Started Guide](03_guides/getting-started.md)
- [Feature Documentation](04_features/README.md)

## Metadata
- **Application Type**: ${context.type}
- **Technology**: ${context.technology || 'Multiple'}
- **Documentation Standard**: EHG Documentation v1.0
- **Last Updated**: ${new Date().toISOString().split('T')[0]}
- **Maintained By**: Documentation Sub-Agent

---

*This index is automatically maintained by the Documentation Sub-Agent*
*For documentation standards, see: [DOCUMENTATION_STANDARDS.md](../DOCUMENTATION_STANDARDS.md)*
`;
  }

  /**
   * Cross-Application Documentation Linking
   * Creates intelligent links between related documentation
   */
  async generateCrossApplicationLinks() {
    const links = new Map();
    
    for (const [contextName, context] of this.applicationContexts) {
      if (contextName === 'current') continue;
      
      // Find documentation that might reference other applications
      const mdFiles = await this.findMarkdownFiles(context.docsPath || context.root);
      
      for (const file of mdFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          
          // Look for references to other applications
          for (const [otherContextName, otherContext] of this.applicationContexts) {
            if (otherContextName !== contextName && otherContextName !== 'current') {
              if (content.includes(otherContext.name) || 
                  content.includes(otherContextName)) {
                
                const linkKey = `${contextName}->${otherContextName}`;
                if (!links.has(linkKey)) {
                  links.set(linkKey, []);
                }
                
                links.get(linkKey).push({
                  source_file: path.relative(context.root, file),
                  target_app: otherContext.name,
                  suggested_link: `../applications/${otherContextName}/docs/README.md`
                });
              }
            }
          }
        } catch (e) {
          // File read error
        }
      }
    }
    
    return Object.fromEntries(links);
  }

  /**
   * Generate Documentation Health Report
   */
  async generateHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      contexts: {}
    };
    
    for (const [contextName, context] of this.applicationContexts) {
      if (contextName === 'current') continue;
      
      try {
        const audit = await this.auditDocumentationOrganization(contextName);
        report.contexts[contextName] = {
          type: context.type,
          health_score: audit.health_score,
          issues: {
            misplaced_files: audit.findings.misplaced_files.length,
            missing_structure: audit.findings.missing_structure.length,
            total_recommendations: audit.recommendations.length
          }
        };
      } catch (e) {
        report.contexts[contextName] = {
          type: context.type,
          health_score: 0,
          error: e.message
        };
      }
    }
    
    // Calculate overall health
    const scores = Object.values(report.contexts)
      .filter(c => typeof c.health_score === 'number')
      .map(c => c.health_score);
    
    report.overall_health = scores.length > 0 ? 
      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    
    return report;
  }
}

export default ContextAwareDocumentationAgent;