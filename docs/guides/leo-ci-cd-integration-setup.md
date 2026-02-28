---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# LEO Protocol GitHub CI/CD Integration Setup Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Architecture](#architecture)
- [1. Database Setup](#1-database-setup)
  - [Run Migration](#run-migration)
  - [Verify Tables Created](#verify-tables-created)
- [2. GitHub Webhook Configuration](#2-github-webhook-configuration)
  - [2.1 Webhook URL Setup](#21-webhook-url-setup)
  - [2.2 GitHub Repository Settings](#22-github-repository-settings)
  - [2.3 Webhook Security](#23-webhook-security)
- [3. LEO Protocol Configuration](#3-leo-protocol-configuration)
  - [3.1 Enable CI/CD Validation](#31-enable-cicd-validation)
  - [3.2 Phase Gate Configuration](#32-phase-gate-configuration)
- [4. Sub-Agent Configuration](#4-sub-agent-configuration)
  - [4.1 DevOps Platform Architect Enhancement](#41-devops-platform-architect-enhancement)
  - [4.2 Automatic Triggers](#42-automatic-triggers)
- [5. API Endpoint Deployment](#5-api-endpoint-deployment)
  - [5.1 Express.js Route (if using Express)](#51-expressjs-route-if-using-express)
  - [5.2 Next.js API Route (if using Next.js)](#52-nextjs-api-route-if-using-nextjs)
  - [5.3 Serverless Function](#53-serverless-function)
- [6. Dashboard Integration](#6-dashboard-integration)
  - [6.1 Add CI/CD Status Component](#61-add-cicd-status-component)
  - [6.2 Real-time Updates](#62-real-time-updates)
- [7. Testing](#7-testing)
  - [7.1 Run Integration Tests](#71-run-integration-tests)
  - [7.2 Test Webhook Processing](#72-test-webhook-processing)
  - [7.3 Test CI/CD Validation](#73-test-cicd-validation)
  - [7.4 Test DevOps Agent](#74-test-devops-agent)
- [8. Monitoring and Troubleshooting](#8-monitoring-and-troubleshooting)
  - [8.1 Webhook Event Logs](#81-webhook-event-logs)
  - [8.2 Pipeline Status Monitoring](#82-pipeline-status-monitoring)
  - [8.3 Failure Resolution Tracking](#83-failure-resolution-tracking)
- [9. Configuration Options](#9-configuration-options)
  - [9.1 Repository Monitoring Settings](#91-repository-monitoring-settings)
  - [9.2 Health Score Thresholds](#92-health-score-thresholds)
  - [9.3 Notification Channels](#93-notification-channels)
- [10. Workflow Examples](#10-workflow-examples)
  - [10.1 Successful Flow](#101-successful-flow)
  - [10.2 Failure Flow](#102-failure-flow)
  - [10.3 Manual Override](#103-manual-override)
- [11. Security Considerations](#11-security-considerations)
  - [11.1 Webhook Security](#111-webhook-security)
  - [11.2 Database Security](#112-database-security)
  - [11.3 Sub-Agent Security](#113-sub-agent-security)
- [12. Performance Optimization](#12-performance-optimization)
  - [12.1 Database Indexing](#121-database-indexing)
  - [12.2 Caching Strategy](#122-caching-strategy)
  - [12.3 Batch Processing](#123-batch-processing)
- [Troubleshooting Common Issues](#troubleshooting-common-issues)
  - [Issue: Webhooks not being received](#issue-webhooks-not-being-received)
  - [Issue: Signature validation failing](#issue-signature-validation-failing)
  - [Issue: EXEC phase always blocked](#issue-exec-phase-always-blocked)
  - [Issue: Sub-agent not triggering](#issue-sub-agent-not-triggering)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, api, testing, migration

## Overview

This guide covers the complete setup of GitHub CI/CD integration with the LEO Protocol, enabling automated pipeline monitoring, failure detection, and resolution workflows.

## Architecture

```
GitHub Actions → Webhook → EHG_Engineer API → LEO Protocol → Sub-Agents → Resolution
```

## 1. Database Setup

### Run Migration
```bash
# From EHG_Engineer root directory
psql $SUPABASE_DB_URL -f database/migrations/leo-ci-cd-integration.sql
```

### Verify Tables Created
- `ci_cd_pipeline_status` - Pipeline run tracking
- `github_webhook_events` - Webhook audit log
- `ci_cd_failure_resolutions` - Failure resolution tracking
- `leo_phase_ci_cd_gates` - LEO phase validation gates
- `ci_cd_monitoring_config` - Repository monitoring configuration

## 2. GitHub Webhook Configuration

### 2.1 Webhook URL Setup

**Production URL:**
```
https://your-ehg-engineer-domain.com/api/webhooks/github-ci-status
```

**Development URL:**
```
http://localhost:3000/api/webhooks/github-ci-status
```

### 2.2 GitHub Repository Settings

For each repository (`rickfelix/ehg`, `rickfelix/EHG_Engineer`):

1. Go to Repository Settings → Webhooks
2. Click "Add webhook"
3. Configure:
   - **Payload URL**: Your webhook endpoint
   - **Content type**: `application/json`
   - **Secret**: Generate secure secret (store in environment)
   - **Events**:
     - ✅ Workflow runs
     - ✅ Check suites
     - ✅ Deployment statuses

### 2.3 Webhook Security

Store webhook secrets in environment variables:
```bash
# .env
GITHUB_WEBHOOK_SECRET_EHG="your-secret-for-ehg-repo"
GITHUB_WEBHOOK_SECRET_EHG_ENGINEER="your-secret-for-engineer-repo"
```

Update database with secret hashes:
```sql
UPDATE ci_cd_monitoring_config
SET webhook_secret_hash = encode(sha256('your-webhook-secret'::bytea), 'hex')
WHERE repository_name = 'rickfelix/ehg';
```

## 3. LEO Protocol Configuration

### 3.1 Enable CI/CD Validation

The LEO orchestrator now automatically includes CI/CD validation in all phases:

- **LEAD**: Informational CI/CD status
- **PLAN**: CI/CD configuration warnings
- **EXEC**: **BLOCKING** - requires passing pipelines
- **VERIFICATION**: **BLOCKING** - all pipelines must pass
- **APPROVAL**: CI/CD readiness checks

### 3.2 Phase Gate Configuration

Configure validation thresholds in database:
```sql
INSERT INTO leo_validation_rules (rule_name, rule_type, severity, description, validation_logic)
VALUES
('ci_cd_pipeline_success', 'exec_gate', 'critical', 'All CI/CD pipelines must pass',
 '{"check": "pipeline_status", "required_status": "success", "min_health_score": 90}'),
('ci_cd_no_active_failures', 'verification_gate', 'critical', 'No active failures in VERIFICATION',
 '{"check": "active_failures", "max_failures": 0}');
```

## 4. Sub-Agent Configuration

### 4.1 DevOps Platform Architect Enhancement

The enhanced DevOps Platform Architect automatically:
- Analyzes CI/CD failures by category
- Attempts automated resolution
- Schedules pipeline retries
- Escalates complex issues

### 4.2 Automatic Triggers

Sub-agent triggers on:
- Pipeline failure events (webhook)
- EXEC phase validation failures
- Health score drops below threshold
- Multiple consecutive failures

## 5. API Endpoint Deployment

### 5.1 Express.js Route (if using Express)
```javascript
// server.js
import { handleGitHubWebhook } from './api/webhooks/github-ci-status.js';

app.post('/api/webhooks/github-ci-status', handleGitHubWebhook);
```

### 5.2 Next.js API Route (if using Next.js)
```javascript
// pages/api/webhooks/github-ci-status.js
import { handleGitHubWebhook } from '../../../api/webhooks/github-ci-status.js';
export default handleGitHubWebhook;
```

### 5.3 Serverless Function
```javascript
// netlify/functions/github-webhook.js
import { handleGitHubWebhook } from '../../api/webhooks/github-ci-status.js';
export const handler = handleGitHubWebhook;
```

## 6. Dashboard Integration

### 6.1 Add CI/CD Status Component

```tsx
// In your LEO dashboard
import CIPipelineStatus from '@/components/leo/CIPipelineStatus';

// For specific SD
<CIPipelineStatus sdId="SD-016" />

// For all SDs
<CIPipelineStatus showAllSDs={true} />
```

### 6.2 Real-time Updates

Enable Supabase real-time subscriptions:
```javascript
const subscription = supabase
  .channel('ci-cd-updates')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ci_cd_pipeline_status' },
      (payload) => {
        // Update UI with new pipeline status
      })
  .subscribe();
```

## 7. Testing

### 7.1 Run Integration Tests
```bash
# From EHG_Engineer root directory
node scripts/test-leo-ci-cd-integration.js
```

### 7.2 Test Webhook Processing
```bash
# Simulate webhook event
curl -X POST http://localhost:3000/api/webhooks/github-ci-status \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: workflow_run" \
  -d @test-webhook-payload.json
```

### 7.3 Test CI/CD Validation
```bash
node scripts/leo-ci-cd-validator.js SD-016 EXEC
```

### 7.4 Test DevOps Agent
```bash
node scripts/devops-platform-architect-enhanced.js SD-016
```

## 8. Monitoring and Troubleshooting

### 8.1 Webhook Event Logs
```sql
-- Check recent webhook events
SELECT * FROM github_webhook_events
ORDER BY received_at DESC
LIMIT 10;

-- Check processing errors
SELECT * FROM github_webhook_events
WHERE processed_successfully = false;
```

### 8.2 Pipeline Status Monitoring
```sql
-- Get CI/CD status for SD
SELECT * FROM get_sd_ci_cd_status('SD-016');

-- Check phase gate status
SELECT * FROM leo_phase_ci_cd_gates
WHERE sd_id = 'SD-016';
```

### 8.3 Failure Resolution Tracking
```sql
-- Check automated resolutions
SELECT * FROM ci_cd_failure_resolutions
WHERE auto_resolution_attempted = true;

-- Check manual interventions needed
SELECT * FROM ci_cd_failure_resolutions
WHERE manual_intervention_required = true
AND resolved_at IS NULL;
```

## 9. Configuration Options

### 9.1 Repository Monitoring Settings
```sql
-- Enable/disable monitoring per repository
UPDATE ci_cd_monitoring_config
SET monitoring_enabled = true,
    auto_retry_enabled = true,
    max_auto_retries = 3
WHERE repository_name = 'rickfelix/ehg';
```

### 9.2 Health Score Thresholds
```javascript
// In LEOCICDValidator
this.requiredHealthScore = 90;  // EXEC phase minimum
this.maxFailureAge = 24 * 60 * 60 * 1000;  // 24 hours
this.retryLimit = 3;  // Max auto retries
```

### 9.3 Notification Channels
```sql
-- Configure notification preferences
UPDATE ci_cd_monitoring_config
SET failure_notification_channels = '["slack", "email"]'::jsonb,
    escalation_threshold_minutes = 30
WHERE repository_name = 'rickfelix/ehg';
```

## 10. Workflow Examples

### 10.1 Successful Flow
1. Developer commits code with `SD-016` in message
2. GitHub Actions triggers CI/CD pipeline
3. Webhook notifies LEO Protocol of success
4. EXEC phase validation passes
5. Automatic progression to VERIFICATION

### 10.2 Failure Flow
1. Pipeline fails during EXEC phase
2. Webhook triggers failure processing
3. DevOps Platform Architect analyzes failure
4. Automated resolution attempted (retry/fix)
5. If unresolved, manual intervention flagged
6. EXEC phase blocked until resolution

### 10.3 Manual Override
```bash
# Force EXEC phase completion (emergency)
node templates/execute-phase.js EXEC SD-016 --force --skip-ci-cd
```

## 11. Security Considerations

### 11.1 Webhook Security
- Always verify GitHub webhook signatures
- Use HTTPS for webhook endpoints
- Store secrets securely (environment variables)
- Implement rate limiting on webhook endpoint

### 11.2 Database Security
- Use connection pooling for webhook handlers
- Implement proper error handling
- Log all webhook events for audit
- Sanitize webhook payload data

### 11.3 Sub-Agent Security
- Limit sub-agent execution permissions
- Log all automated actions
- Require approval for sensitive operations
- Implement circuit breakers for failed retries

## 12. Performance Optimization

### 12.1 Database Indexing
```sql
-- Optimize common queries
CREATE INDEX CONCURRENTLY idx_ci_cd_status_sd_status
ON ci_cd_pipeline_status(sd_id, status, created_at);

CREATE INDEX CONCURRENTLY idx_webhook_events_processing
ON github_webhook_events(processed_successfully, received_at);
```

### 12.2 Caching Strategy
- Cache CI/CD status for 30 seconds
- Cache phase gate results for 1 minute
- Use Redis for real-time dashboard updates

### 12.3 Batch Processing
- Process multiple webhook events in batches
- Batch database updates for better performance
- Use background jobs for heavy analysis

## Troubleshooting Common Issues

### Issue: Webhooks not being received
- Check GitHub webhook delivery logs
- Verify webhook URL is accessible
- Check firewall/network settings

### Issue: Signature validation failing
- Verify webhook secret matches
- Check signature header format
- Ensure secret is properly encoded

### Issue: EXEC phase always blocked
- Check pipeline status in database
- Verify health score calculation
- Review validation rule configuration

### Issue: Sub-agent not triggering
- Check sub-agent trigger conditions
- Verify database trigger functions
- Review sub-agent execution logs

## Conclusion

This integration creates a robust, self-healing CI/CD workflow within the LEO Protocol. The system automatically detects failures, attempts resolution, and provides comprehensive monitoring and reporting capabilities.

For additional support, check the test suite results and database logs for specific error messages and resolution guidance.