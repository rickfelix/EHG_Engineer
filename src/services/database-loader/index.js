/**
 * Database Loader Orchestrator
 * Main entry point that coordinates all database operations
 * Maintains exact same API as original database-loader.js
 */

import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import ConnectionManager from './connections.js';
import StrategicLoaders from './strategic-loaders.js';
import SubmissionsManager from './submissions.js';
import PRReviewsManager from './pr-reviews.js';
import DatabaseUtilities from './utilities.js';
import StatusValidator from '../status-validator.js';
import ProgressCalculator from '../progress-calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

/**
 * DatabaseLoader class - maintains original API
 */
class DatabaseLoader {
  constructor() {
    // Initialize managers
    this.connectionManager = new ConnectionManager();
    this.strategicLoaders = new StrategicLoaders(this.connectionManager);
    this.submissionsManager = new SubmissionsManager(this.connectionManager);
    this.prReviewsManager = new PRReviewsManager(this.connectionManager);
    this.utilities = new DatabaseUtilities();

    // Preserve original properties for compatibility
    this.supabase = null;
    this.isConnected = false;
    this.statusValidator = new StatusValidator();
    this.progressCalculator = new ProgressCalculator();

    // Initialize connection
    this.initializeSupabase();
  }

  initializeSupabase() {
    this.connectionManager.initializeSupabase();
    this.supabase = this.connectionManager.getClient();
    this.isConnected = this.connectionManager.isReady();
  }

  // Strategic Directives methods
  async loadStrategicDirectives() {
    return this.strategicLoaders.loadStrategicDirectives();
  }

  async loadPRDs() {
    return this.strategicLoaders.loadPRDs();
  }

  async loadExecutionSequences() {
    return this.strategicLoaders.loadExecutionSequences();
  }

  extractChecklist(sd) {
    return this.strategicLoaders.extractChecklist(sd);
  }

  combinePRDChecklists(prd) {
    return this.strategicLoaders.combinePRDChecklists(prd);
  }

  generateSDContent(sd) {
    return this.strategicLoaders.generateSDContent(sd);
  }

  generatePRDContent(prd) {
    return this.strategicLoaders.generatePRDContent(prd);
  }

  // Submission methods
  async saveSDIPSubmission(submission) {
    return this.submissionsManager.saveSDIPSubmission(submission);
  }

  async getRecentSDIPSubmissions(limit = 20) {
    return this.submissionsManager.getRecentSDIPSubmissions(limit);
  }

  async updateSubmissionStep(submissionId, stepNumber, stepData) {
    return this.submissionsManager.updateSubmissionStep(submissionId, stepNumber, stepData);
  }

  async saveScreenshot(submissionId, screenshot) {
    return this.submissionsManager.saveScreenshot(submissionId, screenshot);
  }

  async getSubmissionProgress(submissionId) {
    return this.submissionsManager.getSubmissionProgress(submissionId);
  }

  async getSubmissionById(submissionId) {
    return this.submissionsManager.getSubmissionById(submissionId);
  }

  async saveStrategicDirective(sdData) {
    return this.submissionsManager.saveStrategicDirective(sdData);
  }

  // PR Review methods
  async loadPRReviews(limit = 50) {
    return this.prReviewsManager.loadPRReviews(limit);
  }

  async calculatePRMetrics() {
    return this.prReviewsManager.calculatePRMetrics();
  }

  async savePRReview(review) {
    return this.prReviewsManager.savePRReview(review);
  }

  async updatePRMetrics() {
    return this.prReviewsManager.updatePRMetrics();
  }

  // Utility methods
  async updateChecklistItem(documentType, documentId, checklistType, itemIndex, checked) {
    return this.utilities.updateChecklistItem(
      this.supabase,
      documentType,
      documentId,
      checklistType,
      itemIndex,
      checked
    );
  }

  calculatePRDProgress(prd) {
    return this.utilities.calculatePRDProgress(prd);
  }

  startDatabaseWatch(callback, interval = 30000) {
    return this.utilities.startDatabaseWatch(this.supabase, callback, interval);
  }

  generateLovableDevSections(projectType = 'web-app') {
    return this.utilities.generateLovableDevSections(projectType);
  }

  generateAIWorkflowChecklist() {
    return this.utilities.generateAIWorkflowChecklist();
  }

  generateAccessibilityChecklist() {
    return this.utilities.generateAccessibilityChecklist();
  }

  /**
   * Generate enhanced PRD content (preserved for compatibility)
   * This method combines multiple generation functions
   */
  generateEnhancedPRDContent(prd, projectType = 'web-app') {
    const baseContent = this.generatePRDContent(prd);
    const lovableSections = this.generateLovableDevSections(projectType);
    const aiChecklist = this.generateAIWorkflowChecklist();
    const a11yChecklist = this.generateAccessibilityChecklist();

    return `${baseContent}

${lovableSections.designSystem}
${lovableSections.techStack}
${lovableSections.accessibility}

## AI Workflow Checklist
${aiChecklist.map(item => `- ${item.text}`).join('\n')}

## Accessibility Checklist
${a11yChecklist.map(item => `- ${item.text}`).join('\n')}
`;
  }
}

export default DatabaseLoader;