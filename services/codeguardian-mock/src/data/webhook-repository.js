import { validateWebhook } from './webhook-validator.js';

export class WebhookRepository {
  constructor() {
    this._deliveries = new Map();
    this._pipelineRuns = new Map();
    this._scanEvents = new Map();
  }

  clear() {
    this._deliveries.clear();
    this._pipelineRuns.clear();
    this._scanEvents.clear();
  }

  // Deliveries
  addDelivery(delivery) {
    const { valid, errors } = validateWebhook('delivery', delivery);
    if (!valid) throw new Error(`Invalid delivery: ${errors.join(', ')}`);
    const record = { ...delivery, received_at: delivery.received_at || new Date().toISOString() };
    this._deliveries.set(delivery.id, record);
    return record;
  }

  getDelivery(id) { return this._deliveries.get(id) || null; }

  listDeliveries({ event_type, sd_id, limit, offset } = {}) {
    let results = [...this._deliveries.values()];
    if (event_type) results = results.filter(d => d.event_type === event_type);
    if (sd_id) results = results.filter(d => d.sd_id === sd_id);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  updateDelivery(id, updates) {
    const existing = this._deliveries.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this._deliveries.set(id, updated);
    return updated;
  }

  deleteDelivery(id) {
    return this._deliveries.delete(id);
  }

  // Pipeline Runs
  addPipelineRun(run) {
    const { valid, errors } = validateWebhook('pipeline_run', run);
    if (!valid) throw new Error(`Invalid pipeline run: ${errors.join(', ')}`);
    this._pipelineRuns.set(run.id, { ...run });
    return run;
  }

  getPipelineRun(id) { return this._pipelineRuns.get(id) || null; }

  listPipelineRuns({ sd_id, status, repository_name, limit, offset } = {}) {
    let results = [...this._pipelineRuns.values()];
    if (sd_id) results = results.filter(r => r.sd_id === sd_id);
    if (status) results = results.filter(r => r.status === status);
    if (repository_name) results = results.filter(r => r.repository_name === repository_name);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  updatePipelineRun(id, updates) {
    const existing = this._pipelineRuns.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this._pipelineRuns.set(id, updated);
    return updated;
  }

  deletePipelineRun(id) {
    return this._pipelineRuns.delete(id);
  }

  // Scan Events
  addScanEvent(event) {
    const { valid, errors } = validateWebhook('scan_event', event);
    if (!valid) throw new Error(`Invalid scan event: ${errors.join(', ')}`);
    if (!this._pipelineRuns.has(event.pipeline_run_id)) {
      throw new Error(`Pipeline run not found: ${event.pipeline_run_id}`);
    }
    this._scanEvents.set(event.id, { ...event });
    return event;
  }

  getScanEvent(id) { return this._scanEvents.get(id) || null; }

  listScanEvents({ pipeline_run_id, scan_type, status, limit, offset } = {}) {
    let results = [...this._scanEvents.values()];
    if (pipeline_run_id) results = results.filter(e => e.pipeline_run_id === pipeline_run_id);
    if (scan_type) results = results.filter(e => e.scan_type === scan_type);
    if (status) results = results.filter(e => e.status === status);
    if (offset) results = results.slice(offset);
    if (limit) results = results.slice(0, limit);
    return results;
  }

  // Export/Import
  export() {
    return {
      deliveries: this.listDeliveries(),
      pipelineRuns: this.listPipelineRuns(),
      scanEvents: this.listScanEvents()
    };
  }

  import(data) {
    this.clear();
    (data.deliveries || []).forEach(d => this.addDelivery(d));
    (data.pipelineRuns || []).forEach(r => this.addPipelineRun(r));
    (data.scanEvents || []).forEach(e => this.addScanEvent(e));
  }
}
