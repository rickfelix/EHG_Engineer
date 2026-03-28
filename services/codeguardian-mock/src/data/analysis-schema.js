/**
 * @typedef {'pending'|'running'|'completed'|'failed'|'cancelled'} AnalysisStatus
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} id
 * @property {string} repository_name
 * @property {string} commit_sha
 * @property {string|null} pr_number
 * @property {string|null} branch
 * @property {AnalysisStatus} status
 * @property {number} total_findings
 * @property {{critical:number, high:number, medium:number, low:number}} severity_summary
 * @property {number|null} quality_score - 0-100 composite score
 * @property {string|null} started_at - ISO 8601
 * @property {string|null} completed_at - ISO 8601
 * @property {string} created_at - ISO 8601
 * @property {Object|null} metadata
 */

/**
 * @typedef {'critical'|'high'|'medium'|'low'|'info'} FindingSeverity
 */

/**
 * @typedef {'vulnerability'|'code_smell'|'bug'|'security_hotspot'|'duplication'} FindingType
 */

/**
 * @typedef {Object} VulnerabilityFinding
 * @property {string} id
 * @property {string} analysis_id
 * @property {FindingSeverity} severity
 * @property {FindingType} finding_type
 * @property {string} title
 * @property {string} file_path
 * @property {number} line_number
 * @property {string} description
 * @property {string|null} rule_id
 * @property {string|null} suggestion
 */

/**
 * @typedef {'latency'|'throughput'|'memory'|'cpu'|'bundle_size'|'test_coverage'} MetricType
 */

/**
 * @typedef {Object} PerformanceMetric
 * @property {string} id
 * @property {string} analysis_id
 * @property {MetricType} metric_type
 * @property {string} name
 * @property {number} value
 * @property {string} unit
 * @property {number|null} threshold
 * @property {boolean} passed
 * @property {string|null} measured_at - ISO 8601
 */

export const VALID_ANALYSIS_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'];
export const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const VALID_FINDING_TYPES = ['vulnerability', 'code_smell', 'bug', 'security_hotspot', 'duplication'];
export const VALID_METRIC_TYPES = ['latency', 'throughput', 'memory', 'cpu', 'bundle_size', 'test_coverage'];

export const REQUIRED_FIELDS = {
  analysis: ['id', 'repository_name', 'commit_sha', 'status'],
  finding: ['id', 'analysis_id', 'severity', 'finding_type', 'title', 'file_path', 'line_number', 'description'],
  metric: ['id', 'analysis_id', 'metric_type', 'name', 'value', 'unit']
};
