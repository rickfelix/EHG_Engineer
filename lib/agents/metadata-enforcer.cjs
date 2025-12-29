/**
 * Metadata Enforcer
 *
 * Enforces size limits on metadata to prevent storage bloat.
 * Provides truncation logic with deterministic ordering.
 *
 * @module lib/agents/metadata-enforcer
 */

const { METADATA_LIMITS } = require('./audit-config.cjs');

/**
 * Enforce metadata size limits
 *
 * @param {Object} metadata - Metadata object to enforce limits on
 * @param {Object} limits - Custom limits (defaults to METADATA_LIMITS)
 * @returns {Object} Metadata with size limits enforced
 */
function enforceMetadataLimits(metadata, limits = METADATA_LIMITS) {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  const size = getByteSize(metadata);
  if (size <= limits.maxTotalBytes) {
    return {
      ...metadata,
      _size_bytes: size
    };
  }

  // Need to truncate - start with copy
  const result = JSON.parse(JSON.stringify(metadata));

  // Truncate in order until under limit
  for (const field of limits.truncationOrder) {
    if (result[field]) {
      const fieldSize = getByteSize(result[field]);
      const maxFieldSize = limits.maxPerFieldBytes[field] || limits.maxPerFieldBytes['other'];

      if (fieldSize > maxFieldSize) {
        result[field] = truncateField(result[field], maxFieldSize);
        result[`_${field}_truncated`] = true;
        result[`_${field}_original_size`] = fieldSize;
      }
    }

    // Check if we're under limit now
    if (getByteSize(result) <= limits.maxTotalBytes) {
      break;
    }
  }

  // If still over limit, remove fields in truncation order
  if (getByteSize(result) > limits.maxTotalBytes) {
    for (const field of limits.truncationOrder) {
      if (result[field]) {
        const originalSize = getByteSize(result[field]);
        result[field] = null;
        result[`_${field}_removed`] = true;
        result[`_${field}_original_size`] = originalSize;
      }

      if (getByteSize(result) <= limits.maxTotalBytes) {
        break;
      }
    }
  }

  result._size_bytes = getByteSize(result);
  result._size_enforced = true;

  return result;
}

/**
 * Get byte size of an object (JSON stringified)
 * @param {*} obj - Object to measure
 * @returns {number} Size in bytes
 */
function getByteSize(obj) {
  if (obj === null || obj === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/**
 * Truncate a field to fit within size limit
 * @param {*} value - Value to truncate
 * @param {number} maxSize - Maximum size in bytes
 * @returns {*} Truncated value
 */
function truncateField(value, maxSize) {
  if (value === null || value === undefined) return value;

  const currentSize = getByteSize(value);
  if (currentSize <= maxSize) return value;

  // Handle different types
  if (Array.isArray(value)) {
    return truncateArray(value, maxSize);
  }

  if (typeof value === 'object') {
    return truncateObject(value, maxSize);
  }

  if (typeof value === 'string') {
    return truncateString(value, maxSize);
  }

  // For other types, just return as-is or null if too large
  return currentSize > maxSize ? null : value;
}

/**
 * Truncate an array to fit within size limit
 * @param {Array} arr - Array to truncate
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Array} Truncated array
 */
function truncateArray(arr, maxSize) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;

  let result = [...arr];

  // Remove items from end until under limit
  while (result.length > 0 && getByteSize(result) > maxSize) {
    result.pop();
  }

  // If still too large with single item, truncate that item
  if (result.length === 1 && getByteSize(result) > maxSize) {
    result[0] = truncateField(result[0], maxSize - 10); // Leave room for array brackets
  }

  return result;
}

/**
 * Truncate an object to fit within size limit
 * @param {Object} obj - Object to truncate
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Object} Truncated object
 */
function truncateObject(obj, maxSize) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  const keys = Object.keys(obj);

  // Priority fields to keep (commonly important)
  const priorityFields = ['id', 'name', 'type', 'status', 'code', 'message', 'summary'];

  // Sort keys: priority fields first, then alphabetically
  const sortedKeys = keys.sort((a, b) => {
    const aPriority = priorityFields.indexOf(a);
    const bPriority = priorityFields.indexOf(b);

    if (aPriority >= 0 && bPriority >= 0) return aPriority - bPriority;
    if (aPriority >= 0) return -1;
    if (bPriority >= 0) return 1;
    return a.localeCompare(b);
  });

  // Add fields until we hit the limit
  for (const key of sortedKeys) {
    result[key] = obj[key];

    if (getByteSize(result) > maxSize) {
      // Remove the field we just added
      delete result[key];

      // Try truncating the value
      const truncatedValue = truncateField(obj[key], maxSize / 2);
      if (truncatedValue !== null) {
        result[key] = truncatedValue;
        if (getByteSize(result) > maxSize) {
          delete result[key];
        }
      }
    }
  }

  return result;
}

/**
 * Truncate a string to fit within size limit
 * @param {string} str - String to truncate
 * @param {number} maxSize - Maximum size in bytes
 * @returns {string} Truncated string
 */
function truncateString(str, maxSize) {
  if (typeof str !== 'string') return str;

  // Account for JSON quotes
  const effectiveMax = maxSize - 2;
  if (effectiveMax <= 0) return '';

  let result = str;

  // Binary search for correct length
  while (Buffer.byteLength(result, 'utf8') > effectiveMax && result.length > 0) {
    // Remove ~10% each iteration for efficiency
    const removeCount = Math.max(1, Math.floor(result.length * 0.1));
    result = result.slice(0, -removeCount);
  }

  if (result !== str) {
    result += '...[truncated]';
  }

  return result;
}

/**
 * Validate metadata size
 * @param {Object} metadata - Metadata to validate
 * @param {Object} limits - Size limits
 * @returns {Object} Validation result
 */
function validateMetadataSize(metadata, limits = METADATA_LIMITS) {
  const size = getByteSize(metadata);
  const isValid = size <= limits.maxTotalBytes;

  const fieldSizes = {};
  if (metadata && typeof metadata === 'object') {
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith('_')) {
        fieldSizes[key] = getByteSize(value);
      }
    }
  }

  return {
    valid: isValid,
    totalSize: size,
    maxSize: limits.maxTotalBytes,
    overflow: isValid ? 0 : size - limits.maxTotalBytes,
    fieldSizes
  };
}

/**
 * Get metadata size summary for logging
 * @param {Object} metadata - Metadata to summarize
 * @returns {Object} Size summary
 */
function getMetadataSizeSummary(metadata) {
  if (!metadata) return { total: 0, fields: {} };

  const fields = {};
  let total = 0;

  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith('_')) {
      const size = getByteSize(value);
      fields[key] = size;
      total += size;
    }
  }

  return {
    total: getByteSize(metadata),
    fields,
    largestField: Object.entries(fields).sort((a, b) => b[1] - a[1])[0] || null
  };
}

module.exports = {
  enforceMetadataLimits,
  getByteSize,
  truncateField,
  truncateArray,
  truncateObject,
  truncateString,
  validateMetadataSize,
  getMetadataSizeSummary
};
