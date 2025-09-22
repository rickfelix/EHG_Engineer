# Slack Notifications Setup Guide

## Overview

The housekeeping workflows support optional Slack notifications for run status updates.

## Setup Instructions

### 1. Create Slack Webhook

1. Go to your Slack workspace
2. Navigate to: **Apps** → **Incoming Webhooks**
3. Click **Add to Slack**
4. Choose a channel (e.g., `#housekeeping-alerts`)
5. Copy the webhook URL

### 2. Add to GitHub Secrets

1. Go to: **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `SLACK_WEBHOOK_URL`
4. Value: Paste the webhook URL from Slack
5. Click **Add secret**

## Message Format

### Success Message
```json
{
  "text": "Housekeeping Staging ✅ SUCCESS",
  "attachments": [{
    "color": "good",
    "fields": [
      { "title": "Workflow", "value": "Housekeeping Staging", "short": true },
      { "title": "Status", "value": "success", "short": true },
      { "title": "Run URL", "value": "https://github.com/..." }
    ]
  }]
}
```

### Failure Message
```json
{
  "text": "Housekeeping Staging ❌ FAILURE",
  "attachments": [{
    "color": "danger",
    "fields": [
      { "title": "Workflow", "value": "Housekeeping Staging", "short": true },
      { "title": "Status", "value": "failure", "short": true },
      { "title": "Run URL", "value": "https://github.com/..." }
    ]
  }]
}
```

## Workflows with Notifications

- ✅ `housekeeping-staging-selfcontained.yml` - Daily runs
- ✅ `housekeeping-prod-promotion.yml` - Production promotions
- ✅ `schema-drift.yml` - Drift detection
- ✅ `housekeeping-weekly-report.yml` - Weekly summaries

## Testing

To test notifications:

1. Trigger a workflow manually
2. Check Slack channel for notification
3. Verify link in message works

## Custom Notifications

To add custom fields to notifications, edit the workflow:

```yaml
- name: Send notification
  uses: actions/github-script@v7
  with:
    script: |
      // Add custom fields here
      fields: [
        { title: 'Custom Field', value: 'Custom Value', short: true }
      ]
```

## Troubleshooting

### No notifications received
- Check secret is set correctly
- Verify webhook URL is valid
- Check workflow logs for errors

### Rate limiting
- Slack webhooks have rate limits
- Consider batching notifications
- Use summary notifications for high-frequency events

## Alternative: GitHub Issues

If Slack is not available, workflows will:
1. Log to workflow output (always visible)
2. Create issues for failures (schema drift)
3. Create PRs for reports (weekly summary)