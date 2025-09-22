/**
 * Timestamp utility functions for consistent date/time formatting
 * @module timestamp
 */

/**
 * Get current timestamp in ISO 8601 format
 * @returns {string} Current timestamp as ISO string
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format a date with custom format string
 * @param {Date|string|number} date - Date to format
 * @param {string} format - Format string (e.g., 'YYYY-MM-DD')
 * @returns {string} Formatted date string
 */
function formatTimestamp(date, format) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  const replacements = {
    'YYYY': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'DD': String(d.getDate()).padStart(2, '0'),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'ss': String(d.getSeconds()).padStart(2, '0'),
    'SSS': String(d.getMilliseconds()).padStart(3, '0')
  };

  let result = format;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  return result;
}

/**
 * Get timestamp for a specific timezone
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York')
 * @returns {string} Timestamp in specified timezone
 */
function getTimestampWithTimezone(timezone) {
  try {
    const date = new Date();
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (error) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

/**
 * Parse a timestamp string to Date object
 * @param {string} timestamp - Timestamp string to parse
 * @returns {Date} Parsed Date object
 */
function parseTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse timestamp: ${timestamp}`);
  }
  return date;
}

// CommonJS exports
module.exports = {
  getTimestamp,
  formatTimestamp,
  getTimestampWithTimezone,
  parseTimestamp
};