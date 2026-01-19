/**
 * UAT Feedback Saver
 *
 * Auto-saves raw user feedback to markdown files during UAT sessions.
 * This ensures no feedback is lost even if the session ends unexpectedly.
 *
 * Created as part of SD-UAT-WORKFLOW-001 - UAT-to-SD Workflow Process Improvements
 *
 * @module lib/uat/feedback-saver
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Directory where UAT session files are stored
 */
const UAT_SESSIONS_DIR = 'uat-sessions';

/**
 * Ensures the UAT sessions directory exists
 * @returns {Promise<string>} The absolute path to the sessions directory
 */
async function ensureSessionsDir() {
  const sessionsPath = path.resolve(process.cwd(), UAT_SESSIONS_DIR);
  try {
    await fs.mkdir(sessionsPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  return sessionsPath;
}

/**
 * Generates the filename for a raw feedback file
 * @param {string} sdKey - The SD key (e.g., 'SD-UAT-NAV-001')
 * @param {Date} [date] - The date for the filename (defaults to now)
 * @returns {string} The filename (e.g., 'SD-UAT-NAV-001_2026-01-19_raw-feedback.md')
 */
function generateFilename(sdKey, date = new Date()) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${sdKey}_${dateStr}_raw-feedback.md`;
}

/**
 * Saves raw feedback to a markdown file
 *
 * @param {string} sdKey - The SD key being tested
 * @param {string} rawText - The raw user feedback (verbatim)
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.testNumber] - The test number (e.g., '1', '2')
 * @param {string} [options.testTitle] - The test title (e.g., 'Verify Sidebar Menu Navigation')
 * @param {Date} [options.timestamp] - The timestamp for the feedback
 * @param {boolean} [options.append] - Whether to append to existing file (default: true)
 * @returns {Promise<{success: boolean, filePath: string, error?: string}>}
 */
export async function saveRawFeedback(sdKey, rawText, options = {}) {
  const {
    testNumber,
    testTitle,
    timestamp = new Date(),
    append = true
  } = options;

  try {
    const sessionsPath = await ensureSessionsDir();
    const filename = generateFilename(sdKey, timestamp);
    const filePath = path.join(sessionsPath, filename);

    // Build the content block
    let content = '';

    // Check if file exists and we're not appending
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    // Add header if new file
    if (!fileExists) {
      content += '# UAT Session Raw Feedback\n';
      content += `**SD**: ${sdKey}\n`;
      content += `**Date**: ${timestamp.toISOString().split('T')[0]}\n`;
      content += '**Tester**: User (Manual)\n\n';
      content += '---\n\n';
    }

    // Add test header if test info provided
    if (testNumber || testTitle) {
      const testHeader = testNumber ? `## Test ${testNumber}` : '## Test';
      content += testHeader;
      if (testTitle) {
        content += `: ${testTitle}`;
      }
      content += '\n\n';
    }

    // Add timestamp and raw feedback
    content += '### Raw User Feedback (verbatim)\n';
    content += `*Captured: ${timestamp.toISOString()}*\n\n`;
    content += `> ${rawText.replace(/\n/g, '\n> ')}\n\n`;
    content += '---\n\n';

    // Write or append to file
    if (append && fileExists) {
      await fs.appendFile(filePath, content, 'utf8');
    } else {
      await fs.writeFile(filePath, content, 'utf8');
    }

    return {
      success: true,
      filePath: filePath
    };
  } catch (error) {
    return {
      success: false,
      filePath: '',
      error: error.message
    };
  }
}

/**
 * Appends processed observations/defects to the raw feedback file
 *
 * @param {string} sdKey - The SD key being tested
 * @param {Object} processed - The processed data
 * @param {Array<Object>} [processed.observations] - Extracted observations
 * @param {Array<Object>} [processed.defects] - Extracted defects
 * @param {string} [processed.result] - Test result (PASS/FAIL/WARN)
 * @param {Date} [timestamp] - The date for the file
 * @returns {Promise<{success: boolean, filePath: string, error?: string}>}
 */
export async function appendProcessedData(sdKey, processed, timestamp = new Date()) {
  try {
    const sessionsPath = await ensureSessionsDir();
    const filename = generateFilename(sdKey, timestamp);
    const filePath = path.join(sessionsPath, filename);

    let content = '';

    // Add result if provided
    if (processed.result) {
      content += `### Result: ${processed.result}\n\n`;
    }

    // Add observations table if provided
    if (processed.observations && processed.observations.length > 0) {
      content += '### Extracted Observations\n\n';
      content += '| Item | Result | Notes |\n';
      content += '|------|--------|-------|\n';
      for (const obs of processed.observations) {
        content += `| ${obs.item || '-'} | ${obs.result || '-'} | ${obs.notes || '-'} |\n`;
      }
      content += '\n';
    }

    // Add defects table if provided
    if (processed.defects && processed.defects.length > 0) {
      content += '### Defects Extracted\n\n';
      content += '| ID | Title | Severity | Type | Description |\n';
      content += '|----|-------|----------|------|-------------|\n';
      for (const def of processed.defects) {
        content += `| ${def.id || '-'} | ${def.title || '-'} | ${def.severity || '-'} | ${def.type || '-'} | ${def.description || '-'} |\n`;
      }
      content += '\n';
    }

    content += '---\n\n';

    // Append to file
    await fs.appendFile(filePath, content, 'utf8');

    return {
      success: true,
      filePath: filePath
    };
  } catch (error) {
    return {
      success: false,
      filePath: '',
      error: error.message
    };
  }
}

/**
 * Gets the path to the raw feedback file for an SD on a given date
 *
 * @param {string} sdKey - The SD key
 * @param {Date} [date] - The date (defaults to today)
 * @returns {string} The file path
 */
export function getRawFeedbackPath(sdKey, date = new Date()) {
  const sessionsPath = path.resolve(process.cwd(), UAT_SESSIONS_DIR);
  const filename = generateFilename(sdKey, date);
  return path.join(sessionsPath, filename);
}

export default {
  saveRawFeedback,
  appendProcessedData,
  getRawFeedbackPath
};
