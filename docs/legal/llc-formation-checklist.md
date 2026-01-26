# Delaware Series LLC Formation Checklist


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, guide, sd, ci

**Status:** DRAFT (Requires professional legal review before use)
**SD:** SD-LEGAL-STRUCTURE-001
**Created:** 2026-01-02

---

## Overview

This checklist guides the formation of a Delaware Series LLC for EHG Holdings. A Series LLC provides:
- Liability segregation between ventures (each series is a separate legal entity)
- Single Delaware filing (vs. separate LLC per venture)
- Simpler tax structure with single EIN for master LLC
- Scalability to 32+ ventures without additional state filings

---

## Pre-Formation (Week 1)

### 1. Business Name Verification
- [ ] Search Delaware Division of Corporations for name availability
- [ ] Confirm name ends with "LLC" or "L.L.C."
- [ ] Consider reserving name ($75 fee, 120-day hold)
- [ ] Website: https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx

### 2. Registered Agent Selection
- [ ] Required: Delaware address for service of process
- [ ] Options:
  - Commercial registered agent service ($50-150/year)
  - Delaware law firm
  - Physical Delaware office (if applicable)
- [ ] Recommended: Use established service (CSC, Incorp, Northwest)

### 3. Operating Agreement Preparation
- [ ] Use template from `docs/legal/operating-agreement-template.md`
- [ ] Customize for EHG Holdings structure
- [ ] Define series creation procedures
- [ ] Establish member/manager authority
- [ ] Mark as DRAFT until legal review

---

## Formation Filing (Week 2)

### 4. Certificate of Formation
- [ ] Prepare Certificate of Formation for Series LLC
- [ ] Required information:
  - LLC name (EHG Holdings LLC)
  - Series LLC designation
  - Registered agent name and address
  - Organizer signature
- [ ] Filing fee: $90 (standard) or $200 (24-hour expedited)
- [ ] File online: https://corp.delaware.gov/howtoform/

### 5. Submit to Delaware Secretary of State
- [ ] File Certificate of Formation
- [ ] Pay filing fee
- [ ] Receive stamped Certificate (proof of formation)
- [ ] Record formation date: ____________

---

## Post-Formation (Week 3-4)

### 6. EIN Application
- [ ] Apply for EIN with IRS (Form SS-4)
- [ ] Online: https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online
- [ ] Required information:
  - LLC name and address
  - Responsible party (member/manager)
  - Business purpose
- [ ] EIN received: ____________

### 7. Operating Agreement Execution
- [ ] Finalize operating agreement after legal review
- [ ] All members sign
- [ ] Store original in secure location
- [ ] Mark as FINAL with effective date

### 8. Initial Series Setup
- [ ] Document first series creation in operating agreement
- [ ] Follow series creation procedure
- [ ] Maintain separate books for each series

---

## Banking Setup

See `docs/legal/banking-setup.md` for detailed banking checklist.

### 9. Business Bank Account
- [ ] Gather required documents:
  - Certificate of Formation (stamped)
  - EIN confirmation letter
  - Operating Agreement
  - Government-issued ID
- [ ] Open business checking account
- [ ] Consider separate account per series (optional)

---

## Ongoing Compliance

### 10. Annual Requirements
- [ ] Delaware Annual Franchise Tax: Due June 1
  - Minimum: $300/year
  - File online: https://corp.delaware.gov/paytaxes/
- [ ] Maintain registered agent
- [ ] Keep operating agreement current
- [ ] Maintain separate series records

### 11. Series Creation Procedure
For each new venture, follow series creation procedure:
- [ ] Adopt series-specific operating agreement addendum
- [ ] Open series-specific bank account (recommended)
- [ ] Maintain separate accounting
- [ ] File series certificate with Delaware (optional but recommended)

---

## Resources

- Delaware Division of Corporations: https://corp.delaware.gov/
- Delaware Series LLC Act: Title 6, Chapter 18 of Delaware Code
- IRS EIN Application: https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online

---

## Tracking

Track formation status in database: `legal_processes` table with `process_type = 'llc_formation'`

```sql
INSERT INTO legal_processes (process_type, status, checklist_items)
VALUES ('llc_formation', 'pending', '{"steps": [...]}');
```

---

*This document is for informational purposes only and does not constitute legal advice. Consult with a qualified attorney before proceeding.*
