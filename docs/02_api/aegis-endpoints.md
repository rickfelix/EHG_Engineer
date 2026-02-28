---
category: api
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [api, auto-generated]
---
# AEGIS API Endpoints Documentation

## Metadata
- **Category**: API
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-24
- **Tags**: aegis, api, rest, endpoints, governance
- **SD**: SD-AEGIS-GOVERNANCE-001
- **Related Docs**:
  - [AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)
  - [AEGIS CLI Guide](../reference/aegis-cli-guide.md)
  - [AEGIS Integration Guide](../guides/aegis-integration-guide.md)

## Overview

The AEGIS API provides 5 RESTful endpoints for governance rule management, validation, and violation tracking. All endpoints are located in `pages/api/aegis/` and return JSON responses.

**Base Path**: `/api/aegis`

**Authentication**: All endpoints require Supabase authentication (via service role key or authenticated session).

## Table of Contents

- [Common Patterns](#common-patterns)
- [Endpoint Summary](#endpoint-summary)
- [GET /api/aegis/constitutions](#get-apiaegisconstitutions)
- [GET /api/aegis/rules](#get-apiaegisrules)
- [POST /api/aegis/validate](#post-apiaegisvalidate)
- [GET /api/aegis/violations](#get-apiaegisviolations)
- [GET /api/aegis/stats](#get-apiaegisstats)
- [Error Responses](#error-responses)

## Common Patterns

### Response Structure

All successful responses follow this structure:

```json
{
  "data": { ... },       // Primary response data
  "meta": { ... },       // Optional metadata (counts, pagination)
  "timestamp": "ISO8601" // Response generation time
}
```

### Error Structure

All error responses follow this structure:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": { ... },    // Optional additional context
  "code": "ERROR_CODE"   // Optional error code
}
```

### Query Parameters

Common query parameters across endpoints:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `constitution` | string | - | Filter by constitution code (e.g., 'PROTOCOL') |
| `severity` | string | - | Filter by severity (CRITICAL, HIGH, MEDIUM, LOW) |
| `status` | string | 'open' | Filter by status (violations endpoint) |
| `limit` | integer | 50 | Maximum results to return |

## Endpoint Summary

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | `/api/aegis/constitutions` | List all constitutions | Yes |
| GET | `/api/aegis/rules` | List rules with filters | Yes |
| POST | `/api/aegis/validate` | Validate context against rules | Yes |
| GET | `/api/aegis/violations` | List violations with filters | Yes |
| GET | `/api/aegis/stats` | Get compliance statistics | Yes |

---

## GET /api/aegis/constitutions

**Purpose**: Retrieve all governance constitutions with metadata.

**Location**: `pages/api/aegis/constitutions.ts`

### Request

```http
GET /api/aegis/constitutions
```

**Query Parameters**: None

### Response

**Status**: `200 OK`

```json
{
  "constitutions": [
    {
      "id": "uuid",
      "code": "PROTOCOL",
      "name": "Protocol Constitution",
      "description": "The 9 immutable rules governing LEO self-improvement",
      "version": "1.0.0",
      "domain": "self_improvement",
      "enforcement_mode": "enforced",
      "parent_constitution_id": null,
      "is_active": true,
      "superseded_by": null,
      "metadata": {},
      "created_at": "2026-01-24T10:00:00Z",
      "created_by": "SYSTEM"
    },
    {
      "id": "uuid",
      "code": "FOUR_OATHS",
      "name": "Four Oaths",
      "description": "EVA Manifesto Part I: The Constitution - Four Oaths of agent behavior",
      "version": "1.0.0",
      "domain": "agent_behavior",
      "enforcement_mode": "enforced",
      "is_active": true,
      "created_at": "2026-01-24T10:00:00Z"
    }
    // ... 5 more constitutions
  ],
  "total": 7,
  "active": 7,
  "byDomain": {
    "self_improvement": 1,
    "agent_behavior": 1,
    "system_state": 3,
    "execution": 1,
    "compliance": 1
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `constitutions` | array | Array of constitution objects |
| `total` | integer | Total constitutions in database |
| `active` | integer | Constitutions where `is_active = true` |
| `byDomain` | object | Count of constitutions per domain |

### Example Usage

**cURL**:

```bash
curl -X GET \
  'https://your-domain.com/api/aegis/constitutions' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**JavaScript**:

```javascript
const response = await fetch('/api/aegis/constitutions');
const { constitutions } = await response.json();

console.log(`Found ${constitutions.length} constitutions`);
```

---

## GET /api/aegis/rules

**Purpose**: Retrieve governance rules with optional filters.

**Location**: `pages/api/aegis/rules.ts`

### Request

```http
GET /api/aegis/rules?constitution=PROTOCOL&severity=CRITICAL&is_active=true
```

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `constitution` | string | No | - | Filter by constitution code |
| `category` | string | No | - | Filter by category (safety, governance, audit, etc.) |
| `severity` | string | No | - | Filter by severity (CRITICAL, HIGH, MEDIUM, LOW) |
| `is_active` | boolean | No | true | Include only active rules |

### Response

**Status**: `200 OK`

```json
{
  "rules": [
    {
      "id": "uuid",
      "rule_code": "CONST-001",
      "rule_name": "Human Approval Required",
      "rule_text": "All GOVERNED tier changes require human approval. AI scores inform but never decide.",
      "category": "governance",
      "severity": "CRITICAL",
      "enforcement_action": "BLOCK",
      "validation_type": "custom",
      "validation_config": {
        "check": "governed_tier_approval"
      },
      "is_active": true,
      "created_at": "2026-01-24T10:00:00Z",
      "constitution": {
        "id": "uuid",
        "code": "PROTOCOL",
        "name": "Protocol Constitution",
        "domain": "self_improvement",
        "enforcement_mode": "enforced"
      }
    }
    // ... more rules
  ],
  "byConstitution": {
    "PROTOCOL": [/* rules */],
    "FOUR_OATHS": [/* rules */]
  },
  "bySeverity": {
    "CRITICAL": 15,
    "HIGH": 12,
    "MEDIUM": 10,
    "LOW": 8
  },
  "total": 45,
  "activeCount": 45
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `rules` | array | Array of rule objects |
| `byConstitution` | object | Rules grouped by constitution code |
| `bySeverity` | object | Count of rules per severity |
| `total` | integer | Total rules matching filters |
| `activeCount` | integer | Active rules matching filters |

### Example Usage

**cURL**:

```bash
# Get all CRITICAL rules for PROTOCOL constitution
curl -X GET \
  'https://your-domain.com/api/aegis/rules?constitution=PROTOCOL&severity=CRITICAL' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**JavaScript**:

```javascript
// Get all safety rules
const response = await fetch('/api/aegis/rules?category=safety');
const { rules, bySeverity } = await response.json();

console.log(`Found ${rules.length} safety rules`);
console.log(`Severity breakdown:`, bySeverity);
```

**React Component**:

```jsx
import { useEffect, useState } from 'react';

function RulesList({ constitution }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      const res = await fetch(`/api/aegis/rules?constitution=${constitution}`);
      const data = await res.json();
      setRules(data.rules);
      setLoading(false);
    };
    fetchRules();
  }, [constitution]);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {rules.map(rule => (
        <li key={rule.id}>
          <strong>{rule.rule_code}</strong>: {rule.rule_name}
          <span className={`severity-${rule.severity}`}>
            {rule.severity}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

---

## POST /api/aegis/validate

**Purpose**: Validate an operation context against governance rules.

**Location**: `pages/api/aegis/validate.ts`

### Request

```http
POST /api/aegis/validate
Content-Type: application/json
```

**Body**:

```json
{
  "context": {
    "risk_tier": "GOVERNED",
    "auto_applicable": true,
    "target_table": "protocol_improvement_queue",
    "actor_role": "EXEC",
    "operation_type": "INSERT",
    "venture_id": "uuid",
    "prd_id": "uuid"
  },
  "constitution": "PROTOCOL",
  "record_violations": true
}
```

**Body Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `context` | object | Yes | Operation context to validate |
| `constitution` | string | No | Validate against specific constitution (default: all) |
| `record_violations` | boolean | No | Whether to record violations to audit log (default: false) |

**Context Fields** (varies by rule):

| Field | Type | Description |
|-------|------|-------------|
| `risk_tier` | string | Risk tier (AUTO, GOVERNED) |
| `target_table` | string | Database table being modified |
| `target_operation` | string | Operation type (INSERT, UPDATE, DELETE) |
| `actor_role` | string | Role of actor (EXEC, LEAD, PLAN) |
| `actor_id` | string | Unique identifier of actor |
| `operation_type` | string | Type of operation |
| `venture_id` | UUID | Venture context |
| `prd_id` | UUID | PRD context |
| `budget_remaining` | number | Remaining budget |
| `auto_applicable` | boolean | Whether auto-applicable |
| `payload` | object | Additional operation data |

### Response

**Status**: `200 OK` (validation completed, check `passed` field)

```json
{
  "passed": false,
  "rulesChecked": 9,
  "violations": [
    {
      "rule_code": "CONST-001",
      "rule_name": "Human Approval Required",
      "severity": "CRITICAL",
      "enforcement_action": "BLOCK",
      "message": "GOVERNED tier improvements cannot be auto-applied"
    }
  ],
  "violationCount": 1,
  "warnings": [
    {
      "rule_code": "CONST-006",
      "rule_name": "Complexity Conservation",
      "severity": "MEDIUM",
      "enforcement_action": "WARN_AND_LOG",
      "message": "Large payload may indicate complexity increase - review recommended"
    }
  ],
  "warningCount": 1,
  "passedRules": 7,
  "details": {
    "critical": 1,
    "high": 0,
    "medium": 1,
    "low": 0
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | `true` if no blocking violations, `false` otherwise |
| `rulesChecked` | integer | Number of rules evaluated |
| `violations` | array | Blocking violations (BLOCK, BLOCK_OVERRIDABLE) |
| `violationCount` | integer | Count of blocking violations |
| `warnings` | array | Non-blocking issues (WARN_AND_LOG, AUDIT_ONLY) |
| `warningCount` | integer | Count of warnings |
| `passedRules` | integer | Number of rules that passed |
| `details` | object | Breakdown by severity |

### Example Usage

**cURL**:

```bash
curl -X POST \
  'https://your-domain.com/api/aegis/validate' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "context": {
      "risk_tier": "AUTO",
      "target_table": "protocol_improvement_queue",
      "auto_applicable": false
    },
    "constitution": "PROTOCOL",
    "record_violations": false
  }'
```

**JavaScript (with error handling)**:

```javascript
async function validateOperation(context) {
  try {
    const response = await fetch('/api/aegis/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, record_violations: true })
    });

    const result = await response.json();

    if (!result.passed) {
      console.error('Validation failed:');
      result.violations.forEach(v => {
        console.error(`  [${v.severity}] ${v.rule_code}: ${v.message}`);
      });
      return false;
    }

    if (result.warnings.length > 0) {
      console.warn('Validation passed with warnings:');
      result.warnings.forEach(w => {
        console.warn(`  [${w.severity}] ${w.rule_code}: ${w.message}`);
      });
    }

    return true;
  } catch (error) {
    console.error('Validation request failed:', error);
    return false;
  }
}

// Usage
const context = {
  actor_role: 'EXEC',
  target_table: 'strategic_directives_v2',
  operation_type: 'INSERT'
};

const isValid = await validateOperation(context);
if (isValid) {
  // Proceed with operation
} else {
  // Block operation
}
```

**TypeScript (with type safety)**:

```typescript
interface ValidationContext {
  risk_tier?: 'AUTO' | 'GOVERNED';
  target_table?: string;
  target_operation?: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_role?: string;
  operation_type?: string;
  [key: string]: any;
}

interface ValidationResult {
  passed: boolean;
  rulesChecked: number;
  violations: Array<{
    rule_code: string;
    rule_name: string;
    severity: string;
    enforcement_action: string;
    message: string;
  }>;
  warnings: Array<any>;
  violationCount: number;
  warningCount: number;
}

async function validateContext(
  context: ValidationContext,
  constitution?: string
): Promise<ValidationResult> {
  const response = await fetch('/api/aegis/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, constitution })
  });

  if (!response.ok) {
    throw new Error(`Validation failed: ${response.statusText}`);
  }

  return response.json();
}
```

---

## GET /api/aegis/violations

**Purpose**: Retrieve violations with filters for audit and monitoring.

**Location**: `pages/api/aegis/violations.ts`

### Request

```http
GET /api/aegis/violations?status=open&severity=CRITICAL&limit=20
```

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | 'open' | Filter by status (open, acknowledged, overridden, remediated, false_positive) |
| `severity` | string | No | - | Filter by severity |
| `constitution` | string | No | - | Filter by constitution code |
| `sd_key` | string | No | - | Filter by SD key |
| `actor_role` | string | No | - | Filter by actor role |
| `limit` | integer | No | 50 | Maximum results (max: 500) |
| `offset` | integer | No | 0 | Pagination offset |

### Response

**Status**: `200 OK`

```json
{
  "violations": [
    {
      "id": "uuid",
      "severity": "CRITICAL",
      "message": "EXEC agents are DATABASE-FORBIDDEN from creating Strategic Directives",
      "status": "open",
      "sd_key": "SD-XXX-001",
      "actor_role": "EXEC",
      "actor_id": "claude-sonnet-4",
      "operation_type": "INSERT",
      "target_table": "strategic_directives_v2",
      "created_at": "2026-01-24T15:30:00Z",
      "rule": {
        "rule_code": "DOC-001",
        "rule_name": "EXEC Cannot Create Strategic Directives"
      },
      "constitution": {
        "code": "DOCTRINE",
        "name": "Doctrine of Constraint"
      },
      "override_justification": null,
      "overridden_by": null,
      "remediation_sd_id": null
    }
    // ... more violations
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "bySeverity": {
    "CRITICAL": 1,
    "HIGH": 0,
    "MEDIUM": 0,
    "LOW": 0
  },
  "byStatus": {
    "open": 1,
    "acknowledged": 0,
    "overridden": 0,
    "remediated": 0
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `violations` | array | Array of violation objects |
| `total` | integer | Total violations matching filters |
| `limit` | integer | Result limit applied |
| `offset` | integer | Pagination offset |
| `bySeverity` | object | Count by severity |
| `byStatus` | object | Count by status |

### Example Usage

**cURL**:

```bash
# Get all open CRITICAL violations
curl -X GET \
  'https://your-domain.com/api/aegis/violations?status=open&severity=CRITICAL' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**JavaScript (monitoring dashboard)**:

```javascript
async function fetchOpenViolations() {
  const response = await fetch('/api/aegis/violations?status=open');
  const { violations, bySeverity } = await response.json();

  console.log(`Found ${violations.length} open violations`);
  console.log('Severity breakdown:', bySeverity);

  // Alert on CRITICAL violations
  const critical = violations.filter(v => v.severity === 'CRITICAL');
  if (critical.length > 0) {
    console.error(`⚠️ ${critical.length} CRITICAL violations require immediate attention!`);
    critical.forEach(v => {
      console.error(`  ${v.rule.rule_code}: ${v.message}`);
    });
  }

  return violations;
}

// Poll every 60 seconds
setInterval(fetchOpenViolations, 60000);
```

**React Component (Violation Dashboard)**:

```jsx
import { useEffect, useState } from 'react';

function ViolationDashboard() {
  const [violations, setViolations] = useState([]);
  const [stats, setStats] = useState({ bySeverity: {}, byStatus: {} });

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch('/api/aegis/violations?status=open');
      const data = await res.json();
      setViolations(data.violations);
      setStats({ bySeverity: data.bySeverity, byStatus: data.byStatus });
    };
    fetchData();
  }, []);

  return (
    <div>
      <h2>Open Governance Violations</h2>

      <div className="stats">
        <div className="stat critical">
          CRITICAL: {stats.bySeverity.CRITICAL || 0}
        </div>
        <div className="stat high">
          HIGH: {stats.bySeverity.HIGH || 0}
        </div>
        <div className="stat medium">
          MEDIUM: {stats.bySeverity.MEDIUM || 0}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Rule</th>
            <th>Message</th>
            <th>SD</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {violations.map(v => (
            <tr key={v.id}>
              <td className={`severity-${v.severity}`}>{v.severity}</td>
              <td>{v.rule.rule_code}</td>
              <td>{v.message}</td>
              <td>{v.sd_key || '-'}</td>
              <td>{new Date(v.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## GET /api/aegis/stats

**Purpose**: Get compliance statistics and rule effectiveness metrics.

**Location**: `pages/api/aegis/stats.ts`

### Request

```http
GET /api/aegis/stats?period=30
```

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | integer | No | 30 | Days to include in statistics |

### Response

**Status**: `200 OK`

```json
{
  "constitutions": [
    {
      "code": "PROTOCOL",
      "name": "Protocol Constitution",
      "enforcement_mode": "enforced",
      "active_rules": 9,
      "critical_rules": 4,
      "open_violations": 0
    },
    {
      "code": "DOCTRINE",
      "name": "Doctrine of Constraint",
      "enforcement_mode": "enforced",
      "active_rules": 4,
      "critical_rules": 4,
      "open_violations": 1
    }
    // ... more constitutions
  ],
  "violations": {
    "total": 15,
    "period_days": 30,
    "by_severity": {
      "CRITICAL": 3,
      "HIGH": 5,
      "MEDIUM": 4,
      "LOW": 3
    },
    "by_status": {
      "open": 2,
      "acknowledged": 3,
      "remediated": 8,
      "overridden": 1,
      "false_positive": 1
    },
    "by_constitution": {
      "PROTOCOL": 5,
      "DOCTRINE": 4,
      "FOUR_OATHS": 3,
      "CREW_GOVERNANCE": 2,
      "COMPLIANCE": 1
    }
  },
  "rules": {
    "total": 45,
    "active": 45,
    "by_severity": {
      "CRITICAL": 15,
      "HIGH": 12,
      "MEDIUM": 10,
      "LOW": 8
    },
    "top_triggered": [
      {
        "rule_code": "CREW-001",
        "rule_name": "Venture ID Required",
        "times_triggered": 150,
        "times_blocked": 25,
        "block_rate": 16.67
      },
      {
        "rule_code": "DOC-001",
        "rule_name": "EXEC Cannot Create SDs",
        "times_triggered": 42,
        "times_blocked": 42,
        "block_rate": 100.0
      }
    ]
  },
  "compliance_rate": 86.67,
  "generated_at": "2026-01-24T16:00:00Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `constitutions` | array | Summary of each constitution |
| `violations` | object | Violation statistics for period |
| `rules` | object | Rule effectiveness metrics |
| `compliance_rate` | number | % of operations that passed validation |
| `generated_at` | string | Timestamp of stats generation |

### Example Usage

**cURL**:

```bash
# Get last 7 days of stats
curl -X GET \
  'https://your-domain.com/api/aegis/stats?period=7' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**JavaScript (compliance report)**:

```javascript
async function generateComplianceReport(days = 30) {
  const response = await fetch(`/api/aegis/stats?period=${days}`);
  const stats = await response.json();

  console.log(`\n=== AEGIS Compliance Report (${days} days) ===\n`);

  console.log(`Overall Compliance Rate: ${stats.compliance_rate.toFixed(2)}%`);
  console.log(`\nTotal Violations: ${stats.violations.total}`);
  console.log(`  Open: ${stats.violations.by_status.open}`);
  console.log(`  Remediated: ${stats.violations.by_status.remediated}`);

  console.log(`\nTop Rules Triggered:`);
  stats.rules.top_triggered.forEach((rule, i) => {
    console.log(`  ${i+1}. ${rule.rule_code}: ${rule.times_triggered} triggers (${rule.block_rate.toFixed(1)}% blocked)`);
  });

  console.log(`\nConstitution Summary:`);
  stats.constitutions.forEach(c => {
    console.log(`  ${c.code}: ${c.active_rules} rules, ${c.open_violations} open violations`);
  });

  return stats;
}

// Run report
await generateComplianceReport(30);
```

---

## Error Responses

### 400 Bad Request

**Cause**: Invalid request parameters or body

```json
{
  "error": "Bad request",
  "message": "Missing or invalid context object",
  "details": {
    "expected": "object",
    "received": "string"
  }
}
```

### 404 Not Found

**Cause**: Constitution or resource not found

```json
{
  "error": "Not found",
  "message": "Constitution not found",
  "constitution": "INVALID_CODE"
}
```

### 405 Method Not Allowed

**Cause**: Wrong HTTP method used

```json
{
  "error": "Method not allowed",
  "allowed": ["GET", "POST"],
  "received": "PUT"
}
```

### 500 Internal Server Error

**Cause**: Server-side error (database, validation)

```json
{
  "error": "Internal server error",
  "message": "Failed to fetch rules",
  "code": "DATABASE_ERROR"
}
```

### Handling Errors

**Best Practice**:

```javascript
async function safeApiCall(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      // Server returned error
      console.error(`API Error (${response.status}):`, data.message);
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (error) {
    // Network or parsing error
    console.error('Network Error:', error.message);
    return { success: false, error: { message: error.message } };
  }
}

// Usage
const result = await safeApiCall('/api/aegis/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context })
});

if (result.success) {
  console.log('Validation result:', result.data);
} else {
  console.error('Validation failed:', result.error.message);
}
```

## Rate Limits

**Current Limits**: None enforced at application level

**Future Considerations**:
- Per-user rate limiting: 1000 requests/hour
- Per-IP rate limiting: 5000 requests/hour
- Burst allowance: 100 requests/minute

**Caching Recommendations**:
- Cache `/constitutions` and `/rules` responses for 5 minutes
- Don't cache `/validate`, `/violations`, or `/stats` responses
- Use `ETag` headers for conditional requests (future)

## Related Documentation

- **[AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)** - System design and components
- **[AEGIS CLI Guide](../reference/aegis-cli-guide.md)** - CLI alternative to API
- **[AEGIS Integration Guide](../guides/aegis-integration-guide.md)** - Integration patterns

## Version History

- **v1.0.0** (2026-01-24) - Initial API documentation for SD-AEGIS-GOVERNANCE-001
  - All 5 endpoints documented
  - Request/response examples for each endpoint
  - Error handling patterns
  - Integration examples (JavaScript, TypeScript, React)
