/**
 * WorkerScheduler — Manages lifecycle of multiple background workers.
 * Provides start-all, stop-all, health dashboard, and graceful shutdown.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import { BaseWorker } from './base-worker.js';

export class WorkerScheduler {
  constructor() {
    /** @type {Map<string, BaseWorker>} */
    this._workers = new Map();
    this._shutdownHandlers = [];
  }

  /**
   * Register a worker instance.
   * @param {BaseWorker} worker
   */
  register(worker) {
    if (this._workers.has(worker.name)) {
      throw new Error(`Worker "${worker.name}" already registered`);
    }
    this._workers.set(worker.name, worker);
  }

  /** Start all registered workers */
  startAll() {
    for (const worker of this._workers.values()) {
      worker.start();
    }
    console.log(`[scheduler] Started ${this._workers.size} worker(s)`);
  }

  /** Stop all registered workers */
  stopAll() {
    for (const worker of this._workers.values()) {
      worker.stop();
    }
    console.log(`[scheduler] Stopped ${this._workers.size} worker(s)`);
  }

  /** Get health status for all workers */
  healthCheck() {
    const results = {};
    for (const [name, worker] of this._workers) {
      results[name] = worker.health();
    }
    return results;
  }

  /** Get a single worker by name */
  get(name) {
    return this._workers.get(name) ?? null;
  }

  /** List registered worker names */
  list() {
    return [...this._workers.keys()];
  }

  /**
   * Install graceful shutdown handlers (SIGINT, SIGTERM).
   * Call once after registering all workers.
   */
  installShutdownHandlers() {
    const handler = () => {
      console.log('[scheduler] Shutdown signal received');
      this.stopAll();
      for (const fn of this._shutdownHandlers) fn();
      process.exit(0);
    };

    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }

  /** Register an additional cleanup function for shutdown */
  onShutdown(fn) {
    this._shutdownHandlers.push(fn);
  }
}
