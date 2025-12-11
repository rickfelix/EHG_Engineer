/**
 * LEO Playwright Reporter
 *
 * Custom Playwright reporter that automatically ingests test results
 * into the unified test evidence system.
 *
 * Part of LEO Protocol v4.3.4 - Test Evidence Governance
 *
 * Usage in playwright.config.js:
 * ```
 * reporter: [
 *   ['./lib/reporters/leo-playwright-reporter.js', {
 *     sdId: process.env.SD_ID,
 *     triggeredBy: 'PLAYWRIGHT_REPORTER'
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
 *
 * @module leo-playwright-reporter
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

class LeoPlaywrightReporter {
  constructor(options = {}) {
    this.options = {
      sdId: options.sdId || process.env.SD_ID,
      prdId: options.prdId || process.env.PRD_ID || null,
      triggeredBy: options.triggeredBy || 'PLAYWRIGHT_REPORTER',
      runType: options.runType || 'playwright',
      verbose: options.verbose !== false,
      ...options
    };

    this.startedAt = null;
    this.testResults = [];
    this.suites = [];

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
        }
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
