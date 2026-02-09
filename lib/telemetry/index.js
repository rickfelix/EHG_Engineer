/**
 * Telemetry module - public exports
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A, 001B, 001C
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

export { analyzeBottlenecks } from './bottleneck-analyzer.js';

export {
  checkStaleness,
  enqueueAnalysis,
  triggerIfStale,
  getLatestFindings,
} from './auto-trigger.js';
