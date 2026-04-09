# Technical Documentation — Multi-Agent Platform

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Core Architecture](#2-core-architecture)
3. [Tool System](#3-tool-system)
4. [Team Orchestration System](#4-team-orchestration-system)
5. [Agent Execution Model](#5-agent-execution-model)
6. [LLM Provider Abstraction](#6-llm-provider-abstraction)
7. [Pipeline Engine](#7-pipeline-engine)
8. [Cost Tracking](#8-cost-tracking)
9. [Contracts & Validation](#9-contracts--validation)
10. [WebSocket Streaming](#10-websocket-streaming)
11. [Backend API](#11-backend-api)
12. [Testing Strategy](#12-testing-strategy)
13. [Configuration Reference](#13-configuration-reference)

---

## 1. System Overview

The Multi-Agent Platform is a **Python-based autonomous software engineering system** that orchestrates teams of AI agents to collaboratively solve complex tasks. It is designed around three core principles:

1. **Structured Contracts** — All inter-agent communication uses Pydantic-validated schemas, eliminating unstructured message passing.
2. **Tool-Augmented Agents** — Agents can interact with the real world via tools (execute code, read/write files, search the web).
3. **Coordinator Pattern** — A coordinator agent automatically decomposes high-level goals into dependency-aware task graphs, assigns tasks to specialist agents, and synthesises results.

### Design Inspirations
- **claude-source**: Tool definitions (BashTool, FileReadTool, etc.), coordinator mode, agent conversation loops
- **open-multi-agent**: Team class, SharedMemory, MessageBus, AgentPool with semaphore, TaskQueue, auto-coordinator pattern

---

## 2. Core Architecture

### Module Dependency Graph

```
agents/
├── base/         → engine/contracts/ (Message schemas)
├── tools/        → standalone (no engine dependency)
├── teams/        → agents/tools/, agents/base/
├── coordinator/  → standalone (prompt builders + parsers)
└── [role agents] → agents/base/, engine/contracts/

engine/
├── orchestrator/
│   ├── pipeline.py       → agents/base/, engine/contracts/, engine/orchestrator/dag
│   ├── team_orchestrator  → agents/teams/, agents/coordinator/, engine/task_queue
│   ├── task_queue.py      → standalone
│   ├── dag.py             → standalone
│   ├── critic.py          → engine/contracts/
│   └── state.py           → standalone
├── contracts/             → pydantic (standalone)
└── tracker/               → standalone

backend/                   → engine/, agents/ (API layer)
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Pydantic for all contracts** | Type-safe validation at boundaries; JSON serialisable |
| **Abstract LLMProvider** | Swap providers without touching agent logic |
| **Tool system uses Pydantic schemas** | Tools self-document their inputs for LLM function-calling |
| **SharedMemory is namespaced** | No key collisions between agents; attributable entries |
| **TaskQueue is separate from DAG** | DAG = static pipeline; TaskQueue = dynamic team tasks |
| **Coordinator is ephemeral** | Created per-run, not persisted; stateless decomposition |

---

## 3. Tool System

### Architecture

```
ToolDefinition
├── name: str
├── description: str
├── input_schema: Type[BaseModel]   ← Pydantic model for validation
└── execute: async (dict, ToolContext) → ToolResult

ToolRegistry
├── register(tool)     ← Throws on duplicates
├── get(name) → tool
├── to_llm_tools()     ← JSON Schema for LLM API
└── to_anthropic_tools() ← Anthropic-specific format

ToolExecutor
├── execute(name, input, context)
│   1. Lookup tool in registry
│   2. Validate input against Pydantic schema
│   3. Execute with asyncio.wait_for(timeout)
│   4. Capture timing + log entry
└── execution_log → List[dict]
```

### Tool-Use Conversation Loop

When an agent has tools registered, the LLM call follows this loop:

```
1. Build prompt → call LLM (with tools in request)
2. If LLM returns tool_use blocks:
   a. Parse tool name + arguments
   b. Execute via ToolExecutor
   c. Append tool result to conversation
   d. Call LLM again with updated conversation
3. Repeat until LLM returns a text response (no more tool calls)
4. Return final text as agent output
```

Max turns default: 15 (prevents infinite tool loops).

### Adding Custom Tools

```python
from pydantic import BaseModel, Field
from agents.tools.registry import define_tool, ToolResult, ToolContext

class DBQueryInput(BaseModel):
    sql: str = Field(description="SQL query to execute")
    database: str = Field(default="main", description="Database name")

async def db_query_execute(input_data: dict, context: ToolContext) -> ToolResult:
    # Your implementation
    results = await run_query(input_data["sql"], input_data["database"])
    return ToolResult(data=str(results))

db_tool = define_tool(
    name="db_query",
    description="Execute a SQL query against the database",
    input_schema=DBQueryInput,
    execute=db_query_execute,
)
```

---

## 4. Team Orchestration System

### Component Overview

```
TeamOrchestrator
├── create_team(config) → Team
├── run_team(team, goal) → Result     ← Coordinator pattern
├── run_tasks(team, tasks) → Result   ← Explicit task list
└── run_single_agent(config, prompt)  ← One-shot convenience

Team
├── config: TeamConfig
├── shared_memory: SharedMemory       ← Namespaced KV store
├── message_bus: MessageBus           ← Inter-agent messaging
└── get_agent_configs() → List[AgentConfig]

AgentPool
├── add(name, agent)
├── run(name, prompt) → Result        ← Semaphore-controlled
└── active_count → int

TaskQueue
├── add(task)
├── get_pending() → List[Task]        ← Only deps-satisfied tasks
├── complete(id, result)              ← Unblocks dependents
├── fail(id, error)                   ← Cascades to dependents
└── is_complete() → bool
```

### Coordinator Flow (Detailed)

**Step 1: Decomposition**
```
Input: "Build a REST API for a blog"
Coordinator receives: goal + team roster (names, models, capabilities)
Coordinator outputs: JSON array of task specs

[
  {"title": "Design API Schema", "assignee": "architect", "dependsOn": []},
  {"title": "Implement Endpoints", "assignee": "developer", "dependsOn": ["Design API Schema"]},
  {"title": "Write Tests", "assignee": "tester", "dependsOn": ["Design API Schema"]},
  {"title": "Code Review", "assignee": "reviewer", "dependsOn": ["Implement Endpoints", "Write Tests"]}
]
```

**Step 2: Queue Loading**
- Task specs converted to Task objects with generated IDs
- Title-based `dependsOn` references resolved to real task IDs
- Tasks with unresolved deps start as `BLOCKED`

**Step 3: Execution Loop**
```
while queue has pending tasks:
    pending = queue.get_pending()          # Deps-satisfied tasks
    for each pending task:
        prompt = build_task_prompt(task)    # Inject shared memory + messages
        result = pool.run(agent, prompt)   # Semaphore-controlled
        if success:
            memory.write(agent, result)    # Persist to shared memory
            queue.complete(task)            # Unblocks dependents
        else:
            queue.fail(task)               # Cascades to dependents
```

**Step 4: Synthesis**
```
Coordinator receives: all task results + shared memory summary
Coordinator outputs: comprehensive final answer
```

### Shared Memory

Shared memory uses agent-namespaced keys to prevent collisions:

```
researcher/findings  → "TypeScript 5.5 adds const type params"
developer/plan       → "Use const type params for the API"
tester/coverage      → "85% branch coverage achieved"
```

The `get_summary()` method produces a markdown block injected into agent prompts:

```markdown
## Shared Team Memory

### researcher
- findings: TypeScript 5.5 adds const type params

### developer
- plan: Use const type params for the API
```

---

## 5. Agent Execution Model

### BaseAgent Lifecycle

```
execute(request: AgentRequest)
│
├── build_prompt(request) → List[Message]     ← Abstract (subclass implements)
├── Call LLM with tools + response_format
├── If tool calls: _tool_loop()               ← Iterative tool execution
├── parse_response(raw) → dict                ← Abstract (subclass implements)
├── _compute_confidence(artifacts, schema)     ← Heuristic scoring
└── Return AgentResponse
```

### Standalone Agent Mode

For team orchestration, agents use a simplified `run()` interface:

```python
result = await agent.run(
    prompt="Design the database schema",
    system_prompt="You are a database architect..."
)
# result = {"success": True, "output": "...", "tool_calls": [...]}
```

---

## 6. LLM Provider Abstraction

### Provider Interface

```python
class LLMProvider(ABC):
    async def generate(
        messages: List[Message],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[dict]] = None,   # Function calling
        response_format: Optional[dict] = None, # JSON mode
    ) → LLMResponse
```

### Tool Format Translation

Tools are defined in OpenAI format internally, then translated per-provider:

| Provider | Tool Format | Response Format |
|----------|-------------|-----------------|
| **OpenAI** | `tools: [{type: "function", function: {name, description, parameters}}]` | `tool_calls: [{id, function: {name, arguments}}]` |
| **Anthropic** | `tools: [{name, description, input_schema}]` | Content blocks with `type: "tool_use"` |
| **Google** | Not yet supported for tools | N/A |
| **Ollama** | Same as OpenAI (via compatibility) | Same as OpenAI |

---

## 7. Pipeline Engine

### DAG-Based Pipeline

The original pipeline uses a static DAG:

```
requirements → architecture → tasks → implementation → review
                                                     → deployment
```

Each node maps to a specific agent role. The DAG scheduler uses **Kahn's algorithm** for topological sorting and supports:
- Parallel execution of independent stages (review + deployment)
- Status tracking per node (pending → running → completed/failed)
- Serialisation/deserialisation for persistence

### Critic Loop

The critic loop wraps agent execution with quality validation:

```
for iteration in range(max_iterations):
    response = agent.execute(request)
    feedback = reviewer.review(response.artifacts)
    if feedback.approved:
        return response
    request = inject_feedback(request, feedback)
# Return best effort after max iterations
```

---

## 8. Cost Tracking

### Pricing Model

```python
CostTracker.record(
    agent="engineer",
    stage="implementation",
    model="gpt-4o",
    provider="openai",
    prompt_tokens=1500,
    completion_tokens=3000,
    tool_calls=5,
)
```

### Aggregation Methods

```python
tracker.total_cost_usd       # Total spend
tracker.total_tokens          # Total token count
tracker.by_agent()            # Per-agent breakdown
tracker.by_stage()            # Per-stage breakdown
tracker.get_summary()         # Full summary dict for API
```

---

## 9. Contracts & Validation

All inter-agent messages conform to Pydantic schemas:

| Schema | Purpose |
|--------|---------|
| `AgentRequest` | Input to an agent (task, context, feedback) |
| `AgentResponse` | Output from an agent (artifacts, confidence, timing) |
| `CriticFeedback` | Reviewer's verdict (approved, issues, suggestions) |
| `PipelineEvent` | Real-time event for WebSocket streaming |

### Agent Roles
```
REQUIREMENTS_ANALYST | ARCHITECT | TASK_PLANNER | ENGINEER |
REVIEWER | DEVOPS | ORCHESTRATOR | COORDINATOR
```

### Event Types
```
PIPELINE_STARTED | STAGE_STARTED | STAGE_COMPLETED | STAGE_FAILED |
CRITIC_ITERATION | ARTIFACT_PRODUCED | PIPELINE_COMPLETED | PIPELINE_FAILED |
TEAM_CREATED | TASK_DECOMPOSED | TASK_STARTED | TASK_COMPLETED | TASK_FAILED |
AGENT_STARTED | AGENT_COMPLETED | TOOL_CALL | TOOL_RESULT
```

---

## 10. WebSocket Streaming

### Connection

```
ws://localhost:8000/ws/{session_id}
```

### Event Format

```json
{
    "type": "task_start",
    "task": "abc12345",
    "agent": "developer",
    "data": {"title": "Implement API", "description": "..."}
}
```

### Client Usage

#### 1. Web Dashboard (Next.js)

```javascript
// Uses Supabase JS SDK for realtime broadcasts
const supabase = createClient(URL, KEY)
supabase.channel(`pipeline_${id}`).on('broadcast', { event: 'stage_update' }, (pay) => {})
```

#### 2. Terminal TUI (Node.js + Ink)

```typescript
// Interactive CLI in /cli uses the identical realtime payload format
const channel = supabase.channel(`pipeline_${id}`)
channel.on('broadcast', { event: 'log' }, (payload) => {
    setLogs(prev => [...prev, payload.payload])
})
```


---

## 11. Backend API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | User registration |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `POST` | `/api/pipelines` | Start pipeline |
| `GET` | `/api/pipelines/{id}` | Pipeline status |
| `GET` | `/api/artifacts/{pipeline_id}` | Get artifacts |
| `WS` | `/ws/{session_id}` | Real-time events |

---

## 12. Testing Strategy

### Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `test_engine.py` | 26 | DAG, State, Contracts, Critic Loop |
| `test_tools.py` | 21 | Registry, Executor, All Built-in Tools |
| `test_teams.py` | 14 | SharedMemory, MessageBus, Team, TaskQueue, CostTracker, Parser |
| **Total** | **61+** | |

### Running Tests

```bash
# All tests
python -m pytest tests/ -v

# With coverage
python -m pytest tests/ -v --cov=agents --cov=engine --cov-report=term-missing
```

---

## 13. Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_LLM_PROVIDER` | `openai` | Default LLM provider |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GOOGLE_API_KEY` | — | Google AI API key |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `MAX_CRITIC_ITERATIONS` | `3` | Max critic refinement loops |
| `PIPELINE_TIMEOUT_SECONDS` | `600` | Pipeline timeout |
| `WORKSPACE_DIR` | (temp) | Tool workspace directory |
| `MAX_CONCURRENCY` | `5` | Max parallel agent executions |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | — | Supabase anonymous key |
| `SUPABASE_SERVICE_KEY` | — | Supabase service role key |
| `DEBUG` | `false` | Enable debug mode |
| `LOG_LEVEL` | `INFO` | Logging level |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
