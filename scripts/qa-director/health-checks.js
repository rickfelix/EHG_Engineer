/**
 * QA Engineering Director - Health Checks
 * Server health checking utilities
 */

/**
 * Check if dev server is responding on specified port
 * @param {number} port - Port to check (default 5173)
 * @param {number} maxWaitSeconds - Maximum wait time in seconds
 * @returns {Promise<boolean>} - True if server is ready, false otherwise
 */
export async function checkDevServerHealth(port = 5173, maxWaitSeconds = 10) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok || response.status === 404) {
        // Server is responding (even 404 means server is alive)
        return true;
      }
    } catch (_e) {
      // Server not ready yet, wait and retry
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }

  return false;
}
