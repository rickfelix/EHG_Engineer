/**
 * Telemetry module - public exports
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A, 001B
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
