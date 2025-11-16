# Stage 4 CrewAI Migration Architecture
## From React/TypeScript to Production-Grade Python CrewAI System

### Executive Summary
This document outlines the architectural migration strategy for Stage 4 Competitive Intelligence from a tightly-coupled React/TypeScript implementation (885 LOC) to a scalable, production-grade CrewAI system with GPT-5.1 optimization.

### Current State Analysis
- **Location**: `/mnt/c/_EHG/ehg/src/components/stages/Stage4CompetitiveIntelligence.tsx`
- **Size**: 885 LOC with 49% misaligned content
- **Issues**: Direct OpenAI API calls bypassing CrewAI, content overlap with other stages
- **Mandate**: Chairman directive (2025-11-07) requires full CrewAI integration

### Target Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (EHG)                      │
│                  Simplified UI Component                      │
└────────────┬───────────────────────────────────┬─────────────┘
             │ REST API                         │ WebSocket
             │ + Polling                        │ (Real-time)
┌────────────▼───────────────────────────────────▼─────────────┐
│                    FastAPI Service Layer                      │
│  /api/v1/competitor-analysis/kickoff (POST)                   │
│  /api/v1/competitor-analysis/status/{job_id} (GET)            │
│  /api/v1/competitor-analysis/results/{job_id} (GET)           │
│  /api/v1/human-in-the-loop/review (POST)                      │
└────────────┬───────────────────────────────────┬─────────────┘
             │                                   │
┌────────────▼───────────────────────────────────▼─────────────┐
│                 CrewAI Hierarchical System                    │
│  ┌─────────────────────────────────────────────────────┐     │
│  │            CI_Manager (GPT-5.1 Thinking)            │     │
│  │         Orchestrates entire CI workflow             │     │
│  └──────────┬─────────────┬─────────────┬─────────────┘     │
│             │             │             │                    │
│  ┌──────────▼──────┐ ┌───▼──────┐ ┌────▼──────────┐        │
│  │  DataHarvester  │ │ Feature  │ │   Strategy    │        │
│  │ (GPT-5.1 Instant)│ │ Analyst  │ │   Analyst     │        │
│  │  Web Scraping   │ │(Thinking)│ │ (GPT-5.1      │        │
│  │  DB Queries     │ │ + Vision │ │  Thinking)    │        │
│  └─────────────────┘ └──────────┘ └───────────────┘        │
└───────────────────────────────────────────────────────────────┘
             │
┌────────────▼──────────────────────────────────────────────────┐
│                    Supabase Database                          │
│  venture_drafts.research_results (JSONB)                      │
│  competitors, features, sentiment_analysis tables             │
│  crewai_flows, crewai_flow_executions                        │
└───────────────────────────────────────────────────────────────┘
```

## Part 1: Backend Service Layer Design

### 1.1 FastAPI Service Structure

```python
# app/main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional
import uuid
from datetime import datetime

app = FastAPI(
    title="Stage 4 Competitive Intelligence API",
    version="1.0.0",
    description="CrewAI-powered competitive analysis service"
)

# CORS configuration for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ehg.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job storage (replace with Redis in production)
jobs_store: Dict[str, Dict[str, Any]] = {}
```

### 1.2 Asynchronous Endpoint Implementation

```python
# app/api/endpoints/competitor_analysis.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncio
from uuid import uuid4

router = APIRouter(prefix="/api/v1/competitor-analysis")

class CompetitorAnalysisRequest(BaseModel):
    competitors: List[str] = Field(
        ...,
        description="List of competitor domains to analyze",
        example=["competitor-a.com", "competitor-b.com"]
    )
    analysis_depth: str = Field(
        default="standard",
        description="Analysis depth: quick, standard, or comprehensive"
    )
    include_screenshots: bool = Field(
        default=True,
        description="Whether to analyze UI/UX via screenshots"
    )

class JobResponse(BaseModel):
    job_id: str
    status: str
    created_at: datetime
    estimated_completion_time: Optional[int] = Field(
        None,
        description="Estimated seconds to completion"
    )

@router.post("/kickoff", response_model=JobResponse)
async def kickoff_analysis(
    request: CompetitorAnalysisRequest,
    background_tasks: BackgroundTasks
):
    """Initiate competitive intelligence analysis"""
    job_id = str(uuid4())

    # Initialize job record
    jobs_store[job_id] = {
        "status": "initializing",
        "created_at": datetime.utcnow(),
        "request": request.dict(),
        "progress": [],
        "result": None,
        "error": None
    }

    # Launch crew in background
    background_tasks.add_task(
        run_ci_crew_async,
        job_id=job_id,
        competitors=request.competitors,
        analysis_depth=request.analysis_depth,
        include_screenshots=request.include_screenshots
    )

    # Estimate completion time based on number of competitors
    estimated_time = len(request.competitors) * 120  # 2 minutes per competitor

    return JobResponse(
        job_id=job_id,
        status="initializing",
        created_at=jobs_store[job_id]["created_at"],
        estimated_completion_time=estimated_time
    )

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get real-time status of analysis job"""
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs_store[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"][-10:],  # Last 10 progress updates
        "created_at": job["created_at"],
        "is_complete": job["status"] in ["completed", "failed"]
    }

@router.get("/results/{job_id}")
async def get_job_results(job_id: str):
    """Retrieve final analysis results"""
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs_store[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job is not complete. Current status: {job['status']}"
        )

    return job["result"]
```

### 1.3 WebSocket Implementation for Real-time Updates

```python
# app/api/websocket.py
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.job_subscriptions: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        # Remove from all job subscriptions
        for job_id in self.job_subscriptions:
            self.job_subscriptions[job_id].discard(websocket)

    async def subscribe_to_job(self, websocket: WebSocket, job_id: str):
        if job_id not in self.job_subscriptions:
            self.job_subscriptions[job_id] = set()
        self.job_subscriptions[job_id].add(websocket)

    async def broadcast_job_update(self, job_id: str, message: dict):
        if job_id in self.job_subscriptions:
            for websocket in self.job_subscriptions[job_id]:
                try:
                    await websocket.send_json(message)
                except:
                    # Connection might be closed
                    pass

manager = ConnectionManager()

@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await manager.connect(websocket)
    await manager.subscribe_to_job(websocket, job_id)

    try:
        while True:
            # Keep connection alive, wait for messages
            data = await websocket.receive_text()
            # Handle ping/pong or other control messages
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
```

## Part 2: Migration Strategy - TypeScript to Python

### 2.1 Agentic Refactoring Pattern

Instead of direct translation, we'll re-platform the business logic:

#### Current TypeScript Logic (Stage4CompetitiveIntelligence.tsx)
```typescript
// BEFORE: Monolithic React component
const analyzeCompetitor = async (url: string) => {
  const response = await fetch('/api/openai/analyze', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Analyze competitor: ${url}`,
      model: 'gpt-4'
    })
  });
  // Process response...
};
```

#### Refactored as CrewAI Agent
```python
# AFTER: Specialized agent with clear role
from crewai import Agent, Task
from typing import List

class CompetitiveIntelligenceAgents:
    def data_harvester_agent(self) -> Agent:
        return Agent(
            role="Senior Research Analyst",
            goal="Scrape websites, query databases, and search social media "
                 "to gather raw, unstructured data on specified competitors",
            backstory="You are a meticulous researcher with years of experience "
                     "in competitive intelligence. You excel at finding hidden "
                     "information and aggregating data from multiple sources. "
                     "You follow all legal and ethical guidelines, respecting "
                     "robots.txt and Terms of Service.",
            tools=[WebScrapeTool(), DatabaseQueryTool(), SocialSearchTool()],
            llm="gpt-5.1-instant",  # Fast model for extraction
            allow_delegation=False,
            verbose=True
        )
```

### 2.2 Schema Migration: Zod to Pydantic

#### TypeScript/Zod Schema (Current)
```typescript
// schemas/competitor.ts
import { z } from 'zod';

export const CompetitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().url(),
  marketSegment: z.string(),
  pricingNotes: z.string(),
  marketShareEstimatePct: z.number().min(0).max(100),
  automatedFeatures: z.array(z.string()),
  sentimentAnalysis: z.object({
    positive: z.number(),
    negative: z.number(),
    overallSentiment: z.enum(['positive', 'negative', 'neutral']),
    netSentimentScore: z.number(),
    reviewVelocity: z.number(),
    sentimentTrend: z.enum(['improving', 'stable', 'declining'])
  }),
  replicationBlueprint: z.object({
    coreFeatures: z.array(z.string()),
    techStack: z.array(z.string()),
    implementationComplexity: z.enum(['low', 'medium', 'high']),
    keyDifferentiators: z.array(z.string())
  })
});
```

#### Python/Pydantic Schema (Migrated)
```python
# app/schemas/competitor.py
from pydantic import BaseModel, Field, HttpUrl
from typing import List, Literal
from datetime import datetime

class SentimentAnalysis(BaseModel):
    positive: int = Field(..., ge=0, description="Number of positive reviews")
    negative: int = Field(..., ge=0, description="Number of negative reviews")
    overall_sentiment: Literal['positive', 'negative', 'neutral']
    net_sentiment_score: float = Field(..., ge=-1, le=1)
    review_velocity: float = Field(..., description="Reviews per month")
    sentiment_trend: Literal['improving', 'stable', 'declining']

class ReplicationBlueprint(BaseModel):
    core_features: List[str] = Field(..., description="Essential features to replicate")
    tech_stack: List[str] = Field(..., description="Identified technology stack")
    implementation_complexity: Literal['low', 'medium', 'high']
    key_differentiators: List[str] = Field(..., description="Unique value propositions")

class CompetitorProfile(BaseModel):
    """Complete competitor analysis profile"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., description="Company name")
    website: HttpUrl = Field(..., description="Primary domain")
    market_segment: str = Field(..., description="Target market segment")
    pricing_notes: str = Field(..., description="Pricing strategy observations")
    market_share_estimate_pct: float = Field(..., ge=0, le=100)
    automated_features: List[str] = Field(default_factory=list)
    sentiment_analysis: SentimentAnalysis
    replication_blueprint: ReplicationBlueprint

    class Config:
        json_schema_extra = {
            "example": {
                "name": "CompetitorX",
                "website": "https://competitorx.com",
                "market_segment": "B2C SaaS Productivity",
                "pricing_notes": "Freemium model, $9-29/mo tiers",
                "market_share_estimate_pct": 15.5,
                "automated_features": ["AI chatbot", "Auto-scheduling"],
                "sentiment_analysis": {
                    "positive": 850,
                    "negative": 150,
                    "overall_sentiment": "positive",
                    "net_sentiment_score": 0.7,
                    "review_velocity": 45.2,
                    "sentiment_trend": "improving"
                },
                "replication_blueprint": {
                    "core_features": ["Task automation", "Team collaboration"],
                    "tech_stack": ["React", "Node.js", "PostgreSQL"],
                    "implementation_complexity": "medium",
                    "key_differentiators": ["Superior UX", "API ecosystem"]
                }
            }
        }
```

### 2.3 Business Logic Extraction Map

| Current Location (TypeScript) | Migration Target (Python) | Implementation Pattern |
|-------------------------------|--------------------------|------------------------|
| `analyzeCompetitor()` function | `DataHarvester` agent | Agent with web scraping tools |
| `extractFeatures()` function | `FeatureAnalyst` agent | Agent with parsing tools |
| `compareCompetitors()` function | `StrategyAnalyst` agent | Pure reasoning agent |
| `generateReport()` function | `CI_Manager` synthesis | Manager agent orchestration |
| API calls to OpenAI | CrewAI LLM configuration | `llm` parameter on agents |
| State management (Redux/Context) | Job storage (Redis/DB) | FastAPI background tasks |
| Error handling try/catch | Task guardrails | CrewAI guardrail parameter |

## Part 3: Deployment Architecture

### 3.1 Containerization with Docker

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ./app ./app

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CREWAI_TELEMETRY=false

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 3.2 Requirements File

```txt
# requirements.txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
crewai==0.30.0
crewai-tools==0.2.0
pydantic==2.5.0
supabase==2.0.0
redis==5.0.1
websockets==12.0
python-multipart==0.0.6
httpx==0.25.2
instructor==0.4.0
langfuse==2.0.0
arize-phoenix==2.0.0
```

### 3.3 Environment Configuration

```python
# app/config.py
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # API Configuration
    api_v1_prefix: str = "/api/v1"
    project_name: str = "Stage 4 Competitive Intelligence"

    # CrewAI Configuration
    openai_api_key: str
    gpt5_instant_model: str = "gpt-5.1-instant"
    gpt5_thinking_model: str = "gpt-5.1-thinking"
    max_concurrent_crews: int = 10

    # Supabase Configuration
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # Redis Configuration (for production)
    redis_url: Optional[str] = None

    # Observability
    langfuse_secret_key: Optional[str] = None
    langfuse_public_key: Optional[str] = None
    arize_phoenix_api_key: Optional[str] = None

    # Security
    cors_origins: List[str] = ["http://localhost:3000"]
    api_key_header: str = "X-API-Key"

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

## Next Steps

1. Continue with hierarchical agent implementation (Part 4)
2. Create GPT-5.1 optimized prompt library (Part 5)
3. Implement parallel processing patterns (Part 6)
4. Set up observability and monitoring (Part 7)
5. Create ethical guardrails framework (Part 8)

This migration architecture provides a solid foundation for transforming Stage 4 from a monolithic React component to a scalable, production-grade CrewAI system.