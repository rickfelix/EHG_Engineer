---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Boundary Examples - DO/DON'T Reference Guide


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, schema, security, guide

*Generated: 2025-09-26T13:59:46.307Z*
*Source: Database + Codebase Analysis*

## 📋 Strategic Directive Statusing

| ✅ DO | ❌ DON'T | Why |
|-------|----------|-----|
| Use `scripts/add-sd-to-database.js` | Create SD markdown files in docs/ | Database-first architecture |
| Use `scripts/query-active-sds.js` | Query EHG app DB (liapbndqlqxdcgpwntbv) | Wrong database boundary |
| Use `scripts/complete-sd-template.js` | Manually UPDATE sd status in DB | Breaks audit trail |
| Store in `strategic_directives_v2` table | Create files like SD-001.md | Files aren't source of truth |
| Use `scripts/lead-approve-sdip.js` | Bypass LEAD approval phase | Violates LEO Protocol |

## 🔄 Retrospectives & Documentation

| ✅ DO | ❌ DON'T | Why |
|-------|----------|-----|
| Store retrospectives in DB tables | Create retrospective/*.md files | Database-first only |
| Use `scripts/add-prd-to-database.js` | Create PRD-*.md files | PRDs must be in DB |
| Generate docs via scripts | Manually maintain docs | Single source of truth |
| Use handoff tracking tables | Create handoff JSON/MD files | Handoffs tracked in DB |
| Run `npm run docs:boundary` | Edit boundary-examples.md | This file is generated |

## 🚨 Ask-Before-Act Triggers

These actions require explicit approval:

| Trigger | Example | Required Action |
|---------|---------|-----------------|
| Schema Change | `CREATE TABLE ...` | Get DB architect approval |
| New Dependency | `npm install new-package` | Justify necessity |
| Cross-Boundary | Access EHG app (liapbndqlqxdcgpwntbv) | Confirm separation |
| Security Operation | Auth/encryption changes | Security review required |
| File Creation | Creating *.md work artifacts | Use database instead |

## 📁 Real Script Paths

**SD Management:**
- `add-sd-2025-001-complete.js`
- `add-sd-2025-001-simple.js`
- `add-sd-2025-09-emb.js`
- `add-sd-to-database.js`
- `complete-sd-2025-001-correct.js`

**PRD Management:**
- `add-prd-to-database.js`
- `apply-prd-view.js`
- `check-dashboard-prd.js`
- `complete-prd-validation.js`
- `create-prd-dashboard-ui.js`

**Database Tables (0 active):**


## 🔒 Database Boundaries

| Database | ID | Purpose | Access |
|----------|-----|---------|--------|
| EHG_Engineer | dedlbzhpgkmetvhbkyzq | LEO Protocol Tool | ✅ Full |
| EHG App | liapbndqlqxdcgpwntbv | Target Application | ❌ Never |
