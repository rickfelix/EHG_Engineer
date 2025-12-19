/**
 * LEO Playwright Reporter
 *
 * Custom Playwright reporter that automatically ingests test results
 * into the unified test evidence system.
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * Features (v4.4):
 * - Automatic evidence pack manifest generation
 * - Automatic cleanup of passing test traces
 * - Full artifact hashing and integrity verification
 *
 * Usage in playwright.config.js:
 * ```
 * reporter: [
 *   ['./lib/reporters/leo-playwright-reporter.js', {
 *     sdId: process.env.SD_ID,
 *     triggeredBy: 'PLAYWRIGHT_REPORTER',
 *     // LEO v4.4 options
 *     generateEvidencePack: true,     // Auto-generate evidence manifest
 *     cleanupPassingTraces: true,     // Auto-cleanup passing test traces
 *     cleanupMaxAgeDays: 7,           // Retention for failed traces
 *   }],
 *   ['html'],
 *   ['json', { outputFile: 'test-results/results.json' }]
 * ]
 * ```
 *
 * Environment variables:
 * - SD_ID: Required - The Strategic Directive ID for this test run
 * - SUPABASE_URL: Required - Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Required - Service role key for DB writes
 * - PRD_ID: Optional - The PRD ID if known
 * - LEO_EVIDENCE_PACK: Optional - Set to 'true' to enable evidence pack generation
 * - LEO_CLEANUP_TRACES: Optional - Set to 'true' to enable automatic cleanup
 *
 * @module leo-playwright-reporter
 */

import crypto from 'crypto';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { generateManifest, saveManifest } from '../evidence/manifest-generator.js';
import { cleanupPassingTraces, formatBytes } from '../evidence/trace-cleanup.js';

class LeoPlaywrightReporter {
  constructor(options = {}) {
    this.options = {
      sdId: options.sdId || process.env.SD_ID,
      prdId: options.prdId || process.env.PRD_ID || null,
      triggeredBy: options.triggeredBy || 'PLAYWRIGHT_REPORTER',
      runType: options.runType || 'playwright',
      verbose: options.verbose !== false,
      // LEO v4.4: Evidence pack and cleanup options
      generateEvidencePack: options.generateEvidencePack ?? (process.env.LEO_EVIDENCE_PACK === 'true'),
      cleanupPassingTraces: options.cleanupPassingTraces ?? (process.env.LEO_CLEANUP_TRACES === 'true'),
      cleanupMaxAgeDays: options.cleanupMaxAgeDays ?? parseInt(process.env.LEO_CLEANUP_MAX_AGE_DAYS || '7', 10),
      testResultsDir: options.testResultsDir || process.env.TEST_RESULTS_DIR || 'test-results',
      ...options
    };

    this.startedAt = null;
    this.testResults = [];
    this.suites = [];
    // LEO v4.4: Track evidence pack info
    this.evidencePackId = null;
    this.evidenceManifest = null;
    this.cleanupStats = null;

    // Validate required config
    if (!this.options.sdId) {
      console.warn('[LEO Reporter] Warning: SD_ID not set. Test evidence will not be ingested.');
      console.warn('[LEO Reporter] Set SD_ID environment variable or pass sdId option.');
    }
  }

  /**
   * Called once before running tests
   */
  onBegin(config, suite) {
    this.startedAt = new Date();
    this.config = config;
    this.rootSuite = suite;

    if (this.options.verbose) {
      console.log('[LEO Reporter] Test run started');
      if (this.options.sdId) {
        console.log(`[LEO Reporter] SD ID: ${this.options.sdId}`);
      }
    }
  }

  /**
   * Called after each test completes
   */
  onTestEnd(test, result) {
    this.testResults.push({
      title: test.title,
      fullTitle: test.titlePath().join(' > '),
      file: test.location?.file,
      line: test.location?.line,
      status: result.status,
      duration: result.duration,
      retryCount: result.retry,
      error: result.error ? {
        message: result.error.message,
        stack: result.error.stack
      } : null,
      annotations: test.annotations || [],
      attachments: result.attachments?.map(a => ({
        name: a.name,
        path: a.path,
        contentType: a.contentType
      })) || []
    });
  }

  /**
   * Called once after all tests have run
   */
  async onEnd(result) {
    const completedAt = new Date();
    const duration = completedAt - this.startedAt;

    if (this.options.verbose) {
      console.log(`[LEO Reporter] Test run completed in ${duration}ms`);
      console.log(`[LEO Reporter] Status: ${result.status}`);
    }

    // LEO v4.4: Generate evidence pack (before cleanup)
    if (this.options.generateEvidencePack) {
      try {
        await this.generateEvidencePack(result);
      } catch (error) {
        console.error('[LEO Reporter] Failed to generate evidence pack:', error.message);
        // Non-blocking - continue with other operations
      }
    }

    // LEO v4.4: Cleanup passing traces (after evidence pack generation)
    if (this.options.cleanupPassingTraces) {
      try {
        this.performCleanup(result);
      } catch (error) {
        console.error('[LEO Reporter] Failed to cleanup traces:', error.message);
        // Non-blocking - continue with other operations
      }
    }

    // Skip ingestion if no SD ID
    if (!this.options.sdId) {
      console.log('[LEO Reporter] Skipping ingestion - no SD_ID configured');
      return;
    }

    // Skip ingestion if database not configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[LEO Reporter] Skipping ingestion - database not configured');
      return;
    }

    try {
      await this.ingestResults(result, completedAt, duration);
    } catch (error) {
      console.error('[LEO Reporter] Failed to ingest test evidence:', error.message);
      // Don't fail the test run due to ingestion errors
    }
  }

  /**
   * LEO v4.4: Generate evidence pack manifest
   *
   * Creates an immutable, hashed manifest of all test artifacts
   * including traces, screenshots, HAR files, and console logs.
   */
  async generateEvidencePack(_result) {
    const testResultsDir = path.resolve(this.options.testResultsDir);

    if (this.options.verbose) {
      console.log('[LEO Reporter] Generating evidence pack...');
      console.log(`[LEO Reporter] Test results directory: ${testResultsDir}`);
    }

    // Generate manifest using manifest-generator
    const manifest = generateManifest(testResultsDir, {
      sdId: this.options.sdId,
      prdId: this.options.prdId,
      triggeredBy: this.options.triggeredBy
    });

    this.evidencePackId = manifest.pack_id;
    this.evidenceManifest = manifest;

    // Save manifest to file
    const manifestPath = path.join(testResultsDir, 'evidence-pack-manifest.json');
    saveManifest(manifest, manifestPath);

    if (this.options.verbose) {
      console.log(`[LEO Reporter] ✅ Evidence pack generated: ${manifest.pack_id}`);
      console.log(`[LEO Reporter]    Artifacts: ${manifest.artifacts.count}`);
      console.log(`[LEO Reporter]    Total size: ${(manifest.artifacts.total_size_bytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[LEO Reporter]    Manifest hash: ${manifest.integrity.manifest_hash.slice(0, 16)}...`);
    }

    return manifest;
  }

  /**
   * LEO v4.4: Perform automatic cleanup of passing test traces
   *
   * Deletes trace files from passing tests to manage storage while
   * preserving traces from failed tests for debugging.
   */
  performCleanup(_result) {
    const testResultsDir = path.resolve(this.options.testResultsDir);

    if (this.options.verbose) {
      console.log('[LEO Reporter] Performing trace cleanup...');
    }

    // Build test results data for smart cleanup
    const testResults = this.testResults.map(t => ({
      file: t.file,
      status: t.status,
      title: t.title
    }));

    // Perform cleanup
    const stats = cleanupPassingTraces({
      testResultsDir,
      testResults,
      maxAgeDays: this.options.cleanupMaxAgeDays,
      dryRun: false,
      verbose: this.options.verbose,
      cleanupPassing: true
    });

    this.cleanupStats = stats;

    if (this.options.verbose) {
      console.log('[LEO Reporter] Cleanup complete');
      console.log('[LEO Reporter]    Traces deleted: ' + stats.tracesDeleted);
      console.log('[LEO Reporter]    Space freed: ' + formatBytes(stats.bytesFreed));
      console.log('[LEO Reporter]    Failed traces kept: ' + stats.failedTracesKept);
    }

    return stats;
  }

  /**
   * Ingests test results into the unified test evidence tables
   */
  async ingestResults(result, completedAt, duration) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Calculate summary
    const passed = this.testResults.filter(t => t.status === 'passed').length;
    const failed = this.testResults.filter(t => t.status === 'failed').length;
    const skipped = this.testResults.filter(t => t.status === 'skipped').length;
    const total = this.testResults.length;

    // Determine verdict
    let verdict;
    if (total === 0) verdict = 'ERROR';
    else if (failed === 0) verdict = 'PASS';
    else if (passed === 0) verdict = 'FAIL';
    else verdict = 'PARTIAL';

    // Build report structure
    const report = {
      version: '1.0',
      config: {
        projects: this.config?.projects?.map(p => ({
          name: p.name,
          use: { baseURL: p.use?.baseURL }
        })) || []
      },
      suites: this.buildSuiteStructure(),
      duration,
      stats: { total, passed, failed, skipped }
    };

    // Compute hash for integrity
    const reportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(report))
      .digest('hex');

    if (this.options.verbose) {
      console.log(`[LEO Reporter] Ingesting ${total} tests (${passed} passed, ${failed} failed)`);
    }

    // 1. Create test_run record
    const { data: testRun, error: runError } = await supabase
      .from('test_runs')
      .insert({
        sd_id: this.options.sdId,
        prd_id: this.options.prdId,
        run_type: this.options.runType,
        triggered_by: this.options.triggeredBy,
        trigger_context: {
          playwright_status: result.status,
          ci: process.env.CI === 'true',
          github_run_id: process.env.GITHUB_RUN_ID
        },
        started_at: this.startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: duration,
        total_tests: total,
        passed_tests: passed,
        failed_tests: failed,
        skipped_tests: skipped,
        verdict,
        raw_report_json: report,
        report_hash: reportHash,
        environment: {
          baseURL: this.config?.projects?.[0]?.use?.baseURL,
          browser: this.config?.projects?.[0]?.name,
          nodeVersion: process.version,
          ci: process.env.CI === 'true'
        },
        // LEO v4.4: Evidence pack info
        evidence_pack_id: this.evidencePackId,
        evidence_manifest: this.evidenceManifest,
        cleanup_stats: this.cleanupStats
      })
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to create test_run: ${runError.message}`);
    }

    console.log(`[LEO Reporter] ✅ Created test_run: ${testRun.id}`);

    // 2. Create test_results records
    const testResultRecords = this.testResults.map(test => ({
      test_run_id: testRun.id,
      test_file_path: test.file,
      test_name: test.title,
      test_full_title: test.fullTitle,
      status: this.normalizeStatus(test.status),
      duration_ms: test.duration,
      error_message: test.error?.message || null,
      error_stack: test.error?.stack || null,
      retry_count: test.retryCount || 0,
      annotations: test.annotations,
      attachments: test.attachments
    }));

    const { data: insertedResults, error: resultsError } = await supabase
      .from('test_results')
      .insert(testResultRecords)
      .select();

    if (resultsError) {
      throw new Error(`Failed to create test_results: ${resultsError.message}`);
    }

    console.log(`[LEO Reporter] ✅ Created ${insertedResults.length} test_results`);

    // 3. Create story_test_mappings if story keys found
    await this.createStoryMappings(supabase, testRun.id, insertedResults);

    return testRun;
  }

  /**
   * Creates story_test_mappings based on story keys in test names
   */
  async createStoryMappings(supabase, testRunId, testResults) {
    const mappings = [];

    for (const result of testResults) {
      const test = this.testResults.find(
        t => t.title === result.test_name && t.file === result.test_file_path
      );
      if (!test) continue;

      const storyKeys = this.extractStoryKeys(test);
      if (storyKeys.length === 0) continue;

      // Look up user stories
      const { data: userStories } = await supabase
        .from('user_stories')
        .select('id, story_key')
        .in('story_key', storyKeys);

      if (userStories && userStories.length > 0) {
        for (const story of userStories) {
          mappings.push({
            user_story_id: story.id,
            test_result_id: result.id,
            test_run_id: testRunId,
            mapping_type: 'annotation_match',
            confidence_score: 1.0,
            story_key_from_test: story.story_key
          });
        }
      }
    }

    if (mappings.length > 0) {
      const { error } = await supabase
        .from('story_test_mappings')
        .insert(mappings);

      if (!error) {
        console.log(`[LEO Reporter] ✅ Created ${mappings.length} story_test_mappings`);
      }
    }
  }

  /**
   * Extracts story keys from test annotations and titles
   */
  extractStoryKeys(test) {
    const patterns = [
      /US-([A-Za-z0-9-]+)/gi,
      /USER-STORY-([A-Za-z0-9-]+)/gi,
      /@story:([A-Za-z0-9-]+)/gi,
      /\[([A-Za-z0-9-]+)\]/g
    ];

    const storyKeys = new Set();
    const searchText = `${test.title} ${test.fullTitle} ${JSON.stringify(test.annotations)}`;

    for (const pattern of patterns) {
      const matches = searchText.matchAll(pattern);
      for (const match of matches) {
        storyKeys.add(match[1].toUpperCase());
      }
    }

    return Array.from(storyKeys);
  }

  /**
   * Normalizes Playwright status to our enum
   */
  normalizeStatus(status) {
    const statusMap = {
      'passed': 'passed',
      'failed': 'failed',
      'skipped': 'skipped',
      'timedOut': 'timedOut',
      'interrupted': 'interrupted'
    };
    return statusMap[status] || 'failed';
  }

  /**
   * Builds suite structure for report
   */
  buildSuiteStructure() {
    const suiteMap = new Map();

    for (const test of this.testResults) {
      const file = test.file || 'unknown';
      if (!suiteMap.has(file)) {
        suiteMap.set(file, {
          title: file,
          file: file,
          specs: []
        });
      }

      suiteMap.get(file).specs.push({
        title: test.title,
        file: test.file,
        tests: [{
          results: [{
            status: test.status,
            duration: test.duration,
            error: test.error,
            attachments: test.attachments
          }]
        }],
        annotations: test.annotations
      });
    }

    return Array.from(suiteMap.values());
  }
}

export default LeoPlaywrightReporter;
