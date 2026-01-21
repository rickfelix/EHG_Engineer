#!/usr/bin/env node

/**
 * EHG_Engineer Backend API Server
 * SD-ARCH-EHG-007: Backend API + LEO Protocol engine (no standalone UI)
 * All UI is in EHG unified frontend at port 8080
 *
 * REFACTORED: This file now re-exports from the modular structure.
 * Original 2707 LOC split into focused modules (~100-400 LOC each):
 * - server/index.js: Main entry point and server startup
 * - server/config.js: Configuration and initialization
 * - server/state.js: State management (dashboardState, loadState)
 * - server/websocket.js: WebSocket connection handling
 * - server/routes/sdip.js: SDIP/DirectiveLab endpoints
 * - server/routes/backlog.js: EHG Backlog API
 * - server/routes/dashboard.js: Dashboard, SD, PRD, EES routes
 * - server/routes/feedback.js: Feedback promotion routes
 * - server/routes/discovery.js: AI Opportunity Discovery API
 * - server/routes/calibration.js: Calibration API (Sovereign Pipe)
 * - server/routes/testing-campaign.js: Testing Campaign API
 * - server/routes/ventures.js: Ventures API + artifacts
 * - server/routes/v2-apis.js: Venture-scoped routes, naming, financial, content
 *
 * SD-LEO-REFACTOR-SERVER-001: Refactor server.js from 2707 LOC
 */

// Re-export everything from modular structure
export * from './server/index.js';

// Import and run the server
import './server/index.js';
