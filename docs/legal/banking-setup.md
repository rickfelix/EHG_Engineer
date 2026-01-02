# Business Banking Setup Checklist

**Status:** DRAFT
**SD:** SD-LEGAL-STRUCTURE-001
**Created:** 2026-01-02

---

## Overview

This checklist guides the setup of business banking for EHG Holdings LLC (Series LLC). Proper banking structure is essential for:
- Maintaining liability protection between series
- Accurate financial tracking per venture
- Compliance with banking regulations
- Stripe/payment processor integration

---

## Prerequisites

Before opening a business bank account, ensure you have:

- [ ] **Certificate of Formation** (stamped by Delaware Secretary of State)
- [ ] **EIN Confirmation Letter** (IRS Form SS-4 confirmation)
- [ ] **Operating Agreement** (executed by all members)
- [ ] **Government-Issued ID** for authorized signers
- [ ] **Business Address** (physical, not P.O. Box for most banks)

---

## Bank Selection Criteria

### Recommended Features for SaaS/Software Companies

| Feature | Priority | Notes |
|---------|----------|-------|
| Online banking | Required | API access preferred |
| Wire transfers | Required | International capability |
| ACH transfers | Required | For payroll, vendor payments |
| Stripe integration | Required | Payment processing |
| Multi-user access | High | Team/accountant access |
| Sub-accounts | High | For series separation |
| Low/no monthly fees | Medium | Startup-friendly |
| Credit line | Medium | For working capital |

### Bank Options to Consider

| Bank | Type | Pros | Cons |
|------|------|------|------|
| **Mercury** | Online | Tech-focused, fast setup, no fees | Limited cash deposits |
| **Brex** | Online | Built for startups, credit line | Requires revenue |
| **Chase** | Traditional | Branch network, robust | Higher fees |
| **Bank of America** | Traditional | Business services | Higher requirements |
| **Silicon Valley Bank** | Commercial | Startup ecosystem | Higher minimums |
| **Relay** | Online | Free, multi-account | Newer platform |

---

## Account Opening Process

### Step 1: Gather Documents
- [ ] Certificate of Formation (original or certified copy)
- [ ] EIN confirmation (Letter 147C or SS-4 confirmation)
- [ ] Operating Agreement (fully executed)
- [ ] Authorized signer IDs (driver's license or passport)
- [ ] Proof of business address (utility bill, lease)

### Step 2: Choose Account Type
- [ ] **Business Checking** - Primary operating account
- [ ] **Business Savings** - Reserve funds (optional)
- [ ] **Money Market** - Higher yield for reserves (optional)

### Step 3: Online vs. In-Person
**Online Banks (Mercury, Relay, Brex):**
- [ ] Create account online
- [ ] Upload documents
- [ ] Verify identity
- [ ] Receive virtual card immediately
- [ ] Physical card in 5-7 days

**Traditional Banks (Chase, BoA):**
- [ ] Schedule appointment at branch
- [ ] Bring original documents
- [ ] Complete application in person
- [ ] Receive temporary checks
- [ ] Cards/checkbooks mailed

### Step 4: Account Verification
- [ ] Receive account number
- [ ] Set up online banking access
- [ ] Enable two-factor authentication
- [ ] Add authorized users (if applicable)
- [ ] Order physical cards/checks

---

## Series-Specific Banking (Recommended)

For liability protection, consider separate accounts per series:

### Option A: Sub-Accounts (Preferred)
Many online banks offer sub-accounts within one master account:
- [ ] Create sub-account for each series
- [ ] Name format: "EHG Holdings - [Series Name]"
- [ ] Track income/expenses per series
- [ ] Consolidated reporting available

### Option B: Separate Accounts
For stricter separation:
- [ ] Open separate account per series
- [ ] Requires full documentation per account
- [ ] Higher administrative overhead
- [ ] Strongest liability protection

---

## Payment Processing Setup

### Stripe Integration
- [ ] Create Stripe account (or connect existing)
- [ ] Connect bank account for payouts
- [ ] Verify microdeposits (2-3 business days)
- [ ] Configure payout schedule
- [ ] Test payment flow

### ACH Setup
- [ ] Enable ACH transfers
- [ ] Add vendor bank details for payments
- [ ] Set up recurring payments (if applicable)

---

## Accounting Integration

### Recommended Accounting Software
| Software | Best For | Integration |
|----------|----------|-------------|
| **QuickBooks Online** | Small-medium | Bank feeds, invoicing |
| **Xero** | Multi-entity | Multi-currency, scaling |
| **Wave** | Startups | Free, basic features |
| **Bench** | Hands-off | Bookkeeping service |

### Setup Steps
- [ ] Connect bank account to accounting software
- [ ] Enable automatic transaction import
- [ ] Set up chart of accounts
- [ ] Configure series-specific tracking (classes/locations)

---

## Security Best Practices

- [ ] Enable two-factor authentication (2FA)
- [ ] Use unique, strong passwords
- [ ] Set up transaction alerts
- [ ] Review authorized users quarterly
- [ ] Limit debit card daily limits
- [ ] Enable positive pay (if available)

---

## Tracking

Track banking setup status in database:

```sql
INSERT INTO legal_processes (
  process_type,
  status,
  checklist_items
) VALUES (
  'banking_setup',
  'pending',
  '{"bank_selected": false, "account_opened": false, "stripe_connected": false}'
);
```

---

## Timeline

| Task | Estimated Time |
|------|----------------|
| Document gathering | 1-2 days |
| Bank selection | 1 day |
| Account opening (online) | 1-2 days |
| Account opening (in-person) | 1 week |
| Stripe integration | 1-3 days |
| Accounting setup | 1 day |

**Total: 1-2 weeks**

---

*This document is for informational purposes only. Consult with a financial professional for specific banking advice.*
