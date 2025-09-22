# MVP Stage-1 Data Contract

## Storage Decision
- **Primary Storage**: `ventures.metadata` JSON field
- **Deprecated**: `ideas` table (exists but unused for MVP)
- **Future Migration**: When scaling, migrate metadata fields to proper tables

## Field Specifications

```typescript
interface Stage1Metadata {
  // Core fields (VentureCreationDialog)
  assumptions: string;              // Min 10 chars
  successCriteria: string;          // Min 10 chars
  stage1_complete: boolean;
  
  // EVA Integration (SD-003A)
  voice_transcript?: string;
  idea_quality_score?: number;      // 0-100
  validation_completeness?: number; // 0-100
  time_to_capture?: number;         // Seconds
  eva_suggestions?: string[];
  
  // Sourcing Modes (SD-1A)
  sourcing_mode?: 'story' | 'competitor' | 'jtbd';
  narrative_brief?: string;         // Story-first (500+ chars)
  competitor_list?: string[];       // Max 3
  gap_analysis?: string;
  jtbd_statement?: string;
  pain_severity?: number;           // 1-10
  
  // References
  chairman_feedback_ids?: string[];
}
```

## Evidence
- Ideas table defined: /mnt/c/_EHG/ehg/db/migrations/001_initial_schema.sql:53-67
- Current storage: /mnt/c/_EHG/ehg/src/components/ventures/VentureCreationDialog.tsx:107-112
- Decision rationale: Avoid migration complexity for MVP; ventures.metadata sufficient

## Related SDs
- SD-003A: EVA Stage-1 Integration
- SD-1A: Opportunity Sourcing Modes
