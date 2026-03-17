#!/usr/bin/env node

/**
 * PreExecAnalyzer - Main Orchestrator
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Orchestrate all pre-EXEC analysis modules and store results in PRD metadata
 *
 * Usage: node scripts/pre-exec-analyzer.js <PRD-ID>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PathValidator } from './modules/pre-exec/path-validator.js';
import { FileDiscoveryEngine } from './modules/pre-exec/file-discovery.js';
import { DependencyAnalyzer } from './modules/pre-exec/dependency-analyzer.js';
import { PatternRecognizer } from './modules/pre-exec/pattern-recognizer.js';
import { GuidanceGenerator } from './modules/pre-exec/guidance-generator.js';
import path from 'path';

dotenv.config();

export class PreExecAnalyzer {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    this.version = '1.0.0';
  }

  /**
   * Run complete analysis for a PRD
   * @param {string} prdId - PRD ID to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(prdId) {
    const startTime = Date.now();

    console.log('\n📊 PRE-EXEC ANALYSIS');
    console.log('='.repeat(60));
    console.log(`PRD: ${prdId}`);
    console.log(`Analyzer Version: ${this.version}`);
    console.log('');

    try {
      // Step 1: Fetch PRD from database
      console.log('1️⃣  Fetching PRD from database...');
      const prd = await this.fetchPRD(prdId);
      if (!prd) {
        throw new Error(`PRD not found: ${prdId}`);
      }
      console.log(`   ✅ PRD fetched: ${prd.title}`);

      // Step 2: Determine target application
      console.log('\n2️⃣  Determining target application...');
      const targetApp = await this.determineTargetApplication(prd);
      console.log(`   ✅ Target: ${targetApp.name} (${targetApp.path})`);

      // Step 3: Initialize modules
      console.log('\n3️⃣  Initializing analysis modules...');
      const pathValidator = new PathValidator(targetApp.path);
      const fileDiscovery = new FileDiscoveryEngine(targetApp.path, pathValidator);
      const dependencyAnalyzer = new DependencyAnalyzer();
      const patternRecognizer = new PatternRecognizer();
      const guidanceGenerator = new GuidanceGenerator();
      console.log('   ✅ Modules initialized');

      // Step 4: Discover relevant files
      console.log('\n4️⃣  Discovering relevant files...');
      const prdHints = this.extractPRDHints(prd);
      const discoveredFiles = await fileDiscovery.discover(prdHints);
      console.log('   ✅ Discovered:');
      console.log(`      Primary: ${discoveredFiles.primary.length} files`);
      console.log(`      Tests: ${discoveredFiles.tests.length} files`);
      console.log(`      Configs: ${discoveredFiles.configs.length} files`);

      // Step 5: Analyze dependencies
      console.log('\n5️⃣  Analyzing dependencies...');
      const dependencies = await dependencyAnalyzer.analyze(discoveredFiles.primary);
      console.log('   ✅ Analysis complete:');
      console.log(`      Imports: ${dependencies.imports.length}`);
      console.log(`      Circular risks: ${dependencies.circular_risks.length}`);

      // Step 6: Recognize patterns
      console.log('\n6️⃣  Recognizing code patterns...');
      const patterns = await patternRecognizer.recognize(discoveredFiles.primary);
      console.log('   ✅ Patterns recognized:');
      console.log(`      Naming: ${patterns.naming_convention}`);
      console.log(`      Architecture: ${patterns.architecture_style}`);
      console.log(`      Utilities: ${patterns.existing_utilities.length} found`);

      // Step 7: Generate guidance
      console.log('\n7️⃣  Generating implementation guidance...');
      const guidance = guidanceGenerator.generate(discoveredFiles, patterns, dependencies);
      console.log('   ✅ Guidance generated:');
      console.log(`      Reusable utilities: ${guidance.reusable_utilities.length}`);
      console.log(`      Warnings: ${guidance.avoid_reinventing.length}`);

      // Step 8: Compile results
      console.log('\n8️⃣  Compiling analysis results...');
      const executionTime = Date.now() - startTime;
      const analysisResults = {
        relevant_files: {
          primary: discoveredFiles.primary.map(f => this.getRelativePath(f, targetApp.path)),
          dependencies: [],  // Populated from dependency analysis
          tests: discoveredFiles.tests.map(f => this.getRelativePath(f, targetApp.path)),
          configs: discoveredFiles.configs.map(f => this.getRelativePath(f, targetApp.path))
        },
        dependency_impact: {
          imports: dependencies.imports,
          exports: dependencies.exports,
          circular_risks: dependencies.circular_risks,
          dependency_graph: dependencies.dependency_graph
        },
        code_patterns: {
          naming_convention: patterns.naming_convention,
          existing_utilities: patterns.existing_utilities,
          architecture_style: patterns.architecture_style,
          framework_conventions: patterns.framework_conventions
        },
        implementation_guidance: guidance,
        analysis_metadata: {
          analysis_timestamp: new Date().toISOString(),
          analyzer_version: this.version,
          target_application: targetApp.name,
          execution_time_ms: executionTime
        }
      };

      // Step 9: Store in PRD metadata
      console.log('\n9️⃣  Storing results in PRD metadata...');
      await this.storeResults(prdId, analysisResults);
      console.log('   ✅ Results stored');

      console.log('\n✅ ANALYSIS COMPLETE');
      console.log(`   Execution time: ${executionTime}ms`);
      console.log('='.repeat(60));
      console.log('');

      return analysisResults;

    } catch (error) {
      console.error('\n❌ Analysis failed:', error.message);
      console.error(error.stack);
      throw error;
    }
  }

  /**
   * Fetch PRD from database
   * @param {string} prdId - PRD ID
   * @returns {Promise<Object>} PRD data
   */
  async fetchPRD(prdId) {
    const { data, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Determine target application from PRD
   * @param {Object} prd - PRD data
   * @returns {Promise<Object>} Target app info
   */
  async determineTargetApplication(prd) {
    // Check PRD metadata or SD for target_application
    // Default to EHG business app (most implementations)

    const isEHGEngineerTool = prd.category === 'automation_enhancement' ||
                               prd.title.toLowerCase().includes('leo protocol') ||
                               prd.title.toLowerCase().includes('automation');

    if (isEHGEngineerTool) {
      return {
        name: 'EHG_Engineer',
        path: path.resolve(process.cwd())
      };
    }

    return {
      name: 'EHG',
      path: path.resolve(process.cwd(), '../ehg')
    };
  }

  /**
   * Extract hints from PRD for file discovery
   * @param {Object} prd - PRD data
   * @returns {Object} PRD hints
   */
  extractPRDHints(prd) {
    return {
      functional_requirements: this.parseJSON(prd.functional_requirements),
      system_architecture: this.parseJSON(prd.system_architecture),
      title: prd.title,
      category: prd.category
    };
  }

  /**
   * Parse JSON string or return object
   * @param {string|Object} data - Data to parse
   * @returns {Object} Parsed data
   */
  parseJSON(data) {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return {};
      }
    }
    return data || {};
  }

  /**
   * Get relative path from target application root
   * @param {string} absolutePath - Absolute path
   * @param {string} rootPath - Root path
   * @returns {string} Relative path
   */
  getRelativePath(absolutePath, rootPath) {
    return path.relative(rootPath, absolutePath);
  }

  /**
   * Store analysis results in PRD metadata
   * @param {string} prdId - PRD ID
   * @param {Object} results - Analysis results
   */
  async storeResults(prdId, results) {
    const { error } = await this.supabase
      .from('product_requirements_v2')
      .update({
        metadata: {
          pre_exec_analysis: results
        }
      })
      .eq('id', prdId);

    if (error) throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const prdId = process.argv[2];

  if (!prdId) {
    console.error('Usage: node scripts/pre-exec-analyzer.js <PRD-ID>');
    console.error('Example: node scripts/pre-exec-analyzer.js PRD-SD-XXX-001');
    process.exit(1);
  }

  const analyzer = new PreExecAnalyzer();
  analyzer.analyze(prdId)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export default PreExecAnalyzer;
