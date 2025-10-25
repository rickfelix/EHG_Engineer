# Backlog Management Guide

## Overview

This guide explains how to properly add and manage backlog items for Strategic Directives in the EHG_Engineer system.

## Key Concepts

### Understanding the Two Display Systems

1. **Strategic Directives Page** (`http://localhost:3000`)
   - Shows SDs with backlog count badges
   - Sources data from `strategic_directives_v2` table
   - Uses `h_count`, `m_count`, `l_count` fields for display

2. **Backlog Management Page** (`http://localhost:3000/backlog`)
   - Shows detailed backlog items per SD
   - Sources data from `strategic_directives_backlog` VIEW
   - Requires `import_run_id` and `present_in_latest_import=true`

### Database Structure

- **strategic_directives_v2**: Main SD table with count fields
- **sd_backlog_map**: Individual backlog items linked to SDs
- **strategic_directives_backlog**: VIEW that aggregates imported data

## Adding Backlog Items - Step by Step

### Method 1: Using the Universal Template (RECOMMENDED)

```bash
# Basic usage
node templates/add-backlog-item.js SD-XXX-YYYY-NNN

# With options
node templates/add-backlog-item.js SD-XXX-YYYY-NNN \
  --title "Fix critical bug" \
  --description "Detailed description here" \
  --priority HIGH
```

### Method 2: Programmatic Usage

```javascript
import { UniversalBacklogItemCreator } from './templates/add-backlog-item.js';

const creator = new UniversalBacklogItemCreator();

await creator.createBacklogItem('SD-XXX-YYYY-NNN', {
  title: 'Fix critical bug',
  description: 'Detailed description',
  priority: 'high',
  acceptance_criteria: ['Criterion 1', 'Criterion 2']
});
```

## Critical Requirements for Visibility

### For Backlog Management Page Visibility

The SD MUST have:
1. **import_run_id** (UUID) - Marks it as imported
2. **present_in_latest_import** = true
3. **h_count > 0** OR **m_count > 0** OR **l_count > 0**

### For Strategic Directives Page Visibility

The SD MUST have:
1. **h_count**, **m_count**, or **l_count** > 0
2. These fields are in the `strategic_directives_v2` table

## Troubleshooting

### Backlog Items Not Visible

If backlog items don't appear on the Backlog Management page:

1. **Verify the SD has required fields:**
   ```bash
   node scripts/verify-backlog-visibility.js
   ```

2. **Check if SD appears in the view:**
   ```sql
   SELECT * FROM strategic_directives_backlog
   WHERE sd_id = 'SD-XXX-YYYY-NNN';
   ```

3. **Ensure import fields are set:**
   - The SD needs `import_run_id` (UUID)
   - The SD needs `present_in_latest_import = true`
   - Without these, it won't appear in the view

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| SD not in Backlog Management | Missing import_run_id | Run template script with proper import fields |
| Count badges show 0 | h/m/l_count fields are 0 | Update counts in strategic_directives_v2 |
| API doesn't return SD | Not in strategic_directives_backlog view | Ensure import fields are set |
| Backlog item exists but not visible | SD not marked as imported | Add import_run_id and present_in_latest_import |

## Database Queries for Diagnostics

### Check SD Status
```sql
SELECT id, title, h_count, m_count, l_count,
       import_run_id, present_in_latest_import
FROM strategic_directives_v2
WHERE id = 'SD-XXX-YYYY-NNN';
```

### Check Backlog Items
```sql
SELECT * FROM sd_backlog_map
WHERE sd_id = 'SD-XXX-YYYY-NNN';
```

### Check View
```sql
SELECT * FROM strategic_directives_backlog
WHERE sd_id = 'SD-XXX-YYYY-NNN';
```

## NPM Scripts

Available shortcuts for common operations:

```bash
# Add a backlog item
npm run backlog:add SD-XXX-YYYY-NNN -- --title "Task title"

# Verify backlog visibility
npm run backlog:verify

# Check backlog status for an SD
npm run backlog:status SD-XXX-YYYY-NNN
```

## Important Notes

1. **Never modify strategic-loaders.js** - It's been working correctly for existing imported data
2. **Always use templates** - The template system handles all required fields correctly
3. **Import fields are critical** - Without `import_run_id`, items won't appear in Backlog Management
4. **Two separate systems** - Strategic Directives page and Backlog Management page use different data sources

## API Endpoints

- `/api/backlog/strategic-directives` - Returns all SDs with backlog items
- `/api/backlog/strategic-directives/{sd_id}` - Returns specific SD backlog items

## Related Files

- `templates/add-backlog-item.js` - Universal template for adding items
- `scripts/verify-backlog-visibility.js` - Diagnostic tool
- `src/services/database-loader/strategic-loaders.js` - Loads SD data (DO NOT MODIFY)
- `src/client/src/components/BacklogManager.jsx` - Backlog Management UI