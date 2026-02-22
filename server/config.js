/**
 * Server Configuration
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import DatabaseLoader from '../src/services/database-loader.js';
import LEOVersionDetector from '../src/services/version-detector.js';
import RealtimeDashboard from '../src/services/realtime-dashboard.js';
import { DirectiveEnhancer } from '../src/services/directive-enhancer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
export const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
export const PROJECT_ROOT = path.resolve(__dirname, '..');

// Global WebSocket clients tracking for refresh API
global.wsClients = new Set();

// Simple in-memory cache for AI backlog summaries (1 hour TTL)
export const backlogSummaryCache = new Map();
export const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Initialize components
export const dbLoader = new DatabaseLoader();
export const versionDetector = new LEOVersionDetector();
export const realtimeDashboard = new RealtimeDashboard(dbLoader);

// Initialize OpenAI if API key is provided
export let openai = null;
export let directiveEnhancer = null;

export function initializeOpenAI() {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✅ OpenAI integration enabled');

    // Initialize Directive Enhancement Service
    directiveEnhancer = new DirectiveEnhancer(openai, dbLoader);
    console.log('✅ Directive Enhancement Service enabled');
  } else {
    console.log('⚠️ OpenAI API key not found - AI features will use fallback mode');
  }
  return { openai, directiveEnhancer };
}
