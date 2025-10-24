# UATDashboard Component Architecture

## Component Hierarchy

```
UATDashboard (515 LOC)
├── State Management
│   ├── runs, selectedRun, runStats
│   ├── testCases, activeTestId
│   ├── Filter states (priority, status, section, type, search)
│   └── Modal states (create, edit, sd, execution)
│
├── Data Layer
│   ├── Supabase client
│   ├── Real-time subscriptions
│   ├── CRUD operations
│   └── Filter logic
│
└── UI Layer
    ├── TestingCampaignManager
    ├── Header (Create Test, Refresh)
    │
    ├── UATMetrics (79 LOC)
    │   └── Props: { runStats }
    │       ├── Total Tests Card
    │       ├── Passed Card
    │       ├── Failed Card
    │       └── Blocked Card
    │
    ├── Test Cases Section
    │   ├── Header (with status counts)
    │   │
    │   ├── UATFilters (309 LOC)
    │   │   └── Props: { testCases, filters, setters, counts }
    │   │       ├── Filter Toggle Button
    │   │       ├── Priority Filter Buttons
    │   │       ├── Status Filter Buttons
    │   │       ├── Section Dropdown
    │   │       ├── Test Type Dropdown
    │   │       ├── Search Input
    │   │       └── Clear Filters Button
    │   │
    │   └── TestCaseList (176 LOC)
    │       └── Props: { testCases, filtered, active, callbacks }
    │           ├── Empty States
    │           └── Test Case Cards
    │               ├── Test ID + Badges
    │               ├── Title + Section
    │               └── Action Buttons
    │                   ├── Start/Continue/Retest
    │                   ├── Create SD (if failed)
    │                   ├── Edit
    │                   └── Delete
    │
    └── Modals
        ├── TestExecutionModal
        ├── CreateTestCaseModal
        ├── EditTestCaseModal
        └── SDGenerationModal
```

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                     UATDashboard                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              State Management                     │  │
│  │  • Filter States                                  │  │
│  │  • Test Cases                                     │  │
│  │  • Run Stats                                      │  │
│  └─────────┬──────────────────────────┬──────────────┘  │
│            │                          │                  │
│    ┌───────▼─────────┐        ┌──────▼───────┐         │
│    │  UATMetrics     │        │  UATFilters  │         │
│    │  (Read Only)    │        │ (Interactive)│         │
│    └─────────────────┘        └──────┬───────┘         │
│                                      │                  │
│                                      │ Filter State     │
│                                      │ Updates          │
│                                      │                  │
│                               ┌──────▼───────────┐     │
│                               │  TestCaseList    │     │
│                               │  (Action Calls)  │     │
│                               └──────┬───────────┘     │
│                                      │                  │
│                                      │ Callbacks        │
│                                      │ (edit, delete,   │
│                                      │  execute, etc)   │
│                                      │                  │
│                      ┌───────────────▼────────────────┐ │
│                      │     Modal Management           │ │
│                      │  (Create, Edit, Execute, SD)   │ │
│                      └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │   Supabase    │
                      │   (Database)  │
                      └───────────────┘
```

## Props Interfaces

### UATMetrics
```typescript
interface UATMetricsProps {
  runStats: {
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
  } | null;
}
```

### UATFilters
```typescript
interface UATFiltersProps {
  testCases: TestCase[];
  priorityFilter: string;
  setPriorityFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  sectionFilter: string;
  setSectionFilter: (value: string) => void;
  testTypeFilter: string;
  setTestTypeFilter: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filtersExpanded: boolean;
  setFiltersExpanded: (value: boolean) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  filteredTestCases: TestCase[];
  searchInputId?: string;
}
```

### TestCaseList
```typescript
interface TestCaseListProps {
  testCases: TestCase[];
  filteredTestCases: TestCase[];
  activeTestId: string | null;
  onOpenTestModal: (testCase: TestCase) => void;
  onSetEditTestCase: (testCase: TestCase) => void;
  onSetSdModalTestCase: (testCase: TestCase) => void;
  onTestCaseDeleted: (testCaseId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  showActive?: boolean;
}
```

## Component Responsibilities

| Component | Responsibility | State | Side Effects |
|-----------|---------------|-------|--------------|
| UATDashboard | Orchestration, state, API | Complex | Supabase queries, subscriptions |
| UATMetrics | Display metrics | None | None |
| UATFilters | Filter UI + logic | Props only | None |
| TestCaseList | Render test cases | None | Supabase delete (internal) |

## Testing Strategy

### Unit Tests

#### UATMetrics
- Renders all 4 cards with correct data
- Handles null runStats gracefully
- Displays correct numbers and icons
- Responsive layout classes present

#### UATFilters
- Filter buttons toggle correctly
- Count calculations accurate
- Search input updates state
- Clear filters resets all
- Collapsible section works
- Section/type dropdowns populate

#### TestCaseList
- Renders filtered test cases
- Shows empty state when no results
- Active test highlighted correctly
- Action buttons call callbacks
- Delete confirmation works
- Conditional SD button (failed tests only)

#### UATDashboard
- Fetches runs on mount
- Fetches test cases on mount
- Updates stats when run selected
- Filters test cases correctly
- Opens modals with correct data
- Handles test completion
- Real-time subscription works

### Integration Tests
- Filter changes update test list
- Test actions trigger modals
- Modal completion updates list
- Metrics reflect test results

### E2E Tests
- Full test execution workflow
- Create/edit/delete test cases
- Filter and search functionality
- SD generation from failed test

## Performance Considerations

### Optimizations
1. **Filtered list memoization**: Consider `useMemo` for filteredTestCases if performance issue
2. **Component memoization**: `React.memo()` for UATMetrics and TestCaseList
3. **Callback stability**: Use `useCallback` for event handlers passed to children
4. **Subscription cleanup**: Properly unsubscribes from Supabase realtime

### Bundle Size
- Main component: 515 LOC
- Sub-components: 564 LOC total
- Total: 1,079 LOC (93% of original)

## Migration Guide

### Before
```javascript
import { UATDashboard } from './components/uat/UATDashboard';
```

### After (No change required)
```javascript
import { UATDashboard } from './components/uat/UATDashboard';
```

### New: Import sub-components directly
```javascript
import { UATMetrics, UATFilters, TestCaseList } from './components/uat/UATDashboard';
```

## Future Enhancements

### Phase 1 (Immediate)
- [ ] Add unit tests for all 4 components
- [ ] Add PropTypes or TypeScript interfaces
- [ ] Document component APIs

### Phase 2 (Short-term)
- [ ] Extract Supabase logic to custom hooks
- [ ] Add React.memo() for performance
- [ ] Add loading states to sub-components

### Phase 3 (Long-term)
- [ ] Extract modal management to context
- [ ] Consider state management library (Redux/Zustand)
- [ ] Add analytics tracking
- [ ] Add keyboard shortcuts

## Conclusion

The refactored architecture provides:
- **Clear separation of concerns**
- **Improved maintainability** (smaller, focused components)
- **Better testability** (isolated component logic)
- **Enhanced reusability** (clean prop interfaces)
- **Optimal component sizing** (all within target ranges)

All functionality preserved, no breaking changes, build verified.
