#!/usr/bin/env node

/**
 * Sora 2 API Smoke Test
 *
 * ULTRA-SIMPLE connectivity test for SD-VIDEO-VARIANT-001 Phase 0
 *
 * Purpose: Validate we can connect to Sora 2 API and generate ONE video
 *
 * Success Criteria:
 * 1. Authenticate with API
 * 2. Submit 1 video generation job
 * 3. Wait for completion
 * 4. Download video
 *
 * If this script exits 0 (success) → Add API integration to SD scope
 * If this script exits 1 (failure) → Keep manual workflow, defer API to Phase 2
 *
 * Usage:
 *   node scripts/test-sora-api-connection.js
 *
 * Environment Variables Required:
 *   SORA_API_ENDPOINT - API endpoint URL (Azure or OpenAI)
 *   SORA_API_KEY - API authentication key
 *
 * Optional:
 *   AZURE_OPENAI_ENDPOINT - If using Azure OpenAI
 *   AZURE_OPENAI_API_KEY - If using Azure
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SORA_API_ENDPOINT = process.env.SORA_API_ENDPOINT ||
                          process.env.AZURE_OPENAI_ENDPOINT ||
                          'https://api.openai.com/v1';
const SORA_API_KEY = process.env.SORA_API_KEY ||
                     process.env.AZURE_OPENAI_API_KEY;

const TEST_PROMPT = 'A serene sunset over mountains, cinematic style, peaceful atmosphere';
const TEST_DURATION = 15; // seconds
const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_WAIT_TIME_MS = 600000; // 10 minutes

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

/**
 * Make HTTP/HTTPS request (simple wrapper)
 */
function makeRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({
              status: res.statusCode,
              data: data ? JSON.parse(data) : null,
              headers: res.headers
            });
          } catch (err) {
            resolve({
              status: res.statusCode,
              data: data,
              headers: res.headers
            });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Step 1: Authenticate with API
 */
async function authenticate() {
  console.log(`${colors.blue}1. Testing Authentication...${colors.reset}`);

  if (!SORA_API_KEY) {
    console.log(`${colors.red}❌ No API key found${colors.reset}`);
    console.log('   Set SORA_API_KEY or AZURE_OPENAI_API_KEY environment variable');
    return { success: false };
  }

  console.log(`   Endpoint: ${SORA_API_ENDPOINT}`);
  console.log(`   API Key: ${SORA_API_KEY.substring(0, 10)}...`);
  console.log(`${colors.green}✅ Credentials configured${colors.reset}\n`);

  return { success: true };
}

/**
 * Step 2: Submit video generation job
 */
async function submitVideoJob() {
  console.log(`${colors.blue}2. Submitting Video Generation Job...${colors.reset}`);
  console.log(`   Prompt: "${TEST_PROMPT}"`);
  console.log(`   Duration: ${TEST_DURATION} seconds`);

  try {
    // Construct API request
    const endpoint = `${SORA_API_ENDPOINT}/video/generations`;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SORA_API_KEY}`
      }
    };

    const body = {
      prompt: TEST_PROMPT,
      duration: TEST_DURATION,
      model: 'sora-2' // or 'sora-2-pro'
    };

    console.log(`   Sending request to: ${endpoint}`);

    const response = await makeRequest(endpoint, options, body);

    console.log(`${colors.green}✅ Job submitted successfully${colors.reset}`);
    console.log(`   Job ID: ${response.data.id || response.data.job_id || 'N/A'}`);
    console.log('');

    return {
      success: true,
      jobId: response.data.id || response.data.job_id,
      response: response.data
    };

  } catch (error) {
    console.log(`${colors.red}❌ Job submission failed${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    console.log('');

    // Provide helpful debugging info
    if (error.message.includes('401')) {
      console.log(`${colors.yellow}Troubleshooting: Check API key validity${colors.reset}`);
    } else if (error.message.includes('403')) {
      console.log(`${colors.yellow}Troubleshooting: API access may not be granted yet${colors.reset}`);
    } else if (error.message.includes('404')) {
      console.log(`${colors.yellow}Troubleshooting: Check API endpoint URL${colors.reset}`);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Step 3: Poll job status until completion
 */
async function waitForCompletion(jobId) {
  console.log(`${colors.blue}3. Waiting for Video Generation...${colors.reset}`);
  console.log(`   Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log(`   Max wait time: ${MAX_WAIT_TIME_MS / 60000} minutes\n`);

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
    attempts++;

    try {
      const endpoint = `${SORA_API_ENDPOINT}/video/generations/jobs/${jobId}`;
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SORA_API_KEY}`
        }
      };

      const response = await makeRequest(endpoint, options);
      const status = response.data.status;

      console.log(`   Attempt ${attempts}: Status = ${status}`);

      if (status === 'completed' || status === 'succeeded') {
        const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
        console.log(`${colors.green}✅ Video generation complete${colors.reset}`);
        console.log(`   Time elapsed: ${elapsedMinutes} minutes`);
        console.log('');

        return {
          success: true,
          videoUrl: response.data.video_url || response.data.output?.video_url,
          elapsedTimeMs: Date.now() - startTime,
          response: response.data
        };
      }

      if (status === 'failed' || status === 'error') {
        console.log(`${colors.red}❌ Video generation failed${colors.reset}`);
        console.log(`   Error: ${response.data.error || 'Unknown error'}`);
        console.log('');
        return { success: false, error: response.data.error };
      }

      // Still processing, wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    } catch (error) {
      console.log(`${colors.red}❌ Error checking job status${colors.reset}`);
      console.log(`   Error: ${error.message}`);
      console.log('');
      return { success: false, error: error.message };
    }
  }

  // Timeout
  console.log(`${colors.red}❌ Timeout: Video generation took longer than ${MAX_WAIT_TIME_MS / 60000} minutes${colors.reset}`);
  console.log('');
  return { success: false, error: 'Timeout' };
}

/**
 * Step 4: Download generated video
 */
async function downloadVideo(videoUrl) {
  console.log(`${colors.blue}4. Downloading Generated Video...${colors.reset}`);
  console.log(`   URL: ${videoUrl}`);

  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, '..', 'test-outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `sora-smoke-test-${Date.now()}.mp4`);

    // Download video
    const protocol = videoUrl.startsWith('https') ? https : http;

    await new Promise((resolve, reject) => {
      protocol.get(videoUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', reject);
      }).on('error', reject);
    });

    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`${colors.green}✅ Video downloaded successfully${colors.reset}`);
    console.log(`   Path: ${outputPath}`);
    console.log(`   Size: ${fileSizeMB} MB`);
    console.log('');

    return {
      success: true,
      path: outputPath,
      sizeBytes: stats.size
    };

  } catch (error) {
    console.log(`${colors.red}❌ Download failed${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    console.log('');
    return { success: false, error: error.message };
  }
}

/**
 * Main test execution
 */
async function runSmokeTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 SORA 2 API SMOKE TEST');
  console.log('='.repeat(70));
  console.log('SD-VIDEO-VARIANT-001 Phase 0: API Connectivity Validation');
  console.log('='.repeat(70) + '\n');

  // Step 1: Authentication
  const authResult = await authenticate();
  if (!authResult.success) {
    return exitWithFailure('Authentication failed');
  }

  // Step 2: Submit job
  const jobResult = await submitVideoJob();
  if (!jobResult.success) {
    return exitWithFailure('Job submission failed');
  }

  // Step 3: Wait for completion
  const completionResult = await waitForCompletion(jobResult.jobId);
  if (!completionResult.success) {
    return exitWithFailure('Video generation failed');
  }

  // Step 4: Download video
  const downloadResult = await downloadVideo(completionResult.videoUrl);
  if (!downloadResult.success) {
    return exitWithFailure('Video download failed');
  }

  // Success!
  return exitWithSuccess(completionResult, downloadResult);
}

/**
 * Exit with success
 */
function exitWithSuccess(completionResult, downloadResult) {
  console.log('='.repeat(70));
  console.log(`${colors.green}✅ SMOKE TEST PASSED${colors.reset}`);
  console.log('='.repeat(70));
  console.log('');
  console.log('Summary:');
  console.log(`  • Authentication: ${colors.green}✅ Success${colors.reset}`);
  console.log(`  • Job Submission: ${colors.green}✅ Success${colors.reset}`);
  console.log(`  • Video Generation: ${colors.green}✅ Success${colors.reset} (${(completionResult.elapsedTimeMs / 60000).toFixed(1)} min)`);
  console.log(`  • Video Download: ${colors.green}✅ Success${colors.reset} (${(downloadResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('');
  console.log(`${colors.green}Decision: PROCEED with API integration in SD-VIDEO-VARIANT-001${colors.reset}`);
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Update SD scope to include API integration (Phase 2-4)');
  console.log('  2. Add async job queue architecture to PRD');
  console.log('  3. Budget $120 per 20-variant test campaign (API costs)');
  console.log('');
  console.log(`Video location: ${downloadResult.path}`);
  console.log('='.repeat(70) + '\n');

  process.exit(0);
}

/**
 * Exit with failure
 */
function exitWithFailure(reason) {
  console.log('='.repeat(70));
  console.log(`${colors.red}❌ SMOKE TEST FAILED${colors.reset}`);
  console.log('='.repeat(70));
  console.log('');
  console.log(`Reason: ${reason}`);
  console.log('');
  console.log(`${colors.yellow}Decision: DEFER API integration, use manual workflow${colors.reset}`);
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Keep SD scope as-is (out of scope: Direct API)');
  console.log('  2. Proceed with prompt generation only');
  console.log('  3. Users copy prompts to Sora 2 web interface manually');
  console.log('  4. Revisit API integration in 6 months (Q2 2026)');
  console.log('');
  console.log('Troubleshooting:');
  console.log('  • Check API access: Apply for Azure OpenAI preview');
  console.log('  • Verify credentials: Ensure API key is valid');
  console.log('  • Test endpoint: Confirm endpoint URL is correct');
  console.log('='.repeat(70) + '\n');

  process.exit(1);
}

// Run smoke test
runSmokeTest().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  exitWithFailure(`Unexpected error: ${error.message}`);
});
