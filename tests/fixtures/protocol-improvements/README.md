# Protocol Improvements Test Fixtures

This directory contains test fixtures for the Protocol Improvement System tests.

## Files

### `sample-retrospective.json`
Complete retrospective record with:
- `protocol_improvements` field with 2 improvements (VALIDATION and DOCUMENTATION)
- `failure_patterns` field with 1 recurring pattern
- Proper structure for PROCESS_IMPROVEMENT learning category

**Usage**: Load as test data for extraction tests

### `sample-improvement-queue.json`
Array of improvement queue items showing:
- Valid improvements with proper target tables
- Invalid improvement attempting markdown file edit (REJECTED)
- Various statuses: pending_review, rejected

**Usage**: Mock improvement queue for applicator tests

### `expected-extraction.json`
Expected output structure after extraction showing:
- Improvements from `protocol_improvements` field
- Improvements derived from `failure_patterns` field
- Target table mapping grouping improvements by destination

**Usage**: Assertion reference for extraction tests

## Test Coverage

These fixtures support tests for:

1. **ImprovementExtractor** (unit tests)
   - Extract from protocol_improvements JSONB
   - Extract from failure_patterns
   - Map to target tables
   - Handle empty/null inputs

2. **ImprovementApplicator** (unit tests)
   - Reject markdown file edits
   - Validate whitelisted tables
   - Trigger regeneration after apply
   - Handle database errors

3. **EffectivenessTracker** (unit tests)
   - Calculate effectiveness scores
   - Track issue resolution
   - Handle insufficient data

4. **Handoff Retrospective Integration** (integration tests)
   - LEAD-TO-PLAN retrospective creation
   - PLAN-TO-EXEC retrospective creation
   - Pre-handoff warning generation
   - Extraction trigger execution

## Updating Fixtures

To modify fixtures:

1. Edit the JSON files directly
2. Ensure structure matches database schema:
   - `retrospectives` table structure
   - `protocol_improvement_queue` table structure
3. Run tests to verify changes: `npm run test:unit`

## Related Schema

See database migration:
- `/database/migrations/20251204_add_protocol_improvements_to_retrospectives.sql`

Whitelisted target tables:
- `leo_handoff_templates`
- `leo_protocol_sections`
- `leo_protocol_agents`
- `leo_protocol_sub_agents`
- `handoff_validation_rules`

Forbidden targets:
- `CLAUDE.md` (or any markdown file)
- `MARKDOWN_FILE`
