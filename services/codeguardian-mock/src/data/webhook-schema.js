/**
 * @typedef {'push'|'pull_request'|'workflow_run'|'check_suite'|'deployment_status'} EventType
 */

/**
 * @typedef {Object} WebhookDelivery
 * @property {string} id
 * @property {string} delivery_id
 * @property {EventType} event_type
 * @property {Object} payload
 * @property {boolean} signature_valid
 * @property {boolean} processed_successfully
 * @property {string|null} sd_id
 * @property {string} received_at - ISO 8601 timestamp
 * @property {string|null} processed_at - ISO 8601 timestamp
 */

/**
 * @typedef {'queued'|'in_progress'|'completed'|'failure'|'success'} PipelineStatus
 */

/**
 * @typedef {'success'|'failure'|'neutral'|'cancelled'|'skipped'|'timed_out'|'action_required'|null} PipelineConclusion
 */

/**
 * @typedef {Object} PipelineRun
 * @property {string} id
 * @property {string|null} sd_id
 * @property {string} repository_name
 * @property {string} workflow_name
 * @property {string} run_id
 * @property {string|null} commit_sha
 * @property {PipelineStatus} status
 * @property {PipelineConclusion} conclusion
 * @property {string|null} started_at - ISO 8601 timestamp
 * @property {string|null} completed_at - ISO 8601 timestamp
 * @property {Object|null} job_details
 */

/**
 * @typedef {'sast'|'dast'|'dependency'|'secret'|'license'|'container'} ScanType
 */

/**
 * @typedef {'pending'|'running'|'completed'|'failed'} ScanStatus
 */

/**
 * @typedef {Object} ScanEvent
 * @property {string} id
 * @property {string} pipeline_run_id
 * @property {ScanType} scan_type
 * @property {number} findings_count
 * @property {{critical:number, high:number, medium:number, low:number}} severity_summary
 * @property {string|null} started_at - ISO 8601 timestamp
 * @property {string|null} completed_at - ISO 8601 timestamp
 * @property {ScanStatus} status
 */

export const VALID_EVENT_TYPES = ['push', 'pull_request', 'workflow_run', 'check_suite', 'deployment_status'];
export const VALID_PIPELINE_STATUSES = ['queued', 'in_progress', 'completed', 'failure', 'success'];
export const VALID_CONCLUSIONS = ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required'];
export const VALID_SCAN_TYPES = ['sast', 'dast', 'dependency', 'secret', 'license', 'container'];
export const VALID_SCAN_STATUSES = ['pending', 'running', 'completed', 'failed'];

export const REQUIRED_FIELDS = {
  delivery: ['id', 'delivery_id', 'event_type', 'payload', 'signature_valid'],
  pipeline_run: ['id', 'repository_name', 'workflow_name', 'run_id', 'status'],
  scan_event: ['id', 'pipeline_run_id', 'scan_type', 'findings_count', 'status']
};
