/**
 * Atomic File Write Utility
 * SD-LEO-INFRA-PROTOCOL-FILE-STATE-001
 *
 * Writes files using a write-to-temp-then-rename pattern to prevent
 * corruption from interrupted writes (OOM, power loss, SIGKILL).
 *
 * The rename operation is atomic on the same filesystem for both
 * POSIX (rename(2)) and Windows (MoveFileEx with MOVEFILE_REPLACE_EXISTING).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Write a file atomically by writing to a temporary file first, then renaming.
 *
 * @param {string} filePath - Destination file path
 * @param {string|Buffer} content - Content to write
 * @param {Object} [options] - Options
 * @param {string} [options.encoding='utf-8'] - File encoding (ignored for Buffer content)
 * @param {number} [options.mode=0o644] - File mode/permissions
 * @returns {void}
 * @throws {Error} If write or rename fails
 */
export function writeFileAtomic(filePath, content, options = {}) {
  const { encoding = 'utf-8', mode = 0o644 } = options;

  const dir = path.dirname(filePath);
  const suffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${suffix}.tmp`);

  try {
    // Write to temp file in the same directory (same filesystem = atomic rename)
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(tmpPath, content, { mode });
    } else {
      fs.writeFileSync(tmpPath, content, { encoding, mode });
    }

    // Atomic rename - replaces destination if it exists
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Async version of writeFileAtomic using fs.promises.
 *
 * @param {string} filePath - Destination file path
 * @param {string|Buffer} content - Content to write
 * @param {Object} [options] - Options
 * @param {string} [options.encoding='utf-8'] - File encoding (ignored for Buffer content)
 * @param {number} [options.mode=0o644] - File mode/permissions
 * @returns {Promise<void>}
 * @throws {Error} If write or rename fails
 */
export async function writeFileAtomicAsync(filePath, content, options = {}) {
  const { encoding = 'utf-8', mode = 0o644 } = options;

  const dir = path.dirname(filePath);
  const suffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${suffix}.tmp`);

  try {
    if (Buffer.isBuffer(content)) {
      await fs.promises.writeFile(tmpPath, content, { mode });
    } else {
      await fs.promises.writeFile(tmpPath, content, { encoding, mode });
    }

    await fs.promises.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export default { writeFileAtomic, writeFileAtomicAsync };
