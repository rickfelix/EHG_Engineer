/**
 * LEO WebSocket Event System
 * 
 * Centralized event emission with debouncing
 * Versioned payloads for forward compatibility
 */

import { Server as SocketIOServer } from 'socket.io';
import {
  WSGateUpdatedEventType,
  WSSubAgentStatusEventType,
  WSDriftDetectedEventType
} from '../validation/leo-schemas';

// Global WebSocket server instance
let io: SocketIOServer | null = null;

// Event queue for debouncing
interface QueuedEvent {
  namespace: string;
  event: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

const eventQueue: Map<string, QueuedEvent> = new Map();
const DEBOUNCE_MS = 1000; // 1 second debounce window
let debounceTimer: NodeJS.Timeout | null = null;

// Metrics for observability
const metrics = {
  'leo.gate.updated': 0,
  'leo.subagent.status': 0,
  'leo.drift.detected': 0,
  'leo.events.debounced': 0,
  'leo.events.emitted': 0
};

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: SocketIOServer): void {
  io = server;
  console.log('🔌 WebSocket initialized for LEO events');
  
  // Set up namespaces
  const leoNamespace = io.of('/leo');
  
  leoNamespace.on('connection', (socket) => {
    console.log(`🔗 LEO client connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`🔌 LEO client disconnected: ${socket.id}`);
    });
    
    // Send initial metrics on connect
    socket.emit('metrics', getMetrics());
  });
}

/**
 * Get WebSocket instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit a gate updated event
 */
export function emitGateUpdated(event: Omit<WSGateUpdatedEventType, 'v' | 'ts'>): void {
  const payload: WSGateUpdatedEventType = {
    v: 1,
    ts: new Date().toISOString(),
    ...event,
    passed: event.score >= 83  // B grade minimum (lib/standards/grade-scale.js GRADE.B)
  };
  
  queueEvent('leo/gate:updated', payload, `gate:${event.prd_id}:${event.gate}`);
  metrics['leo.gate.updated']++;
}

/**
 * Emit a sub-agent status event
 */
export function emitSubAgentStatus(event: Omit<WSSubAgentStatusEventType, 'v' | 'ts'>): void {
  const payload: WSSubAgentStatusEventType = {
    v: 1,
    ts: new Date().toISOString(),
    ...event
  };
  
  queueEvent('leo/subagent:status', payload, `agent:${event.prd_id}:${event.agent}`);
  metrics['leo.subagent.status']++;
}

/**
 * Emit a drift detected event
 */
export function emitDriftDetected(event: Omit<WSDriftDetectedEventType, 'v' | 'ts'>): void {
  const payload: WSDriftDetectedEventType = {
    v: 1,
    ts: new Date().toISOString(),
    ...event
  };
  
  queueEvent('leo/drift:detected', payload, `drift:${event.type}`);
  metrics['leo.drift.detected']++;
}

/**
 * Generic emit function (for flexibility)
 */
export function emit(event: string, payload: Record<string, unknown>): void {
  // namespace and eventName are extracted but not used directly - they're passed through queueEvent
  void event.split('/');
  
  // Add version and timestamp if not present
  if (!payload.v) payload.v = 1;
  if (!payload.ts) payload.ts = new Date().toISOString();
  
  queueEvent(event, payload, event);
  
  // Track generic events
  if (!metrics[event]) {
    metrics[event] = 0;
  }
  metrics[event]++;
}

/**
 * Queue an event for debounced emission
 */
function queueEvent(event: string, payload: Record<string, unknown>, key: string): void {
  // Store in queue with deduplication key
  eventQueue.set(key, {
    namespace: event.split('/')[0],
    event: event.split('/')[1] || event,
    payload,
    timestamp: Date.now()
  });
  
  // Reset debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  // Set new timer
  debounceTimer = setTimeout(() => {
    flushEventQueue();
  }, DEBOUNCE_MS);
}

/**
 * Flush the event queue
 */
function flushEventQueue(): void {
  if (eventQueue.size === 0) return;
  
  const eventsToEmit = Array.from(eventQueue.values());
  const deduplicatedCount = eventQueue.size;
  
  // Clear queue
  eventQueue.clear();
  debounceTimer = null;
  
  // Emit all queued events
  for (const event of eventsToEmit) {
    emitNow(event);
  }
  
  // Track debouncing metrics
  if (eventsToEmit.length < deduplicatedCount) {
    metrics['leo.events.debounced'] += (deduplicatedCount - eventsToEmit.length);
  }
  
  console.log(`📡 Flushed ${eventsToEmit.length} WebSocket events (${deduplicatedCount - eventsToEmit.length} debounced)`);
}

/**
 * Emit event immediately (bypasses queue)
 */
function emitNow(event: QueuedEvent): void {
  if (!io) {
    console.warn('⚠️  WebSocket not initialized, event dropped:', event.event);
    return;
  }
  
  const namespace = io.of(`/${event.namespace}`);
  namespace.emit(event.event, event.payload);
  
  metrics['leo.events.emitted']++;
  
  // Log for observability
  console.log(`📡 Emitted: ${event.namespace}/${event.event}`, {
    prd_id: event.payload.prd_id,
    ...(event.payload.gate && { gate: event.payload.gate }),
    ...(event.payload.agent && { agent: event.payload.agent }),
    ...(event.payload.status && { status: event.payload.status }),
    ...(event.payload.score !== undefined && { score: event.payload.score })
  });
}

/**
 * Force flush the queue (for shutdown)
 */
export function forceFlush(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  flushEventQueue();
}

/**
 * Get metrics for monitoring
 */
export function getMetrics(): Record<string, number> {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  Object.keys(metrics).forEach(key => {
    metrics[key] = 0;
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔌 Flushing WebSocket events before shutdown...');
  forceFlush();
});

process.on('SIGINT', () => {
  console.log('🔌 Flushing WebSocket events before shutdown...');
  forceFlush();
});

// Export specific emitters for convenience
export {
  emitGateUpdated as gateUpdated,
  emitSubAgentStatus as subAgentStatus,
  emitDriftDetected as driftDetected
};