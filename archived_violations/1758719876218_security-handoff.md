# SECURITY SUB-AGENT ACTIVATION HANDOFF

**From**: EXEC Agent  
**To**: Security Sub-Agent  
**Date**: [ISO Date]  
**PRD Reference**: [PRD-ID]  
**Activation Trigger**: [authentication | authorization | PII | encryption | OWASP]

---

## 1. EXECUTIVE SUMMARY (≤200 tokens)

**Sub-Agent**: Security Sub-Agent  
**Activation Reason**: [authentication | PII handling | encryption | OWASP compliance]  
**Scope**: Security implementation and vulnerability assessment  
**Priority**: Critical  
**Expected Deliverable**: Security-hardened implementation with compliance report

---

## 2. SCOPE & REQUIREMENTS

### Primary Objectives:
- [ ] Implement secure authentication/authorization mechanisms
- [ ] Ensure proper handling of sensitive data (PII)
- [ ] Apply encryption where required
- [ ] Validate OWASP compliance
- [ ] Conduct security vulnerability assessment

### Success Criteria:
- [ ] No hardcoded secrets or credentials in code
- [ ] Proper input validation and sanitization implemented
- [ ] Secure session management in place
- [ ] Data encryption implemented as specified
- [ ] OWASP Top 10 vulnerabilities addressed

### Out of Scope:
- Infrastructure security (server hardening)
- Network security configuration
- Third-party service security (unless integration specific)

---

## 3. CONTEXT PACKAGE

**PRD Requirements**: [Copy relevant security sections from PRD]

**Technical Stack**:
- Backend: [Node.js/Python/Java/etc]
- Database: [PostgreSQL/MySQL/MongoDB/etc]
- Authentication: [JWT/OAuth/SAML/etc]
- Encryption: [AES/RSA/bcrypt/etc]

**Existing Constraints**:
- Compliance Standards: [GDPR/HIPAA/PCI-DSS/etc]
- Security Policies: [Company-specific requirements]
- Performance Impact: Minimal security overhead acceptable

**Integration Points**:
- Authentication service integration
- Database security layer
- API endpoint protection
- Frontend security measures

---

## 4. DELIVERABLES MANIFEST

### Required Outputs:
- **Security Implementation Code**: Secure authentication, encryption, validation
- **Threat Analysis Report**: `security/threat-analysis-report.md`
- **OWASP Compliance Checklist**: `security/owasp-compliance.md`
- **Security Test Results**: Penetration testing and vulnerability scan results

### Supporting Documentation:
- **Security Architecture Diagram**: Visual representation of security layers
- **Implementation Guide**: How to maintain security measures
- **Incident Response Plan**: Security breach procedures

---

## 5. SUCCESS CRITERIA & VALIDATION

### Acceptance Criteria:
- [ ] All authentication endpoints secured
- [ ] PII data properly encrypted at rest and in transit
- [ ] Input validation prevents injection attacks
- [ ] Session management follows security best practices
- [ ] No critical or high vulnerabilities detected

### Quality Gates:
- **Security Standard**: OWASP Top 10 compliance
- **Encryption Standard**: [AES-256/industry standard]
- **Authentication Standard**: Multi-factor where applicable
- **Vulnerability Threshold**: Zero critical, <3 high-severity issues

---

## 6. RESOURCE ALLOCATION

**Context Budget**: [X tokens] - Security analysis intensive  
**Time Constraint**: Complete within [X hours]  
**External Dependencies**:
- Security testing tools (OWASP ZAP, etc.)
- Encryption libraries
- Authentication services/APIs

**Escalation Path**:
- Critical vulnerability found → Immediate EXEC notification
- Compliance issue → Legal/compliance team notification
- Implementation blocker → Technical lead escalation

---

## 7. HANDOFF REQUIREMENTS

### Immediate Actions Required:
1. **Security requirements analysis** (within 1 hour)
2. **Threat modeling** (within 2 hours)
3. **Implementation planning** (within 3 hours)

### Review Checkpoints:
- [ ] **Security architecture approval** (within 4 hours)
- [ ] **Implementation progress review** (at 50% completion)
- [ ] **Security testing completion** (before handback)

### Critical Security Alerts:
- Any critical vulnerability discovered → Immediate notification
- Compliance violation detected → Escalate immediately
- Security implementation failure → Provide alternative approach

---

**HANDOFF STATUS**: ⚠️ Activated - Security Sub-Agent proceed with CRITICAL priority  
**SECURITY LEVEL**: Maximum - No shortcuts on security measures  
**EXPECTED COMPLETION**: [Deadline - Security cannot be rushed]

---

*Template Version: LEO v4.1.1*  
*Security Sub-Agent - Critical System Protection*