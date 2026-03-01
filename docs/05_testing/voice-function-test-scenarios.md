---
category: testing
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [testing, auto-generated]
---
# Voice Function Test Scenarios



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Test Categories](#test-categories)
  - [1. Portfolio Overview Queries](#1-portfolio-overview-queries)
  - [2. Company-Specific Queries](#2-company-specific-queries)
  - [3. Venture Queries](#3-venture-queries)
  - [4. Idea Management Queries](#4-idea-management-queries)
  - [5. Task Management Queries](#5-task-management-queries)
  - [6. Search Queries](#6-search-queries)
  - [7. Metrics and Analytics Queries](#7-metrics-and-analytics-queries)
  - [8. Activity Tracking Queries](#8-activity-tracking-queries)
  - [9. Note Creation Commands](#9-note-creation-commands)
  - [10. Context Queries](#10-context-queries)
- [Testing Procedure](#testing-procedure)
  - [Setup](#setup)
  - [For Each Test Query](#for-each-test-query)
  - [Console Output Examples](#console-output-examples)
- [Troubleshooting Guide](#troubleshooting-guide)
  - [Function Not Triggered](#function-not-triggered)
  - [Wrong Function Called](#wrong-function-called)
  - [Function Execution Fails](#function-execution-fails)
  - [No Voice Response](#no-voice-response)
- [Performance Benchmarks](#performance-benchmarks)
- [Advanced Testing](#advanced-testing)
  - [Compound Queries](#compound-queries)
  - [Error Recovery](#error-recovery)
  - [Context Switching](#context-switching)
- [Validation Checklist](#validation-checklist)
- [Notes for Developers](#notes-for-developers)
  - [Adding New Test Cases](#adding-new-test-cases)
  - [Monitoring Production Usage](#monitoring-production-usage)
  - [Continuous Improvement](#continuous-improvement)

## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, rls, authentication

## Overview
This document provides test scenarios to verify that EVA's real-time voice interface correctly interprets user queries and executes the appropriate database functions.

## Test Categories

### 1. Portfolio Overview Queries
These test the `get_portfolio_summary` function:

**Simple Queries:**
- "What's in my portfolio?"
- "Give me a portfolio summary"
- "How many ventures do I have?"
- "What's my portfolio status?"

**Detailed Queries:**
- "Give me a detailed portfolio overview with metrics"
- "What's the current state of all my ventures and companies?"
- "Show me my portfolio performance"

**Expected Behavior:**
- Should trigger `get_portfolio_summary` function
- Return counts of companies, ventures, ideas
- Include metrics if requested

### 2. Company-Specific Queries
These test the `get_companies` function:

**List Queries:**
- "What companies do I have?"
- "List my companies"
- "Show me all my companies"

**Search Queries:**
- "Tell me about company Alpha"
- "Do I have a company called TechCorp?"
- "What's the status of my AI startup?"

**Expected Behavior:**
- Should trigger `get_companies` function
- Pass company name as parameter if mentioned
- Return company details

### 3. Venture Queries
These test the `get_ventures` function:

**Status-Based Queries:**
- "What ventures are active?"
- "Show me completed ventures"
- "Which ventures are on hold?"
- "List all my ventures"

**Recent Queries:**
- "What are my latest ventures?"
- "Show me the last 5 ventures"
- "What ventures did I start recently?"

**Expected Behavior:**
- Should trigger `get_ventures` function
- Pass status filter if mentioned
- Apply limit if number specified

### 4. Idea Management Queries
These test the `get_ideas` function:

**General Queries:**
- "What ideas have I captured?"
- "Show me my business ideas"
- "List my recent ideas"

**Time-Based Queries:**
- "What ideas did I have this week?"
- "Show me ideas from the last 30 days"
- "What concepts did I capture yesterday?"

**Expected Behavior:**
- Should trigger `get_ideas` function
- Pass days_back parameter for time queries
- Return idea list with timestamps

### 5. Task Management Queries
These test the `get_tasks` function:

**Status Queries:**
- "What tasks are pending?"
- "Show me in-progress tasks"
- "What have I completed?"
- "Are there any blocked tasks?"

**Priority Queries:**
- "What are my high priority tasks?"
- "Show me urgent items"
- "List low priority tasks"

**Assignment Queries:**
- "What's assigned to me?"
- "Show my tasks"
- "What do I need to work on?"

**Expected Behavior:**
- Should trigger `get_tasks` function
- Pass appropriate filters (status, priority, assigned_to_me)
- Return filtered task list

### 6. Search Queries
These test the `search_database` function:

**General Search:**
- "Search for project alpha"
- "Find anything about machine learning"
- "Look for customer feedback"

**Specific Table Search:**
- "Search companies for AI"
- "Find ventures about blockchain"
- "Look for ideas about sustainability"

**Expected Behavior:**
- Should trigger `search_database` function
- Pass search term
- Optionally specify table types
- Return search results across tables

### 7. Metrics and Analytics Queries
These test the `get_metrics` function:

**Revenue Queries:**
- "What's my revenue?"
- "Show me revenue metrics"
- "How much money am I making?"

**Growth Queries:**
- "What's my growth rate?"
- "Show me growth metrics"
- "How fast am I growing?"

**Time-Period Queries:**
- "Show me this month's metrics"
- "What were last quarter's numbers?"
- "Give me yearly performance"

**Expected Behavior:**
- Should trigger `get_metrics` function
- Pass metric_type and time_period
- Return formatted metrics

### 8. Activity Tracking Queries
These test the `get_recent_activity` function:

**Recent Changes:**
- "What's new?"
- "What changed recently?"
- "Show me recent activity"

**Specific Time Queries:**
- "What happened this week?"
- "Show me the last 3 days of activity"
- "What was updated yesterday?"

**Activity Type Queries:**
- "What was created recently?"
- "What got completed?"
- "Show me recent updates"

**Expected Behavior:**
- Should trigger `get_recent_activity` function
- Pass days_back parameter
- Filter by activity_type if specified

### 9. Note Creation Commands
These test the `create_quick_note` function:

**Idea Creation:**
- "Create an idea about using AI for customer service"
- "Note this idea: automated inventory management"
- "Save this concept: blockchain voting system"

**Task Creation:**
- "Create a task to review the marketing plan"
- "Add a todo: call the investor"
- "Make a task for updating the website"

**General Notes:**
- "Make a note about our discussion"
- "Save this information: meeting is at 3pm"
- "Remember to check the analytics dashboard"

**Expected Behavior:**
- Should trigger `create_quick_note` function
- Extract title and content from speech
- Determine type (idea, task, note)
- Confirm creation

### 10. Context Queries
These test the `get_eva_context` function:

**Previous Conversations:**
- "What did we talk about last time?"
- "What was our previous conversation?"
- "Show me our chat history"

**Session Queries:**
- "Show me the last 5 sessions"
- "What have we discussed recently?"
- "Get our conversation context"

**Expected Behavior:**
- Should trigger `get_eva_context` function
- Pass session_count if specified
- Return conversation summaries

## Testing Procedure

### Setup
1. Start the application: `npm run dev`
2. Open browser console to monitor function calls
3. Click "Start Voice Conversation"
4. Wait for "Listening..." indicator

### For Each Test Query
1. **Speak clearly** - Articulate the query
2. **Monitor console** for:
   - 🔧 Function call requested
   - 📦 Function arguments
   - 🔨 Executing function
   - ✅ Function result
   - 📤 Function result sent back
3. **Listen to response** - Verify it matches the data
4. **Check for errors** in console

### Console Output Examples

**Successful Function Call:**
```
🔧 Function call requested: get_portfolio_summary
📦 Function arguments: {"include_metrics": true}
🔨 Executing function: get_portfolio_summary
✅ Function result received
📤 Function result sent back to OpenAI
```

**Failed Function Call:**
```
🔧 Function call requested: get_companies
❌ Function execution failed: Network error
```

## Troubleshooting Guide

### Function Not Triggered
**Symptoms:** Query spoken but no function called
**Solutions:**
1. Rephrase query more explicitly
2. Check WebSocket connection status
3. Verify function definitions are loaded
4. Review OpenAI console for model decisions

### Wrong Function Called
**Symptoms:** Different function executed than expected
**Solutions:**
1. Improve function descriptions
2. Make query more specific
3. Check for overlapping function purposes
4. Review function parameter requirements

### Function Execution Fails
**Symptoms:** Function called but returns error
**Solutions:**
1. Check authentication (JWT token)
2. Verify database permissions
3. Check Edge Function logs
4. Test query directly in SQL editor

### No Voice Response
**Symptoms:** Function executes but no audio response
**Solutions:**
1. Check WebSocket still connected
2. Verify response.create was sent
3. Check audio output device
4. Monitor for audio stream events

## Performance Benchmarks

Expected response times:
- Function recognition: < 500ms
- Database query: 100-500ms
- Response generation: 200-400ms
- Total end-to-end: < 2 seconds

## Advanced Testing

### Compound Queries
Test multiple functions in sequence:
- "How many active ventures do I have and what tasks are pending?"
- "Search for AI projects and show me their metrics"
- "Create a note about this and show me recent activity"

### Error Recovery
Test error handling:
- Ask about non-existent data
- Request invalid date ranges
- Try creating items with missing info

### Context Switching
Test maintaining context:
- Ask follow-up questions
- Reference previous responses
- Request clarifications

## Validation Checklist

- [ ] All 10 function categories tested
- [ ] Simple queries work correctly
- [ ] Complex queries parse properly
- [ ] Parameters extracted accurately
- [ ] Responses are natural and helpful
- [ ] Error messages are user-friendly
- [ ] Performance meets benchmarks
- [ ] Edge cases handled gracefully
- [ ] Authentication working properly
- [ ] Database queries secure (RLS enforced)

## Notes for Developers

### Adding New Test Cases
1. Identify the target function
2. Create natural language variations
3. Define expected parameters
4. Document expected response format
5. Add to appropriate category above

### Monitoring Production Usage
- Track which functions are called most
- Identify common query patterns
- Find queries that fail to trigger functions
- Optimize function descriptions based on usage

### Continuous Improvement
- Regularly review OpenAI's function call decisions
- Update descriptions for better recognition
- Add new functions based on user needs
- Refine parameter extraction logic