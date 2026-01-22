#!/usr/bin/env node
/**
 * Update UAT Test Case - TEST-NAV-001 Chairman Console Assessment
 *
 * This file is a thin wrapper that re-exports from the modularized version.
 * See scripts/modules/uat-assessment/ for the implementation.
 *
 * @module update-uat-test-nav-001-assessment
 */

import dotenv from 'dotenv';
dotenv.config();

export { comprehensiveAssessment } from './modules/uat-assessment/assessment-template.js';
export { updateTestCase } from './modules/uat-assessment/update-test-case.js';

import { updateTestCase } from './modules/uat-assessment/update-test-case.js';
updateTestCase().catch(console.error);
