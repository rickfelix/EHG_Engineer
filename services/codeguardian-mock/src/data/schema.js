/**
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {number} repos_count
 */

/**
 * @typedef {'passing'|'failing'|'pending'} ScanStatus
 */

/**
 * @typedef {Object} Repository
 * @property {string} id
 * @property {string} name
 * @property {string} org_id
 * @property {ScanStatus} status
 * @property {string|null} last_scan - ISO 8601 timestamp
 * @property {{critical:number, high:number, medium:number, low:number}} findings
 */

/**
 * @typedef {'critical'|'high'|'medium'|'low'} Severity
 */

/**
 * @typedef {Object} Finding
 * @property {string} id
 * @property {string} repo_id
 * @property {Severity} severity
 * @property {string} title
 * @property {string} file
 * @property {number} line
 * @property {string} description
 */

export const VALID_STATUSES = ['passing', 'failing', 'pending'];
export const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'];

export const REQUIRED_FIELDS = {
  organization: ['id', 'name', 'repos_count'],
  repository: ['id', 'name', 'org_id', 'status', 'findings'],
  finding: ['id', 'repo_id', 'severity', 'title', 'file', 'line', 'description']
};
