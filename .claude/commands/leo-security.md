---
description: Force SECURITY sub-agent analysis for security concerns
argument-hint: [describe the security concern or feature]
---

# 🔒 LEO SECURITY Sub-Agent Analysis

**Security Context:** $ARGUMENTS

## SECURITY Sub-Agent Assessment:

### 1. Authentication & Authorization
- Current auth implementation
- Session management
- Token handling (JWT, OAuth)
- Permission boundaries

### 2. Data Protection
- Sensitive data exposure
- Encryption requirements
- Data transmission security
- Storage security

### 3. Input Validation
- XSS prevention
- SQL injection protection
- CSRF tokens
- Input sanitization

### 4. OWASP Top 10 Check
- Injection vulnerabilities
- Broken authentication
- Sensitive data exposure
- XML external entities
- Broken access control
- Security misconfiguration
- Cross-site scripting
- Insecure deserialization
- Using components with vulnerabilities
- Insufficient logging

### 5. Code Security
- Hardcoded secrets
- Environment variable usage
- API key management
- Secure coding practices

## Security Recommendations:
1. Immediate vulnerabilities to fix
2. Security headers to implement
3. Authentication improvements
4. Data handling enhancements
5. Monitoring & logging needs

## Compliance Considerations:
- GDPR requirements
- PCI DSS (if applicable)
- HIPAA (if applicable)
- Industry standards

Provide specific security fixes with code examples and configuration changes.