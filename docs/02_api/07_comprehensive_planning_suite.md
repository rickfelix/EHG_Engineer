# Stage 07 – Comprehensive Planning Suite PRD (Enhanced Technical Specification)


## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, unit

**Status:** Enhanced for Lovable.dev • **Owner:** EVA Core • **Scope:** AI-powered project planning with dependency management  
**Stack:** React + Vite + Tailwind • TypeScript/Zod • Supabase • Planning Engine
**Enhancement Level:** Technical Architecture Specification (Not Implementation)

---

## 1. Executive Summary

Stage 07 transforms validated ventures into comprehensive project plans with automated dependency resolution, resource optimization, and critical path analysis. This PRD provides complete technical specifications for implementing a sophisticated planning suite without requiring business logic decisions.

### Implementation Readiness: ⚠️ **Needs Business Logic** → ✅ **Immediately Buildable**

**What This PRD Defines:**
- Task dependency resolution algorithms and critical path calculations
- Resource allocation specifications with constraint optimization  
- Gantt chart data structures and timeline management
- Component architecture for planning dashboards
- Integration patterns for project management tools

**What Developers Build:**
- React components implementing these planning algorithms
- TypeScript services executing dependency resolution
- Database schemas storing project plans and schedules
- Interactive dashboards following these specifications

---

## 2. Business Logic Specification

### 2.1 Task Dependency Resolution Algorithms

The planning engine automatically resolves task dependencies using graph theory algorithms to identify critical paths and optimize schedules.

```typescript
interface TaskDependency {
  id: string;
  name: string;
  type: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  predecessorId: string;
  successorId: string;
  lagDays: number; // delay between tasks
  leadDays: number; // overlap allowed
  mandatory: boolean; // hard vs. soft dependency
  dependency_strength: number; // 0-1, used for optimization
}

interface ProjectTask {
  id: string;
  name: string;
  description: string;
  duration: number; // estimated days
  effort: number; // person-days required
  priority: number; // 1-10 priority score
  complexity: number; // 1-5 complexity rating
  skillsRequired: string[];
  resourceRequirements: ResourceRequirement[];
  deliverables: string[];
  acceptanceCriteria: string[];
  riskLevel: 'low' | 'medium' | 'high';
  bufferPercentage: number; // schedule buffer (0-1)
}
```

#### 2.1.1 Critical Path Calculation Algorithm

```
Algorithm: Critical Path Method (CPM) Implementation

1. INITIALIZE task graph
   tasks = all project tasks
   dependencies = all task dependencies
   
   FOR each task:
     earliestStart = 0
     earliestFinish = 0
     latestStart = infinity
     latestFinish = infinity

2. FORWARD PASS - Calculate earliest times
   FOR each task in topological order:
     FOR each predecessor:
       earliestStart = max(earliestStart, predecessor.earliestFinish + lagDays)
     
     earliestFinish = earliestStart + duration
     
     IF no successors: // project end task
       projectDuration = max(projectDuration, earliestFinish)

3. BACKWARD PASS - Calculate latest times  
   FOR each task in reverse topological order:
     IF no successors:
       latestFinish = earliestFinish
     ELSE:
       FOR each successor:
         latestFinish = min(latestFinish, successor.latestStart - lagDays)
     
     latestStart = latestFinish - duration

4. IDENTIFY critical path
   FOR each task:
     totalFloat = latestStart - earliestStart
     IF totalFloat == 0:
       task.isCritical = true
       criticalPath.add(task)

5. CALCULATE resource-constrained schedule
   availableResources = resource capacity per day
   
   WHILE unscheduled tasks exist:
     candidateTasks = tasks with all dependencies satisfied
     
     FOR each day:
       schedulableTasks = filter by resource availability
       prioritizedTasks = sort by (priority * criticalPath + urgency)
       
       schedule highest priority tasks within resource limits

6. OPTIMIZE schedule
   Apply heuristics:
   - Resource leveling to smooth resource usage
   - Buffer insertion for high-risk tasks
   - Parallel task optimization where dependencies allow
```

### 2.2 Resource Allocation Specifications

The system optimizes resource allocation across multiple projects and task types using constraint satisfaction algorithms.

```typescript
interface Resource {
  id: string;
  name: string;
  type: 'human' | 'equipment' | 'facility' | 'budget';
  capacity: ResourceCapacity;
  availability: AvailabilitySchedule;
  skills: string[]; // for human resources
  costPerUnit: number;
  location?: string;
  constraints: ResourceConstraint[];
}

interface ResourceCapacity {
  maxUnits: number; // maximum available units
  utilizationTarget: number; // 0-1, ideal utilization level
  overtimeAvailable: boolean;
  overtimeMultiplier: number; // cost multiplier for overtime
  sharable: boolean; // can be shared across tasks
  divisible: boolean; // can be partially allocated
}

interface ResourceAllocation {
  taskId: string;
  resourceId: string;
  unitsAllocated: number;
  startDate: Date;
  endDate: Date;
  utilizationPercentage: number;
  cost: number;
  confidence: number; // 0-1, allocation confidence
  alternatives: AlternativeAllocation[];
}
```

#### 2.2.1 Resource Optimization Algorithm

```
Algorithm: Resource-Constrained Project Scheduling

1. COLLECT resource constraints
   totalCapacity = sum of all resource capacities
   resourceDemand = sum of all task requirements
   
   utilizationRatio = resourceDemand / totalCapacity
   
   IF utilizationRatio > 1.0:
     flag as over-allocated, recommend adjustments

2. APPLY resource leveling
   FOR each resource type:
     demandProfile = calculate daily demand across project timeline
     capacityLine = available capacity per day
     
     overAllocationDays = days where demand > capacity
     
     FOR each over-allocation:
       delayableTask = find non-critical tasks on over-allocation day
       shiftTask(delayableTask, nextAvailableDay)

3. OPTIMIZE skill matching
   FOR each task requiring specific skills:
     availableResources = filter resources by required skills
     
     skillMatch = calculate skill-requirement compatibility
     costEfficiency = resource cost / productivity factor
     availability = check schedule conflicts
     
     score = (skillMatch * 0.4) + (costEfficiency * 0.3) + (availability * 0.3)
     
     assign highest scoring resource

4. BALANCE workload distribution
   FOR each resource:
     currentUtilization = calculate utilization across all assignments
     targetUtilization = resource.utilizationTarget
     
     IF currentUtilization < targetUtilization * 0.8:
       consider additional task assignments
     
     IF currentUtilization > targetUtilization * 1.1:
       redistribute tasks to other resources

5. CALCULATE cost optimization
   totalProjectCost = sum(task assignments * resource costs)
   
   WHILE cost > budget AND alternatives exist:
     expensiveAllocations = sort allocations by cost DESC
     
     FOR each expensive allocation:
       cheaperAlternatives = find resources with lower cost
       
       IF alternative meets skill requirements:
         substitute resource
         recalculate schedule impact
```

### 2.3 Gantt Chart Data Structures

The system uses optimized data structures for rendering and manipulating interactive Gantt charts.

```typescript
interface GanttConfiguration {
  timeline: {
    startDate: Date;
    endDate: Date;
    viewLevel: 'days' | 'weeks' | 'months' | 'quarters';
    workingDays: number[]; // 0=Sunday, 1=Monday, etc.
    holidays: Date[];
    workingHoursPerDay: number;
  };
  
  visualization: {
    taskHeight: 20; // pixels
    rowSpacing: 5; // pixels
    timeScale: {
      majorTicks: 'weeks';
      minorTicks: 'days';
      labelsFormat: 'MMM dd';
    };
    colors: {
      criticalPath: '#FF4444';
      normalTask: '#4A90E2';
      milestone: '#FFD700';
      dependency: '#999999';
      progress: '#00AA44';
    };
  };
  
  interactivity: {
    taskDragging: boolean;
    durationResize: boolean;
    dependencyEditing: boolean;
    resourceAssignment: boolean;
    progressUpdates: boolean;
  };
}

interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  progress: number; // 0-1 completion percentage
  
  // Visual properties
  row: number;
  color: string;
  pattern: 'solid' | 'striped' | 'dotted';
  
  // Relationships
  dependencies: string[]; // predecessor task IDs
  children: string[]; // sub-task IDs  
  parent: string | null;
  
  // Resource assignments
  assignments: ResourceAssignment[];
  
  // Metadata
  isCritical: boolean;
  isMilestone: boolean;
  isCollapsed: boolean; // for parent tasks
  baseline: {
    startDate: Date;
    endDate: Date;
    duration: number;
  };
}
```

---

## 3. Data Architecture

### 3.0 Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

Stage 07 integrates with canonical database schemas for comprehensive planning and project management:

#### Core Entity Dependencies
- **Venture Entity**: Planning data and project roadmaps from previous stages
- **Planning Suite Schema**: Comprehensive planning results and strategic roadmaps
- **Chairman Feedback Schema**: Executive planning decisions and strategic direction
- **Project Management Schema**: Task tracking and resource allocation
- **Performance Metrics Schema**: Planning effectiveness and milestone tracking

#### Universal Contract Enforcement
- **Planning Data Contracts**: All planning results conform to Stage 56 planning contracts
- **Roadmap Consistency**: Strategic plans aligned with canonical project schemas
- **Executive Planning Oversight**: Planning decisions tracked per canonical audit requirements
- **Cross-Stage Planning Flow**: Planning outputs properly formatted for downstream execution

```typescript
// Database integration for comprehensive planning
interface Stage07DatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  comprehensivePlans: Stage56PlanningSchema;
  projectRoadmaps: Stage56ProjectSchema;
  chairmanPlanningDecisions: Stage56ChairmanFeedbackSchema;
  planningMetrics: Stage56MetricsSchema;
}
```

### Integration Hub Connectivity

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

Comprehensive planning leverages Integration Hub for project management and collaboration tools:

#### Planning Tool Integration
- **Project Management APIs**: Integration with external PM tools via Integration Hub
- **Collaboration Platforms**: Team collaboration and communication tool integration
- **Resource Management**: Resource planning and allocation system integration
- **Timeline Optimization**: Planning optimization through external scheduling services

```typescript
// Integration Hub for planning suite
interface Stage07IntegrationHub {
  projectManagementConnector: Stage51ProjectMgmtConnector;
  collaborationConnector: Stage51CollaborationConnector;
  resourceMgmtConnector: Stage51ResourceConnector;
  schedulingConnector: Stage51SchedulingConnector;
}
```

### 3.1 Core Data Schemas

```typescript
// Project Plan Entity
interface PlanningSuite {
  id: string;
  ventureId: string;
  version: number; // support multiple plan versions
  
  // Plan Overview
  planName: string;
  description: string;
  objective: string;
  startDate: Date;
  targetEndDate: Date;
  actualEndDate?: Date;
  
  // Project Structure
  workBreakdownStructure: WBSNode[];
  milestones: ProjectMilestone[];
  deliverables: ProjectDeliverable[];
  
  // Scheduling
  schedule: ProjectSchedule;
  criticalPath: string[]; // task IDs on critical path
  
  // Resources
  resourcePlan: ResourcePlan;
  budgetPlan: BudgetPlan;
  
  // Risk and Dependencies
  assumptions: PlanningAssumption[];
  constraints: PlanningConstraint[];
  risks: PlanningRisk[];
  
  // Status and Progress
  status: 'draft' | 'approved' | 'in-progress' | 'completed' | 'cancelled';
  overallProgress: number; // 0-1 completion percentage
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
}

interface WBSNode {
  id: string;
  code: string; // hierarchical code like "1.2.3"
  name: string;
  description: string;
  level: number; // hierarchy depth
  parentId: string | null;
  children: string[]; // child node IDs
  
  // Task properties (if leaf node)
  isTask: boolean;
  estimatedEffort: number; // person-days
  duration: number; // calendar days
  skillsRequired: string[];
  
  // Deliverables
  deliverables: string[]; // deliverable IDs
  acceptanceCriteria: string[];
  
  // Assignment
  assignedTo: string[]; // resource IDs
  responsiblePerson: string;
  
  // Status
  status: TaskStatus;
  actualStartDate?: Date;
  actualEndDate?: Date;
  actualEffort?: number;
  progressPercentage: number;
}

interface ProjectMilestone {
  id: string;
  name: string;
  description: string;
  targetDate: Date;
  actualDate?: Date;
  type: 'internal' | 'external' | 'regulatory' | 'funding';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  
  // Dependencies
  dependentTasks: string[]; // tasks that must complete
  successCriteria: string[];
  
  // Stakeholder communication
  stakeholders: string[]; // who needs to be notified
  communicationPlan: CommunicationItem[];
  
  // Status
  status: 'planned' | 'at-risk' | 'achieved' | 'missed';
  achievementEvidence: string[];
}

interface ProjectSchedule {
  tasks: ScheduledTask[];
  dependencies: TaskDependency[];
  baselines: ScheduleBaseline[];
  
  // Critical path analysis
  criticalPathTasks: string[];
  totalFloat: Record<string, number>; // task ID -> float days
  freeFloat: Record<string, number>; // task ID -> free float days
  
  // Schedule metrics
  projectDuration: number;
  workingDays: number;
  scheduledEffort: number;
  schedulePerformanceIndex: number; // earned value metric
}

interface ResourcePlan {
  resources: ProjectResource[];
  allocations: ResourceAllocation[];
  
  // Resource analysis
  utilizationProfile: UtilizationProfile[];
  bottleneckResources: string[]; // resource IDs
  skillGaps: SkillGap[];
  
  // Resource optimization
  levelingAdjustments: LevelingAdjustment[];
  alternatives: ResourceAlternative[];
}

interface ChairmanPlanningFeedback {
  id: string;
  planningSuiteId: string;
  feedbackType: 'milestone' | 'dependency' | 'resource' | 'timeline' | 'scope';
  originalValue: any;
  suggestedValue: any;
  rationale: string;
  priority: 'low' | 'medium' | 'high';
  voiceNote?: VoiceNoteReference;
  createdAt: Date;
}
```

### 3.2 Database Schema Specification

```sql
-- Planning Suite
CREATE TABLE planning_suites (
  id UUID PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  version INTEGER,
  plan_name VARCHAR(200),
  description TEXT,
  objective TEXT,
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  status VARCHAR(20),
  overall_progress DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  last_modified_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  UNIQUE(venture_id, version)
);

-- Work Breakdown Structure
CREATE TABLE wbs_nodes (
  id UUID PRIMARY KEY,
  planning_suite_id UUID REFERENCES planning_suites(id),
  code VARCHAR(20), -- hierarchical code like "1.2.3"
  name VARCHAR(200),
  description TEXT,
  level INTEGER,
  parent_id UUID REFERENCES wbs_nodes(id),
  is_task BOOLEAN DEFAULT false,
  estimated_effort INTEGER, -- person-days
  duration INTEGER, -- calendar days
  skills_required JSONB,
  deliverables JSONB,
  acceptance_criteria JSONB,
  assigned_to JSONB, -- resource IDs
  responsible_person VARCHAR(100),
  status VARCHAR(20),
  actual_start_date DATE,
  actual_end_date DATE,
  actual_effort INTEGER,
  progress_percentage DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Milestones
CREATE TABLE project_milestones (
  id UUID PRIMARY KEY,
  planning_suite_id UUID REFERENCES planning_suites(id),
  name VARCHAR(200),
  description TEXT,
  target_date DATE,
  actual_date DATE,
  type VARCHAR(20),
  criticality VARCHAR(20),
  dependent_tasks JSONB,
  success_criteria JSONB,
  stakeholders JSONB,
  status VARCHAR(20),
  achievement_evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Dependencies
CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY,
  planning_suite_id UUID REFERENCES planning_suites(id),
  predecessor_id UUID REFERENCES wbs_nodes(id),
  successor_id UUID REFERENCES wbs_nodes(id),
  dependency_type VARCHAR(20), -- finish-to-start, etc.
  lag_days INTEGER DEFAULT 0,
  lead_days INTEGER DEFAULT 0,
  mandatory BOOLEAN DEFAULT true,
  dependency_strength DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resource Allocations
CREATE TABLE resource_allocations (
  id UUID PRIMARY KEY,
  planning_suite_id UUID REFERENCES planning_suites(id),
  task_id UUID REFERENCES wbs_nodes(id),
  resource_id VARCHAR(100),
  resource_type VARCHAR(20),
  units_allocated DECIMAL(5,2),
  start_date DATE,
  end_date DATE,
  utilization_percentage DECIMAL(3,2),
  cost DECIMAL(10,2),
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chairman Planning Feedback
CREATE TABLE chairman_planning_feedback (
  id UUID PRIMARY KEY,
  planning_suite_id UUID REFERENCES planning_suites(id),
  feedback_type VARCHAR(20),
  original_value JSONB,
  suggested_value JSONB,
  rationale TEXT,
  priority VARCHAR(10),
  voice_note_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_planning_suites_venture ON planning_suites(venture_id);
CREATE INDEX idx_wbs_nodes_planning ON wbs_nodes(planning_suite_id);
CREATE INDEX idx_wbs_nodes_parent ON wbs_nodes(parent_id);
CREATE INDEX idx_milestones_planning ON project_milestones(planning_suite_id);
CREATE INDEX idx_dependencies_planning ON task_dependencies(planning_suite_id);
CREATE INDEX idx_allocations_planning ON resource_allocations(planning_suite_id);
```

---

## 4. Component Architecture

### 4.1 Component Hierarchy

```
/features/comprehensive_planning_suite/
  /components/
    PlanningDashboard           // Main container
    WBSTreeView                 // Work breakdown structure
    GanttChartVisualization     // Interactive timeline
    ResourcePlanningBoard       // Resource allocation interface
    MilestoneTracker            // Milestone management
    DependencyMapper            // Dependency visualization
    CriticalPathIndicator       // Critical path highlighting
    ProgressReportingPanel      // Status and progress tracking
    ChairmanPlanningOverride    // Feedback and adjustments
    PlanExportModule            // Export to external tools
    
  /hooks/
    usePlanningEngine           // Core planning orchestration
    useScheduleCalculation      // Schedule and timeline logic
    useResourceOptimization     // Resource allocation algorithms
    useDependencyResolution     // Dependency management
    useCriticalPathAnalysis     // Critical path calculations
    
  /services/
    planningEngine              // Main planning service
    scheduleCalculator          // Schedule calculation algorithms
    resourceOptimizer           // Resource allocation optimizer  
    dependencyResolver          // Dependency resolution logic
    ganttDataProcessor          // Gantt chart data management
```

### 4.2 Component Specifications

#### PlanningDashboard Component

**Responsibility:** Orchestrate the complete planning experience

**Props Interface:**
```typescript
interface PlanningDashboardProps {
  venture: Venture;
  existingPlan?: PlanningSuite;
  mode: 'create' | 'edit' | 'review' | 'monitor';
  onPlanComplete: (plan: PlanningSuite) => void;
  templateId?: string; // pre-populate with template
}
```

**State Management:**
```typescript
interface PlanningDashboardState {
  status: 'initializing' | 'planning' | 'optimizing' | 'complete' | 'error';
  currentPlan: PlanningSuite | null;
  selectedView: 'wbs' | 'gantt' | 'resources' | 'milestones' | 'dependencies';
  selectedTask: string | null;
  planningProgress: number; // 0-100
  optimizationResults: OptimizationResult | null;
  validationErrors: ValidationError[];
}
```

#### GanttChartVisualization Component

**Responsibility:** Provide interactive project timeline visualization

**Features:**
```typescript
interface GanttChartFeatures {
  timeline: {
    zoomLevels: ['days', 'weeks', 'months', 'quarters'];
    autoScaling: boolean;
    customDateRanges: boolean;
    workingTimeHighlight: boolean;
  };
  
  taskManipulation: {
    dragAndDrop: boolean;
    durationResize: boolean;
    progressUpdates: boolean;
    taskCreation: boolean;
    taskDeletion: boolean;
  };
  
  visualization: {
    criticalPath: {
      highlight: boolean;
      color: string;
      lineWidth: number;
    };
    dependencies: {
      showArrows: boolean;
      curvedLines: boolean;
      dependencyLabels: boolean;
    };
    milestones: {
      diamondMarkers: boolean;
      markerSize: number;
      achievedColor: string;
      missedColor: string;
    };
  };
  
  dataLayers: {
    baseline: boolean; // show original plan
    actual: boolean; // show actual progress
    forecast: boolean; // show projections
    resources: boolean; // show resource assignments
  };
}
```

#### ResourcePlanningBoard Component

**Responsibility:** Manage resource allocation and optimization

**Board Layout:**
```typescript
interface ResourceBoardConfiguration {
  views: {
    calendar: {
      showAvailability: boolean;
      showAllocations: boolean;
      showConflicts: boolean;
      timeGranularity: 'day' | 'week' | 'month';
    };
    utilization: {
      showTargetLines: boolean;
      showOverAllocation: boolean;
      stackBySkill: boolean;
      trendProjection: boolean;
    };
    assignment: {
      dragDropAssignment: boolean;
      skillMatching: boolean;
      costOptimization: boolean;
      alternativeSuggestions: boolean;
    };
  };
  
  optimization: {
    autoLeveling: boolean;
    skillOptimization: boolean;
    costOptimization: boolean;
    scheduleFlexibility: number; // 0-1
  };
  
  alerts: {
    overAllocation: boolean;
    skillMismatch: boolean;
    budgetExceeded: boolean;
    availabilityConflicts: boolean;
  };
}
```

#### CriticalPathIndicator Component

**Responsibility:** Highlight and analyze critical path

**Analysis Features:**
```typescript
interface CriticalPathAnalysis {
  visualization: {
    highlightCriticalTasks: boolean;
    showFloatValues: boolean;
    criticalPathColor: string;
    nearCriticalThreshold: number; // days
  };
  
  analytics: {
    pathSensitivity: {
      whatIfScenarios: ScenarioAnalysis[];
      riskAssessment: CriticalPathRisk[];
      optimizationSuggestions: PathOptimization[];
    };
    
    alternatives: {
      fastTrackOptions: FastTrackOption[];
      crashingOpportunities: CrashingOption[];
      parallelizationPossibilities: ParallelizationOption[];
    };
  };
  
  monitoring: {
    progressTracking: boolean;
    delayAlerts: boolean;
    slippageForecasting: boolean;
    recoveryPlanning: boolean;
  };
}
```

---

## 5. Integration Patterns

### 5.1 Project Management Tool Integration

```typescript
interface ProjectManagementIntegrations {
  supportedTools: {
    jira: {
      endpoints: {
        projects: string;
        issues: string;
        workflows: string;
      };
      sync: {
        bidirectional: boolean;
        conflictResolution: 'manual' | 'auto' | 'hybrid';
        syncFrequency: 'real-time' | 'hourly' | 'daily';
      };
    };
    
    asana: {
      endpoints: {
        projects: string;
        tasks: string;
        teams: string;
      };
      mapping: {
        wbsToProjects: boolean;
        tasksToTasks: boolean;
        milestonesToMilestones: boolean;
      };
    };
    
    microsoftProject: {
      exportFormats: ['mpp', 'xml', 'json'];
      importFormats: ['mpp', 'xml'];
      featureMapping: {
        criticalPath: boolean;
        resourceLeveling: boolean;
        baselines: boolean;
      };
    };
  };
  
  calendar: {
    outlook: {
      milestoneSync: boolean;
      meetingCreation: boolean;
      reminderSettings: ReminderConfiguration;
    };
    google: {
      calendarIntegration: boolean;
      taskSync: boolean;
      deadlineReminders: boolean;
    };
  };
}
```

### 5.2 Real-time Collaboration Integration

```sql
-- Real-time planning collaboration
ALTER TABLE planning_suites REPLICA IDENTITY FULL;
ALTER TABLE wbs_nodes REPLICA IDENTITY FULL;
ALTER TABLE resource_allocations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE planning_suites;
ALTER PUBLICATION supabase_realtime ADD TABLE wbs_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE resource_allocations;

-- Collaborative editing policies
CREATE POLICY collaborative_planning ON planning_suites
  FOR ALL USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      JOIN venture_collaborators vc ON v.id = vc.venture_id
      WHERE vc.user_id = auth.uid() OR v.owner_id = auth.uid()
    )
  );
```

**Subscription Patterns:**
```typescript
// Real-time plan updates
const planningSubscriptions = {
  planUpdates: {
    table: 'planning_suites',
    filter: `venture_id=eq.${ventureId}`,
    event: '*',
    callback: handlePlanUpdate
  },
  
  taskUpdates: {
    table: 'wbs_nodes',
    filter: `planning_suite_id=eq.${planId}`,
    event: 'UPDATE',
    callback: handleTaskUpdate
  },
  
  resourceChanges: {
    table: 'resource_allocations',
    filter: `planning_suite_id=eq.${planId}`,
    event: '*',
    callback: handleResourceUpdate
  }
};
```

### 5.3 Export Integration Patterns

```typescript
interface ExportConfiguration {
  formats: {
    gantt: {
      pdf: {
        pageSize: 'A4' | 'A3' | 'Legal';
        orientation: 'landscape' | 'portrait';
        includeCriticalPath: boolean;
        includeDependencies: boolean;
        includeBaseline: boolean;
      };
      image: {
        format: 'png' | 'svg' | 'jpeg';
        resolution: number; // DPI
        width: number;
        height: number;
      };
    };
    
    data: {
      excel: {
        includeSchedule: boolean;
        includeResources: boolean;
        includeMilestones: boolean;
        includeFormulas: boolean;
        templateFormat: 'standard' | 'custom';
      };
      csv: {
        delimiter: ',' | ';' | '\t';
        encoding: 'utf-8' | 'iso-8859-1';
        includeHeaders: boolean;
      };
      json: {
        includeMetadata: boolean;
        prettify: boolean;
        includeCalculatedFields: boolean;
      };
    };
    
    reports: {
      executiveSummary: {
        template: string;
        includePIA: boolean; // Progress, Issues, Actions
        includeMetrics: boolean;
        includeForecasts: boolean;
      };
      detailedPlan: {
        includeWBS: boolean;
        includeDependencies: boolean;
        includeResourcePlan: boolean;
        includeRiskAssessment: boolean;
      };
    };
  };
}
```

---

## 6. Error Handling & Edge Cases

### 6.1 Planning Error Scenarios

| Scenario | Detection | Handling | User Feedback |
|----------|-----------|----------|---------------|
| Circular dependency | Graph analysis | Break circular references automatically | "Circular dependency detected and resolved" |
| Resource over-allocation | Capacity validation | Suggest alternative resources or timeline adjustment | "Resource conflicts detected - optimization suggested" |
| Invalid dependency type | Business rule validation | Revert to default dependency type | "Invalid dependency type - using default" |
| Schedule calculation overflow | Mathematical bounds checking | Cap at maximum project duration | "Project timeline exceeds maximum - review scope" |
| Critical path impossibility | Graph connectivity analysis | Identify disconnected task groups | "Unreachable tasks detected - check dependencies" |
| Milestone date conflicts | Date validation | Flag conflicting milestones for review | "Milestone date conflicts require resolution" |

### 6.2 Data Validation Specifications

```typescript
interface PlanningDataValidation {
  wbsValidation: {
    hierarchyIntegrity: {
      rule: 'each child must have valid parent reference';
      enforcement: 'strict';
      autoFix: false;
    };
    codeUniqueness: {
      rule: 'WBS codes must be unique within plan';
      enforcement: 'strict';
      autoGenerate: true;
    };
    effortConsistency: {
      rule: 'parent effort = sum of children effort';
      tolerance: 0.1; // 10% tolerance
      autoCalculate: true;
    };
  };
  
  scheduleValidation: {
    dateConsistency: {
      rule: 'start_date <= end_date for all tasks';
      enforcement: 'strict';
      autoCorrect: true;
    };
    dependencyValidity: {
      rule: 'predecessor must complete before successor starts';
      buffer: 'allow_lag_days';
      violationHandling: 'highlight_conflicts';
    };
    resourceAvailability: {
      rule: 'assigned resources must be available during task period';
      checkAvailability: true;
      suggestAlternatives: true;
    };
  };
  
  businessRuleValidation: {
    milestoneLogic: {
      rules: [
        'external milestones cannot be moved without approval',
        'critical milestones require risk assessment',
        'milestone dates must align with dependent tasks'
      ];
    };
    resourceConstraints: {
      rules: [
        'human resources cannot exceed 100% utilization',
        'equipment resources must respect maintenance schedules',
        'budget allocations cannot exceed approved limits'
      ];
    };
  };
}
```

---

## 7. Performance Requirements

### 7.1 Planning Engine Performance Targets

| Operation | Target | Maximum | Optimization Strategy |
|-----------|--------|---------|---------------------|
| WBS tree rendering | <1s | 3s | Virtual scrolling, lazy loading |
| Critical path calculation | <2s | 10s | Optimized graph algorithms |
| Resource optimization | <5s | 30s | Heuristic algorithms, incremental updates |
| Gantt chart rendering | <1s | 3s | Canvas optimization, data decimation |
| Plan export | <10s | 60s | Background processing, progress indicators |

### 7.2 Scalability Specifications

```typescript
interface PlanningScalability {
  projectSize: {
    maxTasks: 1000; // tasks per project
    maxLevels: 8; // WBS hierarchy depth
    maxDependencies: 2000; // task dependencies
    maxResources: 100; // resources per project
    maxMilestones: 50; // milestones per project
  };
  
  concurrency: {
    maxSimultaneousPlanning: 5; // users planning simultaneously
    maxConcurrentOptimizations: 2; // resource optimization runs
    realTimeUpdates: 'throttled'; // update frequency control
    conflictResolution: 'last_write_wins'; // for concurrent edits
  };
  
  dataManagement: {
    archiveThreshold: '2_years'; // archive old plan versions
    cacheStrategy: 'LRU'; // cache frequently accessed plans
    indexOptimization: true;
    partitioning: 'by_venture_id';
  };
}
```

---

## 8. Security & Privacy

### 8.1 Planning Data Security

```typescript
interface PlanningDataSecurity {
  dataClassification: {
    public: ['project_templates', 'industry_benchmarks'];
    internal: ['project_plans', 'resource_allocations'];
    confidential: ['budget_details', 'strategic_milestones'];
    restricted: ['competitive_timing', 'proprietary_methods'];
  };
  
  accessControl: {
    read: {
      'own_projects': ['project_owner', 'team_members'];
      'all_projects': ['chairman', 'portfolio_manager'];
      'summary_data': ['executives', 'board_members'];
    };
    write: {
      'plan_structure': ['project_manager', 'chairman'];
      'task_updates': ['assigned_resources', 'project_manager'];
      'approvals': ['chairman', 'steering_committee'];
    };
  };
  
  auditRequirements: {
    logActions: ['create', 'update', 'approve', 'export', 'override'];
    retentionPeriod: '7_years'; // project lifecycle + compliance
    immutableAuditLog: true;
    changeTracking: 'field_level';
  };
}
```

### 8.2 Collaborative Planning Security

```typescript
interface CollaborationSecurity {
  concurrentEditing: {
    lockingStrategy: 'optimistic'; // allow concurrent edits
    conflictDetection: 'real_time';
    conflictResolution: 'manual_review'; // require human decision
    versionControl: 'branching_merge';
  };
  
  dataIntegrity: {
    changeValidation: 'server_side';
    rollbackCapability: true;
    backupFrequency: 'on_major_changes';
    consistencyChecks: 'automated';
  };
  
  externalIntegrations: {
    apiSecurity: 'oauth2_plus_api_key';
    dataTransmission: 'encrypted_tls_1_3';
    thirdPartyAccess: 'limited_scope';
    tokenManagement: 'rotating_tokens';
  };
}
```

---

## 9. Testing Strategy

### 9.1 Planning Algorithm Testing

**Critical Path Testing:**
```typescript
interface PlanningTestSuite {
  algorithmTests: {
    criticalPath: {
      simpleSequential: {
        tasks: ProjectTask[];
        expectedCriticalPath: string[];
        expectedDuration: number;
      };
      complexNetwork: {
        tasks: ProjectTask[];
        dependencies: TaskDependency[];
        expectedCriticalPath: string[];
        alternativePaths: string[][];
      };
      resourceConstrained: {
        tasks: ProjectTask[];
        resources: Resource[];
        expectedSchedule: ScheduledTask[];
        resourceUtilization: UtilizationProfile[];
      };
    };
    
    resourceOptimization: {
      overAllocation: {
        scenario: ResourceAllocation[];
        expectedLeveling: LevelingAdjustment[];
        performanceMetrics: OptimizationMetrics;
      };
      skillMatching: {
        tasks: ProjectTask[];
        availableResources: Resource[];
        expectedAssignments: ResourceAssignment[];
        skillMatchScores: number[];
      };
    };
  };
  
  visualizationTests: {
    ganttRendering: {
      taskVolume: number;
      renderingPerformance: number;
      interactionResponsiveness: number;
    };
    dependencyVisualization: {
      complexityLevel: 'simple' | 'moderate' | 'complex';
      arrowRendering: boolean;
      labelReadability: boolean;
    };
  };
  
  integrationTests: {
    realTimeCollaboration: {
      concurrentEdits: number;
      conflictResolution: boolean;
      dataConsistency: boolean;
    };
    externalToolSync: {
      exportAccuracy: boolean;
      importFidelity: boolean;
      bidirectionalSync: boolean;
    };
  };
}
```

### 9.2 Test Data Sets

```typescript
interface PlanningTestData {
  projectTypes: {
    softwareDevelopment: {
      tasks: ProjectTask[];
      resources: Resource[];
      expectedDuration: number;
      expectedCriticalPath: string[];
    };
    productLaunch: {
      tasks: ProjectTask[];
      milestones: ProjectMilestone[];
      expectedTimeline: Date[];
    };
    researchProject: {
      tasks: ProjectTask[];
      uncertainties: UncertaintyFactor[];
      bufferRequirements: BufferCalculation[];
    };
  };
  
  complexityScenarios: {
    simple: {
      taskCount: 10;
      dependencyCount: 8;
      resourceCount: 3;
    };
    moderate: {
      taskCount: 50;
      dependencyCount: 75;
      resourceCount: 12;
    };
    complex: {
      taskCount: 200;
      dependencyCount: 350;
      resourceCount: 25;
    };
  };
  
  edgeCases: {
    circularDependencies: TaskDependency[];
    impossibleConstraints: PlanningConstraint[];
    overAllocation: ResourceDemand[];
    dateConflicts: MilestoneConflict[];
  };
}
```

---

## 10. Implementation Checklist

### Phase 1: Core Planning Engine (Days 1-5)
- [ ] Set up feature folder structure and TypeScript interfaces
- [ ] Implement WBS (Work Breakdown Structure) management
- [ ] Create task dependency resolution algorithms  
- [ ] Build critical path calculation engine
- [ ] Add basic schedule calculation logic

### Phase 2: Resource Planning (Days 6-9)
- [ ] Implement resource allocation algorithms
- [ ] Build resource optimization and leveling logic
- [ ] Create skill matching and assignment algorithms
- [ ] Add resource utilization tracking
- [ ] Implement cost calculation and budget tracking

### Phase 3: Data Layer & Storage (Days 10-12)
- [ ] Create database schemas and migrations
- [ ] Implement Supabase integration with RLS policies
- [ ] Add real-time collaboration features
- [ ] Create audit logging and change tracking
- [ ] Build data validation and integrity checks

### Phase 4: Visualization Components (Days 13-17)
- [ ] Build interactive Gantt chart component
- [ ] Create WBS tree visualization
- [ ] Implement resource planning board
- [ ] Add milestone tracking interface
- [ ] Build dependency mapping visualization

### Phase 5: Advanced Features (Days 18-20)
- [ ] Implement chairman override and feedback system
- [ ] Add external tool integration capabilities
- [ ] Build export functionality for multiple formats
- [ ] Create progress tracking and reporting
- [ ] Add optimization recommendations engine

### Phase 6: Testing & Polish (Days 21-23)
- [ ] Run comprehensive algorithm testing
- [ ] Perform load testing with large project datasets
- [ ] Test real-time collaboration features
- [ ] Validate external integrations
- [ ] Document configuration and user guides

---

## 11. Configuration Requirements

### Environment Variables

```bash
# Planning Engine Parameters
PLANNING_MAX_TASKS=1000
PLANNING_MAX_DEPENDENCIES=2000
CRITICAL_PATH_TIMEOUT_MS=10000
RESOURCE_OPTIMIZATION_ITERATIONS=1000

# Integration Settings
JIRA_API_URL=https://company.atlassian.net
ASANA_API_URL=https://app.asana.com/api/1.0
MS_PROJECT_EXPORT_ENABLED=true
CALENDAR_SYNC_ENABLED=true

# Performance Settings
GANTT_RENDER_BATCH_SIZE=100
REAL_TIME_UPDATE_THROTTLE_MS=1000
COLLABORATION_MAX_USERS=10

# Feature Flags
ENABLE_RESOURCE_OPTIMIZATION=true
ENABLE_CRITICAL_PATH_ANALYSIS=true
ENABLE_EXTERNAL_INTEGRATIONS=true
ENABLE_REAL_TIME_COLLABORATION=true
ENABLE_ADVANCED_REPORTING=true
```

### Planning Configuration

```typescript
interface PlanningConfiguration {
  defaultSettings: {
    workingHoursPerDay: 8;
    workingDaysPerWeek: 5;
    defaultTaskDuration: 1; // days
    defaultBufferPercentage: 0.1; // 10%
    criticalPathBuffer: 0.2; // 20% buffer for critical tasks
  };
  
  resourceDefaults: {
    maxUtilization: 0.85; // 85% maximum utilization
    skillMatchThreshold: 0.7; // minimum skill match score
    costOptimizationWeight: 0.3;
    scheduleOptimizationWeight: 0.7;
  };
  
  visualizationDefaults: {
    ganttTimeScale: 'weeks';
    taskHeight: 20; // pixels
    dependencyArrowColor: '#999999';
    criticalPathColor: '#FF4444';
    milestoneColor: '#FFD700';
  };
  
  validationRules: {
    maxProjectDuration: 730; // days (2 years)
    minTaskDuration: 0.5; // days
    maxTaskDuration: 90; // days
    maxDependenciesPerTask: 10;
  };
}
```

---

## 12. Success Criteria

### Definition of Done

- [ ] All planning algorithms produce mathematically correct results
- [ ] Critical path calculation handles complex dependency networks
- [ ] Resource optimization reduces over-allocation by >80%
- [ ] Gantt charts render smoothly with 500+ tasks
- [ ] Real-time collaboration works without conflicts
- [ ] Chairman override functionality captures all feedback
- [ ] Export integration works with major PM tools
- [ ] Performance meets targets for calculation and rendering
- [ ] Security controls protect sensitive project data
- [ ] Comprehensive test coverage validates all algorithms

### Acceptance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Planning accuracy | >90% schedule adherence | Post-project analysis |
| Resource optimization | >80% utilization efficiency | Resource utilization tracking |
| Critical path accuracy | >95% path identification | Expert validation |
| Rendering performance | <3s for 500 tasks | Performance monitoring |
| Chairman adoption | >85% plans reviewed | Usage analytics |
| Export fidelity | >98% data accuracy | Export validation tests |

---

## 13. Planning Templates Reference

### Pre-configured Project Templates

```typescript
const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'software-development',
    name: 'Software Development Project',
    description: 'Standard software development lifecycle',
    phases: [
      {
        name: 'Planning & Analysis',
        duration: 14, // days
        tasks: [
          { name: 'Requirements Gathering', duration: 5, effort: 20 },
          { name: 'System Design', duration: 7, effort: 35 },
          { name: 'Architecture Review', duration: 2, effort: 8 }
        ]
      },
      {
        name: 'Development',
        duration: 60,
        tasks: [
          { name: 'Backend Development', duration: 30, effort: 120 },
          { name: 'Frontend Development', duration: 25, effort: 100 },
          { name: 'Integration', duration: 10, effort: 40 }
        ]
      },
      {
        name: 'Testing & Deployment',
        duration: 21,
        tasks: [
          { name: 'Unit Testing', duration: 7, effort: 28 },
          { name: 'Integration Testing', duration: 7, effort: 28 },
          { name: 'User Acceptance Testing', duration: 5, effort: 20 },
          { name: 'Deployment', duration: 2, effort: 8 }
        ]
      }
    ],
    defaultDependencies: [
      { from: 'requirements-gathering', to: 'system-design', type: 'finish-to-start' },
      { from: 'system-design', to: 'backend-development', type: 'finish-to-start' },
      { from: 'backend-development', to: 'integration', type: 'finish-to-start' }
    ],
    resourceRequirements: [
      { role: 'project-manager', allocation: 0.5, duration: 95 },
      { role: 'backend-developer', allocation: 1.0, duration: 70 },
      { role: 'frontend-developer', allocation: 1.0, duration: 55 },
      { role: 'qa-engineer', allocation: 1.0, duration: 19 }
    ]
  }
];
```

---

**End of Enhanced PRD**

*This document provides complete technical specifications for implementing a comprehensive planning suite without implementation code. Developers should implement these specifications using the Lovable.dev stack and patterns defined herein.*