# EHG_Engineer LEO Protocol Rules

This project follows LEO Protocol v3.1.5 for strategic directive management.

## Core Principles
1. Database-first architecture with Supabase
2. Strategic Directives (SD) → Epic Execution Sequences (EES) → HAP Blocks hierarchy
3. Agent roles: LEAD (strategy), PLAN (tactics), EXEC (implementation), HUMAN (oversight)

## Database Tables
- strategic_directives_v2: Primary strategic directives
- execution_sequences_v2: Epic execution sequences  
- hap_blocks_v2: Human action protocol blocks

## Communication Standards
All agent communications must follow LEO Protocol v3.1.5 header format:
- To: [Agent Role]
- From: [Agent Role]
- Protocol: LEO Protocol v3.1.5
- Strategic Directive: [SD-ID]
- Reference Files Required: [List all relevant files]

## Project Status
Phase 1: COMPLETE - Basic project structure
Phase 2: PENDING - Database schema setup
Phase 3: PENDING - Templates and documentation
Phase 4: PENDING - First Strategic Directive