/**
 * Telemetry module - public exports
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A
 */

export {
  createTraceContext,
  startSpan,
  endSpan,
  persist,
  getMetrics,
  resetMetrics,
  default as WorkflowTimer,
} from './workflow-timer.js';
