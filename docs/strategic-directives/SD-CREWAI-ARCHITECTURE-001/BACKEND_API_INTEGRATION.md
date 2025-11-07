# Backend API Integration Guide

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: 5 (Frontend UI - Backend Integration)
**Date**: 2025-11-06

---

## Overview

This document provides comprehensive guidance for integrating the Phase 5 frontend components (Agent Wizard & Crew Builder) with backend APIs.

---

## Required API Endpoints

### 1. Agent APIs

#### `GET /api/agents`
**Purpose**: Fetch agent library with pagination and filters

**Query Parameters**:
```typescript
{
  status?: 'active' | 'inactive' | 'archived';
  department_id?: string;
  page?: number;
  page_size?: number;
  search?: string;
}
```

**Response**:
```typescript
{
  agents: AgentSummary[];
  total: number;
  page: number;
  page_size: number;
}

interface AgentSummary {
  agent_id: string;
  agent_key: string;
  name: string;
  role: string;
  department_id?: string | null;
  tools: string[];
  status: 'active' | 'inactive' | 'archived';
}
```

**Example Implementation** (FastAPI):
```python
from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api")

class AgentSummary(BaseModel):
    agent_id: str
    agent_key: str
    name: str
    role: str
    department_id: Optional[str]
    tools: list[str]
    status: str

class AgentListResponse(BaseModel):
    agents: list[AgentSummary]
    total: int
    page: int
    page_size: int

@router.get("/agents", response_model=AgentListResponse)
async def get_agents(
    status: Optional[str] = Query('active'),
    department_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None
):
    # Query database with filters
    query = supabase.table('agents').select('*')

    if status and status != 'all':
        query = query.eq('status', status)

    if department_id:
        query = query.eq('department_id', department_id)

    if search:
        query = query.or_(f'name.ilike.%{search}%,role.ilike.%{search}%')

    # Pagination
    offset = (page - 1) * page_size
    query = query.range(offset, offset + page_size - 1)

    result = query.execute()

    return AgentListResponse(
        agents=[AgentSummary(**agent) for agent in result.data],
        total=len(result.data),  # Get count from separate query
        page=page,
        page_size=page_size
    )
```

---

#### `POST /api/agents`
**Purpose**: Create new agent

**Request Body**:
```typescript
{
  agent_key: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  department_id?: string | null;
  llm_model: string;
  temperature: number;
  max_tokens: number;
  max_rpm: number;
  max_iter: number;
  max_execution_time: number;
  max_retry_limit: number;
  allow_delegation: boolean;
  allow_code_execution: boolean;
  code_execution_mode?: 'safe' | 'unsafe' | null;
  respect_context_window: boolean;
  cache_enabled: boolean;
  memory_enabled: boolean;
  reasoning_enabled: boolean;
  max_reasoning_attempts: number;
  multimodal_enabled: boolean;
  tools: string[];
  knowledge_sources?: string[];
  embedder_config?: object | null;
  verbose: boolean;
  step_callback_url?: string | null;
  system_template?: string | null;
  prompt_template?: string | null;
  response_template?: string | null;
  inject_date: boolean;
  date_format?: string | null;
  use_system_prompt: boolean;
  metadata?: object | null;
  tags?: string[];
  status: 'active' | 'inactive' | 'archived';
}
```

**Response**:
```typescript
{
  success: boolean;
  agent_id?: string;
  message: string;
  errors?: string[];
}
```

**Example Implementation**:
```python
from uuid import uuid4

@router.post("/agents")
async def create_agent(agent: AgentFormData):
    try:
        # Validate required fields
        if not agent.agent_key or not agent.name:
            return {
                "success": False,
                "message": "Missing required fields",
                "errors": ["agent_key and name are required"]
            }

        # Check for duplicate agent_key
        existing = supabase.table('agents').select('agent_id').eq('agent_key', agent.agent_key).execute()
        if existing.data:
            return {
                "success": False,
                "message": "Agent key already exists",
                "errors": [f"Agent with key '{agent.agent_key}' already exists"]
            }

        # Insert into database
        agent_data = agent.dict()
        agent_data['agent_id'] = str(uuid4())
        agent_data['created_at'] = datetime.now().isoformat()
        agent_data['updated_at'] = datetime.now().isoformat()

        result = supabase.table('agents').insert(agent_data).execute()

        return {
            "success": True,
            "agent_id": result.data[0]['agent_id'],
            "message": "Agent created successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "message": "Failed to create agent",
            "errors": [str(e)]
        }
```

---

### 2. Code Generation APIs

#### `POST /api/code-generation/generate`
**Purpose**: Generate Python code from agent configuration

**Request Body**: Same as `POST /api/agents`

**Response**:
```typescript
{
  code: string;
  filename: string;
  ast_validation: {
    is_valid: boolean;
    errors: string[];
  };
  security_scan: {
    passed: boolean;
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      line?: number;
    }>;
  };
}
```

**Example Implementation**:
```python
import ast
import re

@router.post("/code-generation/generate")
async def generate_agent_code(agent: AgentFormData):
    try:
        # Generate Python code
        code = generate_python_code(agent)

        # AST validation
        ast_validation = validate_ast(code)

        # Security scan
        security_scan = scan_for_security_issues(code)

        return {
            "code": code,
            "filename": f"{agent.agent_key}.py",
            "ast_validation": ast_validation,
            "security_scan": security_scan
        }
    except Exception as e:
        return {
            "code": "",
            "filename": "",
            "ast_validation": {"is_valid": False, "errors": [str(e)]},
            "security_scan": {"passed": False, "issues": []}
        }

def generate_python_code(agent: AgentFormData) -> str:
    """Generate CrewAI agent Python code"""

    # Build tools import
    tools_import = ""
    if agent.tools:
        tools_import = f"from crewai_tools import {', '.join(agent.tools)}"

    # Build agent initialization
    code = f'''"""
{agent.name}
{agent.role}
"""

from crewai import Agent
{tools_import}

class {agent.agent_key.replace('-', '_').title()}Agent:
    """
    {agent.backstory}
    """

    def __init__(self):
        self.agent = Agent(
            name="{agent.name}",
            role="{agent.role}",
            goal="{agent.goal}",
            backstory="{agent.backstory}",
            llm="{agent.llm_model}",
            temperature={agent.temperature},
            max_tokens={agent.max_tokens},
            max_rpm={agent.max_rpm},
            max_iter={agent.max_iter},
            max_execution_time={agent.max_execution_time},
            max_retry_limit={agent.max_retry_limit},
            allow_delegation={agent.allow_delegation},
            allow_code_execution={agent.allow_code_execution},
            respect_context_window={agent.respect_context_window},
            cache={agent.cache_enabled},
            memory={agent.memory_enabled},
            verbose={agent.verbose},
'''

    # Add tools if any
    if agent.tools:
        tools_list = ', '.join([f"{tool}()" for tool in agent.tools])
        code += f'            tools=[{tools_list}],\n'

    code += '''        )

    def execute(self, task_description: str):
        """Execute a task with this agent"""
        return self.agent.execute_task(task_description)
'''

    return code

def validate_ast(code: str) -> dict:
    """Validate Python code syntax using AST"""
    try:
        ast.parse(code)
        return {"is_valid": True, "errors": []}
    except SyntaxError as e:
        return {
            "is_valid": False,
            "errors": [f"Syntax error at line {e.lineno}: {e.msg}"]
        }

def scan_for_security_issues(code: str) -> dict:
    """Basic security scanning"""
    issues = []

    # Check for eval/exec
    if re.search(r'\beval\(', code):
        issues.append({
            "severity": "critical",
            "message": "Use of eval() detected - potential code injection risk"
        })

    if re.search(r'\bexec\(', code):
        issues.append({
            "severity": "critical",
            "message": "Use of exec() detected - potential code injection risk"
        })

    # Check for dangerous imports
    if re.search(r'import os', code) and re.search(r'os\.system', code):
        issues.append({
            "severity": "high",
            "message": "Use of os.system() detected - command injection risk"
        })

    return {
        "passed": len(issues) == 0,
        "issues": issues
    }
```

---

### 3. Crew APIs

#### `POST /api/crews`
**Purpose**: Create new crew

**Request Body**:
```typescript
{
  crew_key: string;
  name: string;
  description: string;
  department_id?: string | null;
  process: 'sequential' | 'hierarchical' | 'consensual';
  verbose: 0 | 1 | 2;
  memory: boolean;
  cache: boolean;
  max_rpm: number;
  manager_llm?: string | null;
  manager_agent_id?: string | null;
  function_calling_llm?: string | null;
  step_callback_url?: string | null;
  task_callback_url?: string | null;
  agent_ids: string[];
  tasks: Task[];
  config?: object | null;
  status: 'draft' | 'active' | 'inactive' | 'archived';
}

interface Task {
  task_id: string;
  description: string;
  expected_output: string;
  assigned_agent_id: string;
  context_tasks?: string[];
  async_execution: boolean;
  human_input: boolean;
  output_file?: string | null;
  output_json?: string | null;
  output_pydantic?: string | null;
  callback?: string | null;
  tools?: string[];
}
```

**Response**:
```typescript
{
  success: boolean;
  crew_id?: string;
  message: string;
  errors?: string[];
}
```

**Example Implementation**:
```python
@router.post("/crews")
async def create_crew(crew: CrewFormData):
    try:
        # Validate crew
        if not crew.crew_key or not crew.name:
            return {
                "success": False,
                "message": "Missing required fields",
                "errors": ["crew_key and name are required"]
            }

        if len(crew.agent_ids) == 0:
            return {
                "success": False,
                "message": "At least one agent is required",
                "errors": ["agent_ids cannot be empty"]
            }

        # Insert crew
        crew_data = crew.dict(exclude={'tasks'})
        crew_data['crew_id'] = str(uuid4())
        crew_data['created_at'] = datetime.now().isoformat()

        crew_result = supabase.table('crews').insert(crew_data).execute()
        crew_id = crew_result.data[0]['crew_id']

        # Insert tasks
        for task in crew.tasks:
            task_data = task.dict()
            task_data['crew_id'] = crew_id
            task_data['created_at'] = datetime.now().isoformat()
            supabase.table('tasks').insert(task_data).execute()

        return {
            "success": True,
            "crew_id": crew_id,
            "message": "Crew created successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "message": "Failed to create crew",
            "errors": [str(e)]
        }
```

---

#### `POST /api/crews/generate`
**Purpose**: Generate Python code for crew

**Request Body**: Same as `POST /api/crews`

**Response**:
```typescript
{
  code: string;
  filename: string;
}
```

**Example Implementation**:
```python
@router.post("/crews/generate")
async def generate_crew_code(crew: CrewFormData):
    """Generate CrewAI crew Python code"""

    # Fetch agents
    agents_data = []
    for agent_id in crew.agent_ids:
        agent_result = supabase.table('agents').select('*').eq('agent_id', agent_id).execute()
        if agent_result.data:
            agents_data.append(agent_result.data[0])

    # Generate code
    code = f'''"""
{crew.name}
{crew.description}
"""

from crewai import Crew, Task, Agent

# Import agents
'''

    for agent in agents_data:
        code += f"from agents.{agent['agent_key']} import {agent['agent_key']}_agent\n"

    code += '''
# Initialize agents
'''
    for agent in agents_data:
        code += f"{agent['agent_key']} = {agent['agent_key']}_agent()\n"

    code += '''
# Define tasks
'''
    for i, task in enumerate(crew.tasks, 1):
        agent = next((a for a in agents_data if a['agent_id'] == task.assigned_agent_id), None)
        if agent:
            code += f'''task_{i} = Task(
    description="{task.description}",
    expected_output="{task.expected_output}",
    agent={agent['agent_key']},
    async_execution={task.async_execution},
    human_input={task.human_input},
)

'''

    code += f'''# Create crew
crew = Crew(
    agents=[{', '.join([a['agent_key'] for a in agents_data])}],
    tasks=[{', '.join([f'task_{i}' for i in range(1, len(crew.tasks) + 1)])}],
    process="{crew.process}",
    verbose={crew.verbose},
    memory={crew.memory},
    cache={crew.cache},
    max_rpm={crew.max_rpm},
)

# Execute crew
result = crew.kickoff()
print(result)
'''

    return {
        "code": code,
        "filename": f"{crew.crew_key}.py"
    }
```

---

### 4. Department API (Optional)

#### `GET /api/departments`
**Purpose**: Fetch department list

**Response**:
```typescript
{
  departments: Array<{
    department_id: string;
    name: string;
    description?: string;
  }>;
}
```

**Example Implementation**:
```python
@router.get("/departments")
async def get_departments():
    result = supabase.table('departments').select('*').execute()
    return {"departments": result.data}
```

---

## Frontend Integration

### Agent Wizard Integration

**File**: `/src/components/agents/AgentWizard/Step6ReviewGenerate.tsx`

**Update the API calls**:
```typescript
// Generate code
const handleGenerateCode = async () => {
  setIsGenerating(true);
  setGenerationError(null);

  try {
    const response = await fetch('/api/code-generation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      throw new Error('Failed to generate code');
    }

    const data = await response.json();
    setGeneratedCode(data);
  } catch (error) {
    setGenerationError(error.message);
  } finally {
    setIsGenerating(false);
  }
};

// Deploy agent
const handleDeployAgent = async () => {
  setIsDeploying(true);

  try {
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      throw new Error('Failed to deploy agent');
    }

    const data = await response.json();
    setDeploymentResult(data);
  } catch (error) {
    setDeploymentResult({
      success: false,
      message: error.message,
    });
  } finally {
    setIsDeploying(false);
  }
};
```

### Crew Builder Integration

**File**: `/src/components/crews/CrewBuilder/AgentLibrary.tsx`

**Fetch agents from API**:
```typescript
const fetchAgents = async () => {
  setIsLoading(true);
  setError(null);

  try {
    // Build query string
    const params = new URLSearchParams();
    if (filters.status !== 'all') params.append('status', filters.status);
    if (filters.department) params.append('department_id', filters.department);
    if (filters.search) params.append('search', filters.search);

    const response = await fetch(`/api/agents?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch agents');
    }

    const data = await response.json();
    setAgents(data.agents || []);
  } catch (err) {
    setError(err.message);
  } finally {
    setIsLoading(false);
  }
};
```

**File**: `/src/components/crews/CrewBuilder/CrewBuilder.tsx`

**Save crew**:
```typescript
const handleSaveCrew = async () => {
  setIsSubmitting(true);

  try {
    const response = await fetch('/api/crews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...crew,
        tasks,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save crew');
    }

    const data = await response.json();

    if (data.crew_id) {
      navigate(`/crews/${data.crew_id}`);
    } else {
      navigate('/crews');
    }
  } catch (error) {
    console.error('Failed to save crew:', error);
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## Testing Backend APIs

### Using cURL

**Test GET /api/agents**:
```bash
curl -X GET "http://localhost:8000/api/agents?status=active&page=1&page_size=25"
```

**Test POST /api/agents**:
```bash
curl -X POST "http://localhost:8000/api/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_key": "test-agent",
    "name": "Test Agent",
    "role": "Researcher",
    "goal": "Research and analyze data",
    "backstory": "An experienced researcher with expertise in data analysis",
    "llm_model": "gpt-4-turbo-preview",
    "temperature": 0.7,
    "max_tokens": 4000,
    "max_rpm": 10,
    "max_iter": 20,
    "max_execution_time": 300,
    "max_retry_limit": 2,
    "allow_delegation": false,
    "allow_code_execution": false,
    "respect_context_window": true,
    "cache_enabled": true,
    "memory_enabled": false,
    "reasoning_enabled": false,
    "max_reasoning_attempts": 3,
    "multimodal_enabled": false,
    "tools": [],
    "verbose": true,
    "inject_date": true,
    "date_format": "YYYY-MM-DD",
    "use_system_prompt": true,
    "status": "active"
  }'
```

---

## Environment Setup

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ehg
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# API
API_PORT=8000
API_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# OpenAI (for code generation)
OPENAI_API_KEY=your-openai-key
```

### Frontend (.env)
```bash
# API Base URL
VITE_API_BASE_URL=http://localhost:8000

# Supabase (for direct client access)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Next Steps

1. **Implement Backend APIs**
   - Create FastAPI routes for agents, crews, code generation
   - Add proper error handling and validation
   - Implement security measures (authentication, rate limiting)

2. **Test APIs**
   - Unit tests for each endpoint
   - Integration tests with database
   - Load testing for performance

3. **Update Frontend**
   - Replace mock data with real API calls
   - Add error handling UI
   - Implement loading states

4. **Deploy**
   - Backend: Docker + FastAPI
   - Frontend: Vite build + Nginx
   - Database: Supabase

---

**Document Version**: 1.0
**Last Updated**: 2025-11-06
**Author**: Claude Code (LEO Protocol)
