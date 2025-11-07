# Code Generation Architecture — SD-CREWAI-ARCHITECTURE-001

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: PLAN (Architecture Design)
**Feature**: Dynamic Python Agent Code Generation
**Date**: 2025-11-06
**Status**: ✅ **COMPLETE** (Architecture Design)

---

## Executive Summary

This document defines the architecture for **dynamic Python code generation** that converts database agent configurations into deployable CrewAI agent code. The system uses Jinja2 templates, AST validation, security scanning, manual review workflow, and Git integration to ensure safe, reliable code generation.

**Core Capability**: UI → Database → Template → Python Code → Git → Deployment

**Security Model**: Multi-layer validation (input sanitization, AST parsing, import blacklist, manual review)

**Timeline**: Phase 4 of implementation (2 weeks, 500-600 LOC estimated)

---

## Architecture Overview

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: UI INPUT                        │
│                  (Agent Wizard Form)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 LAYER 2: API VALIDATION                      │
│            (Input Sanitization, Type Checking)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                LAYER 3: DATABASE STORAGE                     │
│           (crewai_agents, agent_memory_configs)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              LAYER 4: CODE GENERATION ENGINE                 │
│          (Jinja2 Template Rendering + Variables)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               LAYER 5: SECURITY PIPELINE                     │
│        (AST Validation, Import Blacklist, Sanitization)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               LAYER 6: CODE REVIEW WORKFLOW                  │
│           (Manual Approval, PR Creation, Comments)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                LAYER 7: GIT INTEGRATION                      │
│         (Commit, Branch, PR, Merge, Deployment Path)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 8: DEPLOYMENT                         │
│          (File Write, Python Import, Agent Execution)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Design (300-600 LOC Each)

### Component 1: Code Generation Engine

**Purpose**: Convert database record → Python code via Jinja2 template

**File**: `agent-platform/app/services/code_generator.py`

**Size**: 350-400 LOC

**Responsibilities**:
- Load agent config from database
- Render Jinja2 template with config variables
- Handle optional fields (memory, reasoning, knowledge sources)
- Generate proper imports based on features used
- Format code with Black (PEP 8)

**Key Functions**:
```python
class AgentCodeGenerator:
    def __init__(self, db_connection):
        self.db = db_connection
        self.jinja_env = Environment(loader=FileSystemLoader('templates/'))

    def generate_agent_code(self, agent_id: UUID) -> str:
        """
        Generate Python agent code from database configuration

        Returns:
            str: Formatted Python code ready for deployment
        """
        # 1. Load agent config from database
        agent = self.db.query_agent(agent_id)
        memory_config = self.db.query_memory_config(agent.memory_config_id) if agent.memory_enabled else None

        # 2. Build template variables
        template_vars = self._build_template_variables(agent, memory_config)

        # 3. Render template
        template = self.jinja_env.get_template('agent_class_template.py.jinja2')
        code = template.render(**template_vars)

        # 4. Format with Black
        formatted_code = black.format_str(code, mode=black.FileMode())

        return formatted_code

    def _build_template_variables(self, agent, memory_config) -> dict:
        """Build template variables from database config"""
        return {
            'class_name': self._to_class_name(agent.agent_key),
            'role': agent.role,
            'goal': agent.goal,
            'backstory': agent.backstory,
            'tools': agent.tools,
            'llm_model': agent.llm_model,
            'temperature': agent.temperature,
            'max_tokens': agent.max_tokens,
            # ... all 35 agent parameters
            'memory_enabled': agent.memory_enabled,
            'memory_config': self._build_memory_config(memory_config) if memory_config else None,
            'reasoning_enabled': agent.reasoning_enabled,
            # ... etc
        }
```

**Template Variables** (35 total):
- Basic: `role`, `goal`, `backstory`, `tools`
- LLM: `llm_model`, `temperature`, `max_tokens`, `max_rpm`, `max_iter`, `max_execution_time`, `max_retry_limit`
- Behavior: `allow_delegation`, `allow_code_execution`, `code_execution_mode`, `respect_context_window`, `cache_enabled`
- Memory: `memory_enabled`, `memory_config` (nested object)
- Reasoning: `reasoning_enabled`, `max_reasoning_attempts`
- Templates: `system_template`, `prompt_template`, `response_template`, `inject_date`, `date_format`
- Multimodal: `multimodal_enabled`
- Advanced LLM: `function_calling_llm`, `use_system_prompt`
- Knowledge: `knowledge_sources`, `embedder_config`
- Observability: `verbose`, `step_callback_url`

---

### Component 2: Security Validation Pipeline

**Purpose**: Validate generated code for security issues

**File**: `agent-platform/app/services/security_validator.py`

**Size**: 300-350 LOC

**Responsibilities**:
- AST parsing (syntax validation)
- Import blacklist enforcement
- Input sanitization verification
- Code pattern detection (dangerous operations)
- Generate security scan report

**Key Functions**:
```python
class SecurityValidator:
    # Dangerous imports that should never appear in generated code
    IMPORT_BLACKLIST = [
        'os',        # File system access
        'subprocess',  # Shell execution
        'eval',      # Dynamic code execution
        'exec',      # Dynamic code execution
        '__import__',  # Dynamic imports
        'pickle',    # Arbitrary code execution
        'shelve',    # Pickle-based storage
        'sys',       # System-level access (partial - allow sys.path)
        'socket',    # Network access (unless explicitly allowed)
        'requests',  # HTTP requests (unless explicitly allowed)
    ]

    def validate_code(self, code: str) -> SecurityScanResult:
        """
        Run security validation pipeline on generated code

        Returns:
            SecurityScanResult with pass/fail + issues list
        """
        issues = []

        # Step 1: AST Validation
        ast_result = self._validate_ast(code)
        if not ast_result.passed:
            issues.extend(ast_result.errors)
            return SecurityScanResult(passed=False, issues=issues)

        # Step 2: Import Blacklist Check
        import_issues = self._check_imports(ast_result.ast_tree)
        issues.extend(import_issues)

        # Step 3: Dangerous Pattern Detection
        pattern_issues = self._detect_dangerous_patterns(ast_result.ast_tree)
        issues.extend(pattern_issues)

        # Step 4: String Sanitization Check
        sanitization_issues = self._check_string_sanitization(code)
        issues.extend(sanitization_issues)

        passed = len(issues) == 0
        return SecurityScanResult(passed=passed, issues=issues)

    def _validate_ast(self, code: str) -> ASTValidationResult:
        """Parse code into AST (syntax validation)"""
        try:
            ast_tree = ast.parse(code)
            return ASTValidationResult(passed=True, ast_tree=ast_tree, errors=[])
        except SyntaxError as e:
            return ASTValidationResult(
                passed=False,
                ast_tree=None,
                errors=[f"Syntax error at line {e.lineno}: {e.msg}"]
            )

    def _check_imports(self, ast_tree) -> List[str]:
        """Check for blacklisted imports"""
        issues = []
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in self.IMPORT_BLACKLIST:
                        issues.append(f"CRITICAL: Blacklisted import '{alias.name}' at line {node.lineno}")
            elif isinstance(node, ast.ImportFrom):
                if node.module in self.IMPORT_BLACKLIST:
                    issues.append(f"CRITICAL: Blacklisted import 'from {node.module}' at line {node.lineno}")
        return issues

    def _detect_dangerous_patterns(self, ast_tree) -> List[str]:
        """Detect dangerous code patterns"""
        issues = []
        for node in ast.walk(ast_tree):
            # Check for eval/exec calls
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in ['eval', 'exec']:
                    issues.append(f"CRITICAL: Use of {node.func.id}() at line {node.lineno}")

            # Check for subprocess calls
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Attribute) and node.func.attr in ['call', 'run', 'Popen']:
                    issues.append(f"WARNING: Subprocess call at line {node.lineno}")

        return issues
```

**Security Scan Result**:
```python
@dataclass
class SecurityScanResult:
    passed: bool
    issues: List[str]
    severity_breakdown: Dict[str, int] = field(default_factory=dict)  # {'CRITICAL': 2, 'WARNING': 5}
```

---

### Component 3: Code Review Workflow Manager

**Purpose**: Manage manual code review process

**File**: `agent-platform/app/services/code_review_workflow.py`

**Size**: 400-450 LOC

**Responsibilities**:
- Create deployment record in database
- Generate Git branch for review
- Create GitHub PR (if configured)
- Track review status
- Handle approval/rejection/changes
- Support rollback to previous version

**Key Functions**:
```python
class CodeReviewWorkflow:
    def __init__(self, db_connection, git_client):
        self.db = db_connection
        self.git = git_client

    def create_deployment_request(
        self,
        agent_id: UUID,
        generated_code: str,
        template_version: str,
        generated_by: UUID
    ) -> UUID:
        """
        Create deployment request in database

        Returns:
            deployment_id: UUID for tracking
        """
        # Get agent key
        agent = self.db.query_agent(agent_id)

        # Create deployment record
        deployment_id = self.db.insert_code_deployment({
            'agent_id': agent_id,
            'agent_key': agent.agent_key,
            'generated_code': generated_code,
            'template_version': template_version,
            'generation_timestamp': datetime.utcnow(),
            'generated_by': generated_by,
            'deployment_status': 'pending',
            'review_status': 'pending',
            'ast_validation_passed': False,  # Will be updated by security pipeline
            'security_scan_passed': False,   # Will be updated by security pipeline
        })

        return deployment_id

    def submit_for_review(
        self,
        deployment_id: UUID,
        create_pr: bool = False
    ) -> ReviewSubmissionResult:
        """
        Submit code for manual review

        If create_pr=True, creates GitHub PR for review workflow
        """
        deployment = self.db.query_deployment(deployment_id)

        # Check security scan passed
        if not deployment.security_scan_passed:
            raise ValueError("Cannot submit for review: Security scan failed")

        # Create Git branch
        branch_name = f"agent-code/{deployment.agent_key}-{deployment_id[:8]}"
        self.git.create_branch(branch_name)

        # Write code to file
        file_path = f"agent-platform/app/agents/{deployment.agent_key}.py"
        self.git.write_file(file_path, deployment.generated_code, branch=branch_name)

        # Commit
        commit_hash = self.git.commit(
            message=f"feat(agents): Generate code for {deployment.agent_key}",
            branch=branch_name
        )

        # Create PR if requested
        pr_number = None
        if create_pr:
            pr_number = self.git.create_pull_request(
                title=f"Agent Code: {deployment.agent_key}",
                body=self._generate_pr_body(deployment),
                head_branch=branch_name,
                base_branch="main"
            )

        # Update deployment record
        self.db.update_deployment(deployment_id, {
            'deployment_status': 'review_required',
            'git_branch': branch_name,
            'git_commit_hash': commit_hash,
            'git_pr_number': pr_number,
        })

        return ReviewSubmissionResult(
            branch=branch_name,
            commit_hash=commit_hash,
            pr_number=pr_number
        )

    def approve_deployment(
        self,
        deployment_id: UUID,
        reviewer_id: UUID,
        comments: Optional[str] = None
    ):
        """Approve deployment and merge to main"""
        deployment = self.db.query_deployment(deployment_id)

        # Merge PR (if exists)
        if deployment.git_pr_number:
            self.git.merge_pull_request(deployment.git_pr_number)
        else:
            # Direct merge
            self.git.merge_branch(deployment.git_branch, "main")

        # Update deployment record
        self.db.update_deployment(deployment_id, {
            'review_status': 'approved',
            'deployment_status': 'deployed',
            'reviewer_id': reviewer_id,
            'review_comments': comments,
            'reviewed_at': datetime.utcnow(),
            'deployment_timestamp': datetime.utcnow(),
            'is_active': True,  # Mark as active deployment
        })

        # Deactivate previous deployments for this agent
        self.db.deactivate_previous_deployments(deployment.agent_id, deployment_id)
```

---

### Component 4: Jinja2 Template System

**Purpose**: Define reusable templates for agent code generation

**File**: `agent-platform/templates/agent_class_template.py.jinja2`

**Size**: 200-250 lines (template + conditionals)

**Template Structure**:
```jinja2
{# agent_class_template.py.jinja2 #}
{# Template Version: 1.0.0 #}
{# CrewAI Version: 1.3.0 #}

"""
{{ class_name }} - Auto-generated CrewAI Agent
Generated: {{ generation_timestamp }}
Template: {{ template_version }}
Agent ID: {{ agent_id }}
"""

from crewai import Agent
{% if memory_enabled %}
from crewai import Memory
{% endif %}
{% if knowledge_sources %}
from crewai.knowledge.source import BaseKnowledgeSource
{% endif %}
{% if tools %}
from crewai_tools import {{ tools | join(', ') }}
{% endif %}

class {{ class_name }}:
    """
    {{ role }}

    Goal: {{ goal }}

    Backstory:
    {{ backstory | indent(4) }}
    """

    def __init__(self):
        self.agent = self._create_agent()

    def _create_agent(self) -> Agent:
        """Create and configure CrewAI agent"""

        {% if memory_enabled and memory_config %}
        # Memory configuration
        memory = Memory(
            short_term={{ memory_config.short_term_enabled | lower }},
            long_term={{ memory_config.long_term_enabled | lower }},
            entity={{ memory_config.entity_enabled | lower }},
            contextual={{ memory_config.contextual_enabled | lower }},
            user={{ memory_config.user_enabled | lower }},
            storage={
                "type": "{{ memory_config.storage_type }}",
                {% if memory_config.storage_connection_string %}
                "connection_string": "{{ memory_config.storage_connection_string }}"
                {% endif %}
            }
        )
        {% else %}
        memory = None
        {% endif %}

        {% if knowledge_sources %}
        # Knowledge sources (RAG)
        knowledge_sources = [
            {% for source in knowledge_sources %}
            BaseKnowledgeSource(
                source_id="{{ source.id }}",
                source_type="{{ source.source_type }}",
                embedder="{{ embedder_config.provider if embedder_config else 'openai' }}"
            ),
            {% endfor %}
        ]
        {% else %}
        knowledge_sources = None
        {% endif %}

        {% if tools %}
        # Agent tools
        tools = [
            {% for tool in tools %}
            {{ tool }}(),
            {% endfor %}
        ]
        {% else %}
        tools = []
        {% endif %}

        # Create agent
        agent = Agent(
            role="{{ role }}",
            goal="{{ goal }}",
            backstory="""{{ backstory }}""",
            tools=tools,

            # LLM Configuration
            llm="{{ llm_model }}",
            temperature={{ temperature }},
            max_tokens={{ max_tokens }},
            max_rpm={{ max_rpm }},
            max_iter={{ max_iter }},
            max_execution_time={{ max_execution_time }},
            max_retry_limit={{ max_retry_limit }},

            # Agent Behavior
            allow_delegation={{ allow_delegation | lower }},
            allow_code_execution={{ allow_code_execution | lower }},
            {% if allow_code_execution %}
            code_execution_mode="{{ code_execution_mode }}",
            {% endif %}
            respect_context_window={{ respect_context_window | lower }},
            cache={{ cache_enabled | lower }},

            # Memory System (CrewAI 1.3.0)
            {% if memory_enabled %}
            memory=memory,
            {% endif %}

            # Reasoning & Planning (CrewAI 1.3.0)
            {% if reasoning_enabled %}
            reasoning={{ reasoning_enabled | lower }},
            max_reasoning_attempts={{ max_reasoning_attempts }},
            {% endif %}

            # Prompt Templates
            {% if system_template %}
            system_template="""{{ system_template }}""",
            {% endif %}
            {% if prompt_template %}
            prompt_template="""{{ prompt_template }}""",
            {% endif %}
            {% if response_template %}
            response_template="""{{ response_template }}""",
            {% endif %}
            inject_date={{ inject_date | lower }},
            {% if inject_date %}
            date_format="{{ date_format }}",
            {% endif %}

            # Multimodal (CrewAI 1.3.0)
            {% if multimodal_enabled %}
            multimodal={{ multimodal_enabled | lower }},
            {% endif %}

            # Advanced LLM
            {% if function_calling_llm %}
            function_calling_llm="{{ function_calling_llm }}",
            {% endif %}
            use_system_prompt={{ use_system_prompt | lower }},

            # Knowledge Sources (CrewAI 1.3.0)
            {% if knowledge_sources %}
            knowledge_sources=knowledge_sources,
            {% endif %}

            # Observability
            verbose={{ verbose | lower }},
            {% if step_callback_url %}
            step_callback="{{ step_callback_url }}",
            {% endif %}
        )

        return agent

    def execute(self, task_description: str, **kwargs) -> str:
        """Execute task with this agent"""
        from crewai import Task

        task = Task(
            description=task_description,
            expected_output=kwargs.get('expected_output', 'Task completed successfully'),
            agent=self.agent
        )

        result = self.agent.execute_task(task)
        return result
```

**Template Filters** (Jinja2 custom filters):
- `to_class_name`: Convert `senior-market-analyst` → `SeniorMarketAnalyst`
- `escape_string`: Escape quotes in strings
- `indent`: Indent multi-line strings
- `lower`: Boolean to lowercase (`True` → `true`)

---

### Component 5: Git Integration Service

**Purpose**: Handle Git operations (branch, commit, PR, merge)

**File**: `agent-platform/app/services/git_integration.py`

**Size**: 350-400 LOC

**Responsibilities**:
- Create/delete branches
- Commit code changes
- Create/merge GitHub PRs
- Tag releases
- Handle merge conflicts

**Key Functions**:
```python
class GitIntegration:
    def __init__(self, repo_path: str, github_token: str):
        self.repo_path = repo_path
        self.repo = git.Repo(repo_path)
        self.github_client = Github(github_token)

    def create_branch(self, branch_name: str, base_branch: str = "main") -> str:
        """Create new branch from base branch"""
        # Fetch latest
        self.repo.remotes.origin.fetch()

        # Checkout base branch
        self.repo.git.checkout(base_branch)
        self.repo.git.pull()

        # Create new branch
        self.repo.git.checkout('-b', branch_name)

        return branch_name

    def write_file(self, file_path: str, content: str, branch: str):
        """Write file to repository"""
        self.repo.git.checkout(branch)

        full_path = os.path.join(self.repo_path, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        with open(full_path, 'w') as f:
            f.write(content)

        self.repo.git.add(file_path)

    def commit(self, message: str, branch: str) -> str:
        """Commit changes"""
        self.repo.git.checkout(branch)
        commit = self.repo.git.commit('-m', message)

        # Push to remote
        self.repo.git.push('origin', branch)

        # Get commit hash
        commit_hash = self.repo.head.commit.hexsha
        return commit_hash

    def create_pull_request(
        self,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str = "main"
    ) -> int:
        """Create GitHub PR"""
        repo_name = self.repo.remotes.origin.url.split(':')[1].replace('.git', '')
        github_repo = self.github_client.get_repo(repo_name)

        pr = github_repo.create_pull(
            title=title,
            body=body,
            head=head_branch,
            base=base_branch
        )

        return pr.number
```

---

## Security Model (Multi-Layer Defense)

### Layer 1: Input Validation (API)

**Before database insert**:
```python
def validate_agent_input(data: dict) -> ValidationResult:
    issues = []

    # Role: alphanumeric + spaces only, max 200 chars
    if not re.match(r'^[a-zA-Z0-9\s]+$', data['role']):
        issues.append("Role contains invalid characters")

    # Backstory: max 2000 chars, no script tags
    if '<script' in data['backstory'].lower():
        issues.append("Backstory contains dangerous content")

    # Tools: whitelist only
    ALLOWED_TOOLS = ['search_openvc', 'search_growjo', 'query_knowledge_base', ...]
    for tool in data['tools']:
        if tool not in ALLOWED_TOOLS:
            issues.append(f"Tool '{tool}' not in whitelist")

    return ValidationResult(passed=len(issues)==0, issues=issues)
```

### Layer 2: Template Rendering (Jinja2)

**Sandboxed environment**:
```python
from jinja2.sandbox import SandboxedEnvironment

env = SandboxedEnvironment(
    loader=FileSystemLoader('templates/'),
    autoescape=True  # Escape HTML/XML
)
```

**Whitelist filters only**:
- Only predefined filters allowed (`to_class_name`, `escape_string`, `indent`, `lower`)
- No arbitrary Python code execution in templates

### Layer 3: AST Validation

**Syntax check**:
```python
try:
    ast.parse(generated_code)
except SyntaxError as e:
    # FAIL: Code has syntax errors
    pass
```

### Layer 4: Import Blacklist

**Block dangerous imports**:
```python
IMPORT_BLACKLIST = ['os', 'subprocess', 'eval', 'exec', '__import__', 'pickle', 'socket']

for node in ast.walk(ast_tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            if alias.name in IMPORT_BLACKLIST:
                # FAIL: Blacklisted import detected
                pass
```

### Layer 5: Pattern Detection

**Detect dangerous operations**:
```python
# Check for eval/exec calls
if isinstance(node, ast.Call):
    if node.func.id in ['eval', 'exec']:
        # FAIL: eval/exec detected
        pass

# Check for subprocess
if node.func.attr in ['call', 'run', 'Popen']:
    # FAIL: subprocess detected
    pass
```

### Layer 6: Manual Review

**Human approval required**:
- Code changes reviewed in GitHub PR
- Security scan results visible
- Reviewer can approve/reject/request changes
- No auto-merge without approval

### Layer 7: Git Audit Trail

**Full traceability**:
- Every code change has Git commit
- Deployment record links to commit hash
- PR number stored in database
- Rollback possible via Git history

---

## Database Schema Integration

### Table: `agent_code_deployments`

**Purpose**: Track all code generation attempts and deployments

```sql
CREATE TABLE agent_code_deployments (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES crewai_agents(id),
  agent_key VARCHAR(100),

  -- Code Generation
  generated_code TEXT NOT NULL,
  template_version VARCHAR(20) DEFAULT 'v1.0.0',
  generation_timestamp TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID,  -- auth.uid()

  -- Validation
  ast_validation_passed BOOLEAN DEFAULT false,
  ast_validation_errors JSONB,
  security_scan_passed BOOLEAN DEFAULT false,
  security_issues JSONB,

  -- Deployment
  deployment_status VARCHAR(20) DEFAULT 'pending', -- pending, review_required, approved, deployed, failed, rolled_back
  deployment_path TEXT,  -- /ehg/agent-platform/app/agents/senior_market_analyst.py
  deployment_timestamp TIMESTAMPTZ,
  deployed_by UUID,

  -- Git Integration
  git_commit_hash VARCHAR(40),
  git_branch VARCHAR(100) DEFAULT 'main',
  git_pr_number INTEGER,

  -- Review Workflow
  review_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, needs_changes
  reviewer_id UUID,
  review_comments TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Rollback
  is_active BOOLEAN DEFAULT false,  -- Only one active deployment per agent
  replaced_by UUID REFERENCES agent_code_deployments(id),
  rollback_possible BOOLEAN DEFAULT true
);
```

**Workflow States**:
```
pending → review_required → approved → deployed
                          → rejected
                          → needs_changes → review_required
```

---

## API Endpoints (Code Generation)

### POST /api/agents/{agent_id}/generate-code

**Purpose**: Generate code for agent

**Request**:
```json
{
  "create_pr": true,  // Create GitHub PR
  "deploy_immediately": false  // Requires approval if true
}
```

**Response**:
```json
{
  "deployment_id": "uuid",
  "generated_code": "...",
  "ast_validation": {
    "passed": true,
    "errors": []
  },
  "security_scan": {
    "passed": true,
    "issues": []
  },
  "git": {
    "branch": "agent-code/senior-market-analyst-abc123",
    "commit_hash": "abc123...",
    "pr_number": 42,
    "pr_url": "https://github.com/rickfelix/ehg/pull/42"
  }
}
```

### POST /api/code-deployments/{deployment_id}/review

**Purpose**: Submit review decision

**Request**:
```json
{
  "decision": "approved",  // approved, rejected, needs_changes
  "comments": "Code looks good, approved for deployment"
}
```

**Response**:
```json
{
  "deployment_status": "deployed",
  "deployment_path": "/ehg/agent-platform/app/agents/senior_market_analyst.py",
  "deployment_timestamp": "2025-11-06T10:30:00Z"
}
```

### POST /api/code-deployments/{deployment_id}/rollback

**Purpose**: Rollback to previous version

**Request**:
```json
{
  "rollback_to_version": "previous_deployment_id"
}
```

---

## Error Handling

### Error Scenarios

| Error | Detection | Action |
|-------|-----------|--------|
| **Syntax Error** | AST parsing fails | Reject deployment, return error to user, DO NOT save |
| **Blacklisted Import** | Import checker detects | Reject deployment, alert security team, log incident |
| **Security Pattern** | Pattern detector finds dangerous code | Reject deployment, require manual review override |
| **Template Error** | Jinja2 rendering fails | Reject deployment, check template version, alert developer |
| **Git Conflict** | Merge fails | Pause deployment, require manual conflict resolution |
| **Deployment Failure** | File write fails | Rollback changes, mark deployment as failed, alert ops team |

### Logging & Monitoring

**Log all events**:
```python
logger.info(f"Code generation started: agent_id={agent_id}, user={user_id}")
logger.warning(f"Security scan found issues: deployment_id={deployment_id}, issues={len(issues)}")
logger.error(f"Deployment failed: deployment_id={deployment_id}, error={error}")
logger.critical(f"Blacklisted import detected: deployment_id={deployment_id}, import={import_name}")
```

**Metrics to track**:
- Code generations per day
- Security scan pass rate
- Average review time
- Deployment success rate
- Rollback frequency

---

## Testing Strategy

### Unit Tests

**Test code generation**:
```python
def test_generate_agent_code():
    generator = AgentCodeGenerator(db)
    code = generator.generate_agent_code(agent_id='test-agent')

    assert 'class SeniorMarketAnalyst:' in code
    assert 'from crewai import Agent' in code
    assert code.strip().endswith('return agent')
```

**Test security validation**:
```python
def test_security_validator_blocks_dangerous_imports():
    validator = SecurityValidator()

    malicious_code = """
    import os
    os.system('rm -rf /')
    """

    result = validator.validate_code(malicious_code)
    assert not result.passed
    assert any('os' in issue for issue in result.issues)
```

### Integration Tests

**Test full workflow**:
```python
def test_code_generation_workflow():
    # 1. Create agent in database
    agent_id = create_test_agent()

    # 2. Generate code
    code = code_generator.generate_agent_code(agent_id)

    # 3. Validate security
    security_result = security_validator.validate_code(code)
    assert security_result.passed

    # 4. Create deployment
    deployment_id = review_workflow.create_deployment_request(agent_id, code, 'v1.0.0', user_id)

    # 5. Submit for review
    review_result = review_workflow.submit_for_review(deployment_id, create_pr=True)
    assert review_result.pr_number is not None

    # 6. Approve deployment
    review_workflow.approve_deployment(deployment_id, reviewer_id, 'Approved')

    # 7. Verify deployment
    deployment = db.query_deployment(deployment_id)
    assert deployment.deployment_status == 'deployed'
    assert deployment.is_active == True
```

### E2E Tests (Playwright)

**Test UI workflow**:
```typescript
test('Agent Wizard generates and deploys code', async ({ page }) => {
  // 1. Navigate to Agent Wizard
  await page.goto('/agents/create');

  // 2. Fill out form
  await page.fill('[name="role"]', 'Senior Market Analyst');
  await page.fill('[name="goal"]', 'Analyze market trends');
  await page.fill('[name="backstory"]', 'Expert analyst...');

  // 3. Enable advanced features
  await page.check('[name="memory_enabled"]');
  await page.check('[name="reasoning_enabled"]');

  // 4. Click "Generate Code" button
  await page.click('button:text("Generate Code")');

  // 5. Wait for code preview
  await expect(page.locator('.code-preview')).toContainText('class SeniorMarketAnalyst:');

  // 6. Security scan should pass
  await expect(page.locator('.security-scan-status')).toHaveText('✅ Passed');

  // 7. Submit for review
  await page.click('button:text("Submit for Review")');

  // 8. PR created
  await expect(page.locator('.pr-link')).toBeVisible();
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Template Caching**:
   - Cache compiled Jinja2 templates in memory
   - Invalidate only on template version change
   - ~50ms → ~5ms per render

2. **Database Query Optimization**:
   - Single query with JOINs (agent + memory_config)
   - Avoid N+1 queries for knowledge sources
   - Use database connection pooling

3. **AST Parsing**:
   - Cache AST for identical code
   - Parallel validation (AST + imports + patterns)
   - ~200ms → ~50ms for typical agent

4. **Git Operations**:
   - Batch commits for multiple agents
   - Async PR creation (don't block user)
   - Use shallow clones for faster fetch

### Scalability

**Current design supports**:
- 100+ agents in database
- 10-20 code generations per day
- 5-10 concurrent review workflows
- Git repository up to 10,000 files

**Future scaling** (if needed):
- Queue-based code generation (Celery/RabbitMQ)
- Distributed template rendering
- Separate Git repos per department
- Microservice architecture

---

## Deployment Strategy

### Phase 1: Template Development (Week 1)

1. Create base Jinja2 template (`agent_class_template.py.jinja2`)
2. Test template rendering with sample data
3. Validate generated code compiles
4. Add custom Jinja2 filters

### Phase 2: Security Pipeline (Week 1)

1. Implement AST validator
2. Implement import blacklist checker
3. Implement pattern detector
4. Create comprehensive test suite
5. Document security model

### Phase 3: Code Generation Engine (Week 2)

1. Implement `AgentCodeGenerator` class
2. Integrate with database
3. Add template variable builder
4. Implement Black formatting
5. Unit tests for all edge cases

### Phase 4: Review Workflow (Week 2)

1. Implement `CodeReviewWorkflow` class
2. Integrate with Git
3. Create GitHub PR automation
4. Implement approval/rejection logic
5. Add rollback support

### Phase 5: API Endpoints (Week 2)

1. Create `/api/agents/{id}/generate-code` endpoint
2. Create `/api/code-deployments/{id}/review` endpoint
3. Create `/api/code-deployments/{id}/rollback` endpoint
4. Add authentication & authorization
5. Write API integration tests

### Phase 6: UI Integration (Week 3)

1. Add "Generate Code" button to Agent Wizard
2. Create code preview modal
3. Display security scan results
4. Show PR link after submission
5. Add deployment status indicators

---

## Success Criteria

### Functional Requirements

- ✅ Generate syntactically valid Python code from database config
- ✅ Support all 67 CrewAI 1.3.0 parameters
- ✅ Pass AST validation 100% for valid templates
- ✅ Block all blacklisted imports (0 false negatives)
- ✅ Create GitHub PR for review
- ✅ Track deployment history in database
- ✅ Support rollback to previous version

### Non-Functional Requirements

- ✅ Code generation: <500ms per agent
- ✅ Security scan: <1s per agent
- ✅ Template rendering: <100ms
- ✅ Zero false positives on security scan (for clean code)
- ✅ 100% code coverage for security validator
- ✅ Git operations: <3s (branch + commit + push)

### Security Requirements

- ✅ No blacklisted imports in generated code
- ✅ No eval/exec in generated code
- ✅ No subprocess calls in generated code
- ✅ All user input sanitized before database insert
- ✅ Manual approval required before deployment
- ✅ Full audit trail (Git commits + database records)

---

## Known Limitations & Future Work

### V1 Limitations

1. **Single Template**: Only one template version supported initially
2. **No Template Customization**: Users cannot modify templates
3. **Manual PR Merge**: Requires human to merge PR (no auto-merge)
4. **No Multi-Agent Generation**: Generate one agent at a time
5. **No Diff View**: Cannot compare versions easily

### Future Enhancements (V2+)

1. **Template Marketplace**: User-contributed templates
2. **Visual Template Editor**: Drag-and-drop template builder
3. **Batch Generation**: Generate code for multiple agents
4. **Auto-Merge**: Auto-merge PR if security scan passes + CI green
5. **Version Diff View**: Compare code versions side-by-side
6. **Custom Validators**: User-defined security rules
7. **Integration Tests**: Generate integration tests alongside agent code
8. **Documentation Generation**: Auto-generate agent documentation

---

## Reference Documentation

**Related Documents**:
- Database Schema Design: `database_schema_design.md`
- CrewAI Upgrade Guide: `crewai_1_3_0_upgrade_guide.md`
- PRD Expansion Summary: `prd_expansion_summary.md`

**External Resources**:
- Jinja2 Documentation: https://jinja.palletsprojects.com/
- Python AST Module: https://docs.python.org/3/library/ast.html
- CrewAI Documentation: https://docs.crewai.com/
- PyGithub API: https://pygithub.readthedocs.io/

---

## Conclusion

**Code generation architecture is COMPLETE** with:
- ✅ Multi-layer security model (7 layers)
- ✅ Jinja2 template system design
- ✅ AST validation + import blacklist
- ✅ Manual review workflow
- ✅ Git integration (branch, commit, PR, merge)
- ✅ Database tracking (audit trail)
- ✅ Component sizing (300-600 LOC per component)
- ✅ API endpoint specifications
- ✅ Testing strategy (unit, integration, E2E)

**Ready for EXEC phase implementation** (Phase 4, 2 weeks estimated).

---

**Document Generated**: 2025-11-06
**Architecture Design**: ✅ COMPLETE
**LEO Protocol Phase**: PLAN (Architecture Design)
**Next Deliverable**: Agent migration strategy + UI wireframes

<!-- Code Generation Architecture | SD-CREWAI-ARCHITECTURE-001 | 2025-11-06 -->
