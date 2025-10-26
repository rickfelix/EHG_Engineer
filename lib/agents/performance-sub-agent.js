/**
 * Performance Sub-Agent v2 - Refactored with BaseSubAgent
 * Fixes false positives by grouping similar issues
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

class PerformanceSubAgentV2 extends IntelligentBaseSubAgent {
  constructor() {
    super('Performance', '⚡');
    
    // Performance thresholds
    this.thresholds = {
      bundleSize: {
        critical: 10 * 1024 * 1024, // 10MB
        warning: 5 * 1024 * 1024,   // 5MB
        good: 2 * 1024 * 1024        // 2MB
      },
      loadTime: {
        critical: 5000,  // 5s
        warning: 3000,   // 3s
        good: 1500       // 1.5s
      },
      memoryLeak: {
        maxListeners: 10,
        maxArraySize: 10000,
        maxObjectKeys: 1000
      }
    };
    
    // Pattern groups to prevent duplicate reporting
    this.patternGroups = new Map();
  }

  /**
   * Intelligent performance analysis using codebase understanding
   */
  async intelligentAnalyze(basePath, context) {
    console.log(`📊 Intelligent Performance Analysis in: ${basePath}`);
    console.log(`   Framework: ${this.codebaseProfile.framework}, Build Tool: ${this.codebaseProfile.buildTool}`);
    
    // Run different performance checks
    await this.analyzeBundle(basePath);
    await this.analyzeMemoryPatterns(basePath);
    await this.analyzeDOMOperations(basePath);
    await this.analyzeAsyncPatterns(basePath);
    await this.analyzeRenderingPatterns(basePath);
    
    // Group and deduplicate findings
    this.groupSimilarFindings();
    
    console.log(`   Found ${this.patternGroups.size} unique performance patterns`);
  }

  /**
   * Analyze bundle size
   */
  async analyzeBundle(basePath) {
    const distPath = await this.findDistDirectory(basePath);
    if (!distPath) {
      this.metrics.bundleSize = { status: 'SKIPPED', reason: 'No build directory found' };
      return;
    }
    
    try {
      const files = await this.getFilesRecursive(distPath);
      let totalSize = 0;
      const bundles = [];
      
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.css')) {
          const stats = await fs.stat(file);
          totalSize += stats.size;
          
          if (stats.size > 500 * 1024) { // Files over 500KB
            bundles.push({
              file: path.relative(basePath, file),
              size: stats.size
            });
          }
        }
      }
      
      this.metrics.bundleSize = {
        total: totalSize,
        status: this.getBundleStatus(totalSize),
        largeBundles: bundles.slice(0, 5)
      };
      
      if (totalSize > this.thresholds.bundleSize.warning) {
        this.addFinding({
          type: 'LARGE_BUNDLE_SIZE',
          severity: totalSize > this.thresholds.bundleSize.critical ? 'high' : 'medium',
          confidence: 0.95,
          description: `Bundle size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds recommended limit`,
          recommendation: 'Implement code splitting and lazy loading',
          metadata: {
            totalSize,
            threshold: this.thresholds.bundleSize.warning
          }
        });
      }
      
    } catch (error) {
      this.metrics.bundleSize = { status: 'ERROR', error: error.message };
    }
  }

  /**
   * Analyze memory patterns - GROUP similar issues
   */
  async analyzeMemoryPatterns(basePath) {
    const files = await this.getSourceFiles(basePath);
    const memoryIssues = new Map();
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(basePath, file);
        
        // Check for memory leaks patterns
        const patterns = [
          {
            regex: /addEventListener\s*\([^)]+\)\s*(?!.*removeEventListener)/g,
            type: 'EVENT_LISTENER_LEAK',
            description: 'Event listener without cleanup'
          },
          {
            regex: /setInterval\s*\([^)]+\)\s*(?!.*clearInterval)/g,
            type: 'INTERVAL_LEAK',
            description: 'Interval without cleanup'
          },
          {
            regex: /new\s+Array\s*\(\s*\d{5,}\s*\)/g,
            type: 'LARGE_ARRAY_ALLOCATION',
            description: 'Large array pre-allocation'
          }
        ];
        
        for (const pattern of patterns) {
          pattern.regex.lastIndex = 0;
          const matches = content.match(pattern.regex);
          
          if (matches && matches.length > 0) {
            const key = `${pattern.type}-${relativePath}`;
            
            if (!memoryIssues.has(key)) {
              memoryIssues.set(key, {
                type: pattern.type,
                file: relativePath,
                count: matches.length,
                description: pattern.description
              });
            }
          }
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Add grouped findings
    for (const [key, issue] of memoryIssues) {
      if (issue.count >= 3) {
        // Only report if pattern appears multiple times
        this.addFinding({
          type: issue.type,
          severity: 'medium',
          confidence: 0.7,
          file: issue.file,
          description: `${issue.description} (${issue.count} occurrences)`,
          recommendation: 'Add proper cleanup in component unmount or cleanup functions',
          metadata: { occurrences: issue.count }
        });
      }
    }
  }

  /**
   * Analyze DOM operations - GROUP by file
   */
  async analyzeDOMOperations(basePath) {
    const files = await this.getSourceFiles(basePath);
    const domIssuesByFile = new Map();
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(basePath, file);
        
        // Check for DOM manipulation anti-patterns
        const antiPatterns = [
          {
            regex: /for\s*\([^)]*\)\s*\{[^}]*(?:querySelector|getElementById|getElementsBy)[^}]*\}/g,
            type: 'DOM_QUERY_IN_LOOP',
            description: 'DOM queries inside loops'
          },
          {
            regex: /\.innerHTML\s*\+=/g,
            type: 'INCREMENTAL_INNERHTML',
            description: 'Incremental innerHTML updates'
          },
          {
            regex: /style\.\w+\s*=(?![^;]*(?:cssText|className))/g,
            type: 'DIRECT_STYLE_MANIPULATION',
            description: 'Direct style manipulation instead of classes'
          }
        ];
        
        let fileIssues = [];
        
        for (const pattern of antiPatterns) {
          pattern.regex.lastIndex = 0;
          const matches = content.match(pattern.regex);
          
          if (matches && matches.length > 0) {
            fileIssues.push({
              type: pattern.type,
              count: matches.length,
              description: pattern.description
            });
          }
        }
        
        if (fileIssues.length > 0) {
          domIssuesByFile.set(relativePath, fileIssues);
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Create grouped findings by file
    for (const [file, issues] of domIssuesByFile) {
      const totalIssues = issues.reduce((sum, issue) => sum + issue.count, 0);
      
      if (totalIssues >= 5) {
        // Only report files with significant issues
        const issuesSummary = issues.map(i => `${i.type} (${i.count})`).join(', ');
        
        this.addFinding({
          type: 'DOM_PERFORMANCE_ISSUES',
          severity: totalIssues > 20 ? 'high' : 'medium',
          confidence: 0.8,
          file,
          description: `Multiple DOM performance issues: ${issuesSummary}`,
          recommendation: 'Cache DOM queries, batch DOM updates, use CSS classes for styling',
          metadata: { 
            totalIssues,
            breakdown: issues
          }
        });
      }
    }
  }

  /**
   * Analyze async patterns
   */
  async analyzeAsyncPatterns(basePath) {
    const files = await this.getSourceFiles(basePath);
    const asyncIssues = new Map();
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(basePath, file);
        
        // Check for async anti-patterns
        if (/await\s+.*\s+for\s*\(/g.test(content)) {
          const matches = content.match(/await\s+.*\s+for\s*\(/g);
          if (matches && matches.length >= 2) {
            asyncIssues.set(`sequential-await-${relativePath}`, {
              type: 'SEQUENTIAL_AWAIT',
              file: relativePath,
              count: matches.length,
              description: 'Sequential awaits that could be parallelized'
            });
          }
        }
        
        // Check for Promise.all opportunities
        if (/await\s+\w+[^;]*;\s*await\s+\w+/g.test(content)) {
          asyncIssues.set(`promise-all-${relativePath}`, {
            type: 'PARALLELIZABLE_PROMISES',
            file: relativePath,
            description: 'Multiple sequential awaits that could use Promise.all'
          });
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Add findings for significant async issues
    for (const [key, issue] of asyncIssues) {
      this.addFinding({
        type: issue.type,
        severity: 'medium',
        confidence: 0.75,
        file: issue.file,
        description: issue.description,
        recommendation: 'Use Promise.all() or Promise.allSettled() for parallel operations',
        metadata: issue.count ? { occurrences: issue.count } : {}
      });
    }
  }

  /**
   * Analyze React/rendering patterns
   */
  async analyzeRenderingPatterns(basePath) {
    const files = await this.getSourceFiles(basePath, ['.jsx', '.tsx']);
    const renderIssues = new Map();
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(basePath, file);
        
        // Check for React performance issues
        const issues = [];
        
        // Inline functions in render
        if (/(?:onClick|onChange|onSubmit)\s*=\s*\{\s*\([^)]*\)\s*=>/g.test(content)) {
          const matches = content.match(/(?:onClick|onChange|onSubmit)\s*=\s*\{\s*\([^)]*\)\s*=>/g);
          if (matches && matches.length >= 3) {
            issues.push({
              type: 'INLINE_FUNCTIONS',
              count: matches.length,
              description: 'Inline functions cause unnecessary re-renders'
            });
          }
        }
        
        // Missing keys in lists
        if (/\.map\s*\([^)]+\)\s*(?!.*key\s*=)/g.test(content)) {
          issues.push({
            type: 'MISSING_KEYS',
            description: 'Missing keys in list rendering'
          });
        }
        
        if (issues.length > 0) {
          renderIssues.set(relativePath, issues);
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    // Add grouped findings
    for (const [file, issues] of renderIssues) {
      const issuesSummary = issues.map(i => 
        i.count ? `${i.type} (${i.count})` : i.type
      ).join(', ');
      
      this.addFinding({
        type: 'RENDERING_PERFORMANCE',
        severity: 'medium',
        confidence: 0.8,
        file,
        description: `React performance issues: ${issuesSummary}`,
        recommendation: 'Use useCallback/useMemo, add keys to lists, avoid inline functions',
        metadata: { issues }
      });
    }
  }

  /**
   * Group similar findings to reduce noise
   */
  groupSimilarFindings() {
    const grouped = new Map();
    
    for (const finding of this.findings) {
      const key = `${finding.type}-${finding.severity}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          type: finding.type,
          severity: finding.severity,
          files: [],
          totalOccurrences: 0,
          description: finding.description,
          recommendation: finding.recommendation
        });
      }
      
      const group = grouped.get(key);
      group.files.push(finding.file || 'unknown');
      group.totalOccurrences += finding.metadata?.occurrences || 1;
    }
    
    // Replace findings with grouped version
    this.findings = [];
    
    for (const [key, group] of grouped) {
      // Only report patterns that appear in multiple files or have many occurrences
      if (group.files.length >= 2 || group.totalOccurrences >= 5) {
        this.addFinding({
          type: group.type,
          severity: group.severity,
          confidence: 0.85,
          description: `${group.description} (${group.files.length} files, ${group.totalOccurrences} total occurrences)`,
          recommendation: group.recommendation,
          metadata: {
            affectedFiles: group.files.length,
            totalOccurrences: group.totalOccurrences,
            sampleFiles: group.files.slice(0, 3)
          }
        });
        
        this.patternGroups.set(key, group);
      }
    }
  }

  // Helper methods

  async findDistDirectory(basePath) {
    const possiblePaths = ['dist', 'build', '.next', 'out'];
    
    for (const dir of possiblePaths) {
      const fullPath = path.join(basePath, dir);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return fullPath;
        }
      } catch {
        // Directory doesn't exist
      }
    }
    
    return null;
  }

  async getFilesRecursive(dir) {
    const files = [];
    
    async function scan(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }
    
    await scan(dir);
    return files;
  }

  getBundleStatus(size) {
    if (size > this.thresholds.bundleSize.critical) return 'CRITICAL';
    if (size > this.thresholds.bundleSize.warning) return 'WARNING';
    if (size > this.thresholds.bundleSize.good) return 'ACCEPTABLE';
    return 'GOOD';
  }

  /**
   * Override base class to provide performance-specific recommendations
   */
  generateRecommendations() {
    const recommendations = super.generateRecommendations();
    
    // Add performance-specific recommendations
    if (this.metrics.bundleSize?.status === 'CRITICAL') {
      recommendations.unshift({
        title: 'Implement Code Splitting',
        description: 'Bundle size is critically large. Implement dynamic imports and lazy loading.',
        impact: 'CRITICAL',
        effort: 'MEDIUM'
      });
    }
    
    if (this.patternGroups.has('DOM_PERFORMANCE_ISSUES-high')) {
      recommendations.unshift({
        title: 'Optimize DOM Operations',
        description: 'Multiple DOM performance issues detected. Batch updates and cache queries.',
        impact: 'HIGH',
        effort: 'SMALL'
      });
    }
    
    return recommendations.slice(0, 5);
  }
}

export default PerformanceSubAgentV2;