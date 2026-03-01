---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# OpenAI Real-Time Voice Function Calling Documentation



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Architecture](#architecture)
  - [Components](#components)
- [How It Works](#how-it-works)
  - [1. Function Registration](#1-function-registration)
  - [2. Function Execution Flow](#2-function-execution-flow)
  - [3. Security](#3-security)
- [Adding New Functions](#adding-new-functions)
  - [Step 1: Define the Function](#step-1-define-the-function)
  - [Step 2: Implement the Function](#step-2-implement-the-function)
  - [Step 3: Deploy](#step-3-deploy)
- [Available Functions](#available-functions)
  - [Portfolio Management](#portfolio-management)
  - [Data Operations](#data-operations)
- [Best Practices](#best-practices)
  - [Function Naming](#function-naming)
  - [Function Descriptions](#function-descriptions)
  - [Parameter Design](#parameter-design)
  - [Response Format](#response-format)
  - [Error Handling](#error-handling)
- [Testing Functions](#testing-functions)
  - [Manual Testing via Voice](#manual-testing-via-voice)
  - [Console Monitoring](#console-monitoring)
  - [Edge Function Logs](#edge-function-logs)
- [Troubleshooting](#troubleshooting)
  - [Function Not Being Called](#function-not-being-called)
  - [Function Execution Errors](#function-execution-errors)
  - [No Response After Function](#no-response-after-function)
- [Future Enhancements](#future-enhancements)
  - [Planned Features](#planned-features)
  - [Performance Optimization](#performance-optimization)
- [Code Examples](#code-examples)
  - [Simple Query Function](#simple-query-function)
  - [Complex Query with Filters](#complex-query-with-filters)
  - [Create Operation](#create-operation)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, rls

## Overview
This document explains how EVA's real-time voice interface integrates with database queries using OpenAI's function calling feature. This allows EVA to answer questions about user data during voice conversations.

## Architecture

### Components
1. **Function Definitions** (`/src/lib/voice/function-definitions.ts`)
   - Catalog of all available functions
   - TypeScript definitions for function parameters
   - Helper functions for managing definitions

2. **Function Executor Edge Function** (`/supabase/functions/openai-function-executor/`)
   - Validates user authentication
   - Executes database queries securely
   - Returns formatted results

3. **EVARealtimeVoice Component** (`/src/components/eva/EVARealtimeVoice.tsx`)
   - Registers functions with OpenAI session
   - Handles function call requests
   - Sends results back to OpenAI

## How It Works

### 1. Function Registration
When a voice session starts, all function definitions are sent to OpenAI:
```typescript
const functions = getAllFunctionDefinitions();
const sessionUpdate = {
  type: 'session.update',
  session: {
    // ... other config
    tools: functions
  }
};
```

### 2. Function Execution Flow
1. User asks a question (e.g., "How many ventures do I have?")
2. OpenAI determines which function to call
3. OpenAI sends `response.function_call_arguments.done` event
4. EVARealtimeVoice calls the Edge Function
5. Edge Function queries database with user context
6. Result is sent back to OpenAI
7. OpenAI formulates a natural language response

### 3. Security
- All queries use the user's authentication token
- Row-level security (RLS) ensures data isolation
- No direct SQL execution, only predefined queries
- Edge Function validates JWT before executing

## Adding New Functions

### Step 1: Define the Function
Add to `/src/lib/voice/function-definitions.ts`:

```typescript
{
  type: 'function',
  function: {
    name: 'your_function_name',
    description: 'What this function does (helps OpenAI decide when to use it)',
    parameters: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of parameter'
        },
        param2: {
          type: 'number',
          description: 'Another parameter'
        }
      },
      required: ['param1'] // Optional required parameters
    }
  }
}
```

### Step 2: Implement the Function
Add to `/supabase/functions/openai-function-executor/index.ts`:

```typescript
// In the switch statement
case 'your_function_name':
  result = await yourFunctionImplementation(user.id, args);
  break;

// Add the implementation
async function yourFunctionImplementation(userId: string, args: any) {
  const { param1, param2 } = args;
  
  // Query the database
  const { data, error } = await supabaseAdmin
    .from('your_table')
    .select('*')
    .eq('user_id', userId);
  
  // Format the response
  return {
    data: data,
    message: `Human-readable summary of the results`
  };
}
```

### Step 3: Deploy
```bash
# Deploy the updated Edge Function
npx supabase functions deploy openai-function-executor --project-ref your-project-ref
```

## Available Functions

### Portfolio Management
- `get_portfolio_summary` - Overview of companies, ventures, and ideas
- `get_companies` - Company information
- `get_ventures` - List ventures with status
- `get_ideas` - Captured ideas and concepts
- `get_tasks` - Project tasks and status

### Data Operations
- `search_database` - Search across all tables
- `get_metrics` - Performance metrics
- `get_recent_activity` - Recent changes
- `create_quick_note` - Create notes/ideas from conversation
- `get_eva_context` - Previous conversation context

## Best Practices

### Function Naming
- Use snake_case for function names
- Be descriptive but concise
- Start with a verb (get_, create_, update_, delete_)

### Function Descriptions
- Clear, concise description of what the function does
- Include examples of when it should be used
- Help OpenAI understand the context

### Parameter Design
- Use clear parameter names
- Provide detailed descriptions
- Mark required parameters appropriately
- Use enums for limited options

### Response Format
Always return both structured data and a human-readable message:
```typescript
return {
  data: actualData,        // For potential UI display
  message: "User-friendly summary"  // For voice response
};
```

### Error Handling
- Return informative error messages
- Log errors for debugging
- Gracefully handle missing data
- Provide helpful alternatives

## Testing Functions

### Manual Testing via Voice
1. Start a voice conversation
2. Ask questions that should trigger functions:
   - "How many companies do I have?"
   - "What are my recent ventures?"
   - "Search for project alpha"
   - "Create a note about our discussion"

### Console Monitoring
Watch the browser console for:
- 🔧 Function call requested
- 🔨 Executing function
- ✅ Function result
- 📤 Function result sent back

### Edge Function Logs
Check Supabase dashboard for function execution logs:
```
https://supabase.com/dashboard/project/[project-ref]/functions
```

## Troubleshooting

### Function Not Being Called
- Check function description is clear
- Verify function is in the definitions list
- Ensure session configuration includes tools
- Test with more explicit prompts

### Function Execution Errors
- Check Edge Function logs
- Verify database permissions
- Confirm authentication is working
- Test query directly in Supabase SQL editor

### No Response After Function
- Ensure `response.create` is sent after function result
- Check WebSocket connection is still open
- Verify function result format is correct

## Future Enhancements

### Planned Features
1. **Dynamic Function Loading** - Load functions based on user permissions
2. **Function Caching** - Cache frequent queries for faster response
3. **Batch Operations** - Execute multiple functions in parallel
4. **Custom Functions** - Allow users to define their own functions
5. **Function Analytics** - Track which functions are used most

### Performance Optimization
- Implement query result caching
- Use database views for complex queries
- Optimize function parameter parsing
- Add request debouncing

## Code Examples

### Simple Query Function
```typescript
async function getSimpleData(userId: string, args: any) {
  const { data } = await supabaseAdmin
    .from('table_name')
    .select('*')
    .eq('user_id', userId);
  
  return {
    count: data?.length || 0,
    message: `You have ${data?.length || 0} items.`
  };
}
```

### Complex Query with Filters
```typescript
async function getFilteredData(userId: string, args: any) {
  const { status, limit = 10 } = args;
  
  let query = supabaseAdmin
    .from('table_name')
    .select('*')
    .eq('user_id', userId)
    .limit(limit);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data } = await query;
  
  return {
    results: data,
    message: `Found ${data?.length || 0} items${status ? ` with status ${status}` : ''}.`
  };
}
```

### Create Operation
```typescript
async function createItem(userId: string, args: any) {
  const { title, content } = args;
  
  const { data, error } = await supabaseAdmin
    .from('table_name')
    .insert({
      user_id: userId,
      title,
      content,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    return {
      success: false,
      message: 'Failed to create item.'
    };
  }
  
  return {
    success: true,
    data,
    message: `Created "${title}" successfully.`
  };
}
```

## Related Documentation
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)