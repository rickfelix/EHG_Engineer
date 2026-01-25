/**
 * Test Handoff Protocol Interface
 * Part of SD-LEO-REFAC-TEST-DEBUG-004
 *
 * Provides structured handoff between testing and debugging agents.
 */

/**
 * Structured Handoff Protocol Interface
 */
export class TestHandoff {
  constructor(testRunId, failures = []) {
    this.testRunId = testRunId || `test-run-${Date.now()}`;
    this.failures = failures;
    this.timestamp = new Date().toISOString();
    this.context = {
      environment: process.env.NODE_ENV || 'development',
      browser: 'chromium',
      platform: process.platform,
      nodeVersion: process.version
    };
    this.artifacts = {
      screenshots: [],
      logs: [],
      har: null,
      videos: []
    };
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  addFailure(failure) {
    this.failures.push({
      id: `failure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      testName: failure.testName,
      error: failure.error,
      stack: failure.stack,
      screenshot: failure.screenshot,
      timestamp: new Date().toISOString(),
      retries: failure.retries || 0
    });
  }

  addArtifact(type, path) {
    if (this.artifacts[type]) {
      if (Array.isArray(this.artifacts[type])) {
        this.artifacts[type].push(path);
      } else {
        this.artifacts[type] = path;
      }
    }
  }

  finalize() {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    return this;
  }
}
