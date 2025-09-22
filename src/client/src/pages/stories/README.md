# User Stories UI

## Overview
User interface for managing and tracking user stories in the LEO Protocol system.

## Enabling the Feature

Set environment variables in `.env` file:
```bash
# Enable story UI components
VITE_FEATURE_STORY_UI=true

# Enable release gate calculations
VITE_FEATURE_STORY_GATES=true
```

Restart development server:
```bash
npm run dev
```

## Routes

The stories feature adds the following routes:

- `/stories` - All stories grid view across all SDs
- `/stories/:sd_key` - Stories filtered for a specific Strategic Directive
- `/stories/:sd_key/:story_key` - Detailed view of a specific story

## Components

### UserStories.jsx
Main list component that displays stories with:
- Status filtering (passing/failing/not_run)
- Priority filtering (critical/high/medium/low)
- Release gate status panel
- Coverage percentage display

### StoryDetail.jsx
Detailed view of a single story showing:
- Acceptance criteria (Given/When/Then format)
- Verification status and history
- Test coverage metrics
- Manual verification trigger

## Performance Optimizations

- **Pagination**: Default 20 items per page
- **Covering Index**: Uses `idx_story_list` for optimal query performance
- **Virtual Scrolling**: For lists > 100 items (future enhancement)
- **Lazy Loading**: Components load on demand

## Testing

### Unit Tests
```bash
npm test -- --grep "Stories"
```

### E2E Tests
```bash
npm run test:e2e -- --spec "stories.spec.js"
```

### Performance Testing
```bash
# Check render time
npm run test:perf -- --component UserStories

# Verify P95 < 200ms target
npm run test:perf:report
```

## Styling

The components use Tailwind CSS with dark mode support:
- Light mode: White backgrounds with gray borders
- Dark mode: Gray-800 backgrounds with gray-700 borders

Status colors:
- Passing: Green (bg-green-100/green-900)
- Failing: Red (bg-red-100/red-900)
- Not Run: Gray (bg-gray-100/gray-900)

## API Integration

The UI components connect to the following API endpoints:

- `GET /api/stories` - List stories with filtering
- `POST /api/stories/verify` - Trigger verification
- Views: `v_story_verification_status`, `v_sd_release_gate`

## Feature Flags

All story UI functionality is gated behind feature flags:

```javascript
const FEATURE_FLAGS = {
  FEATURE_STORY_UI: import.meta.env.VITE_FEATURE_STORY_UI === 'true',
  FEATURE_STORY_GATES: import.meta.env.VITE_FEATURE_STORY_GATES === 'true'
};
```

When disabled, users are redirected to the dashboard.

## Troubleshooting

### Stories not appearing
1. Check feature flag is enabled
2. Verify database migration applied
3. Check stories exist in `sd_backlog_map`
4. Review browser console for errors

### Gate calculations incorrect
1. Verify FEATURE_STORY_GATES enabled
2. Check `v_sd_release_gate` view returns data
3. Ensure all stories have verification_status set

### Performance issues
1. Check covering index is being used
2. Review query plan with EXPLAIN ANALYZE
3. Enable pagination if > 50 stories
4. Consider implementing virtual scrolling