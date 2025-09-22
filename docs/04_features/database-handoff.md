# DATABASE SUB-AGENT ACTIVATION HANDOFF

**From**: EXEC Agent  
**To**: Database Sub-Agent  
**Date**: [ISO Date]  
**PRD Reference**: [PRD-ID]  
**Activation Trigger**: [schema | migration | database | query optimization | indexing]

---

## 1. EXECUTIVE SUMMARY (≤200 tokens)

**Sub-Agent**: Database Sub-Agent  
**Activation Reason**: [Database schema changes | Query optimization | Migration required]  
**Scope**: Database architecture and performance optimization  
**Priority**: Critical (Data integrity)  
**Expected Deliverable**: Optimized database implementation with migration scripts

---

## 2. SCOPE & REQUIREMENTS

### Primary Objectives:
- [ ] Design/modify database schema for new requirements
- [ ] Create safe migration scripts with rollback capability
- [ ] Optimize queries for performance and scalability
- [ ] Implement proper indexing strategy
- [ ] Ensure data integrity and constraint validation

### Success Criteria:
- [ ] Schema supports all PRD data requirements
- [ ] Migration scripts tested and reversible
- [ ] Query performance meets specified targets
- [ ] Data integrity constraints properly enforced
- [ ] Database documentation updated

### Out of Scope:
- Database administration (server setup, backups)
- Infrastructure scaling (unless query-level optimizations)
- Data migration from external systems (unless specified)

---

## 3. CONTEXT PACKAGE

**PRD Requirements**: [Copy relevant data/storage sections from PRD]

**Database Context**:
- **Database Type**: [PostgreSQL/MySQL/MongoDB/etc]
- **Current Schema**: [Location of existing schema files]
- **ORM/Query Builder**: [Prisma/TypeORM/Sequelize/Raw SQL]
- **Migration System**: [Built-in/Custom migration system]

**Performance Requirements**:
- Query Response Time: [<X ms for typical queries]
- Concurrent Connections: [Support X concurrent users]
- Data Volume: [Expected records per table]
- Backup/Recovery: [RTO/RPO requirements if specified]

**Integration Points**:
- API layer integration
- Data validation layer
- Reporting/analytics integration
- Caching layer compatibility

---

## 4. DELIVERABLES MANIFEST

### Required Outputs:
- **Schema Updates**: DDL scripts for schema changes
- **Migration Scripts**: `database/migrations/[timestamp]-[description].sql`
- **Optimized Queries**: Updated queries with performance improvements
- **Database Documentation**: `database/schema-documentation.md`

### Supporting Documentation:
- **Migration Guide**: How to apply/rollback migrations safely
- **Performance Analysis**: Before/after query performance metrics
- **Data Dictionary**: Complete field definitions and relationships

---

## 5. SUCCESS CRITERIA & VALIDATION

### Acceptance Criteria:
- [ ] All schema changes support PRD requirements
- [ ] Migration scripts run successfully (up and down)
- [ ] Query performance meets or exceeds targets
- [ ] Data integrity constraints prevent invalid data
- [ ] No existing functionality broken by changes

### Quality Gates:
- **Performance Standard**: Queries execute within specified time limits
- **Data Integrity**: All foreign keys, constraints, validations working
- **Migration Safety**: Rollback tested and functional
- **Documentation Quality**: Schema changes clearly documented

---

## 6. RESOURCE ALLOCATION

**Context Budget**: [X tokens] - Database analysis intensive  
**Time Constraint**: Complete within [X hours]  
**External Dependencies**:
- Database access and permissions
- Test database environment
- Performance testing tools
- Migration testing environment

**Escalation Path**:
- Data integrity risk → Immediate EXEC notification
- Performance target unachievable → Architecture discussion required
- Migration complexity high → Extended timeline request

---

## 7. HANDOFF REQUIREMENTS

### Immediate Actions Required:
1. **Current schema analysis** (within 1 hour)
2. **Migration planning** (within 2 hours)
3. **Test environment setup** (within 2 hours)

### Review Checkpoints:
- [ ] **Schema design approval** (within 4 hours)
- [ ] **Migration testing completed** (at 75% completion)
- [ ] **Performance validation** (before handback)

### Critical Database Alerts:
- Data integrity violation → Stop and escalate immediately
- Migration failure → Rollback and revise approach
- Performance degradation → Optimize before proceeding

---

**HANDOFF STATUS**: 🗄️ Activated - Database Sub-Agent secure and optimize data layer  
**DATA SAFETY LEVEL**: Maximum - No data loss acceptable  
**EXPECTED COMPLETION**: [Deadline with thorough testing]

---

*Template Version: LEO v4.1.1*  
*Database Sub-Agent - Secure, Fast, Reliable Data Management*