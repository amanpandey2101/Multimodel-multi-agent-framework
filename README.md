# 🤖 Multi-Agent Autonomous Software Engineering Platform

A **production-grade, multi-agent AI framework** for autonomous software engineering. Agents collaborate in teams, use tools (shell, file I/O, search), and coordinate via shared memory — powered by multiple LLM providers.

> Built with Python • FastAPI • Next.js • Supabase • Pydantic

---

## ✨ Key Features

### 🧠 Multi-Agent Team System
- **Dynamic Agent Teams** — create teams of specialized agents (architect, developer, reviewer, tester)
- **Coordinator Pattern** — a coordinator agent automatically decomposes goals into task graphs with dependencies
- **Shared Memory** — agents share context via a namespaced key-value store injected into prompts
- **Inter-Agent Messaging** — direct and broadcast messaging between team members
- **Parallel Execution** — independent tasks run concurrently with configurable concurrency limits

### 🛠️ Tool System
| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands with timeout and workspace isolation |
| `file_read` | Read file contents with offset/limit for large files |
| `file_write` | Write/create files, auto-create directories |
| `file_edit` | Precise string replacement in files |
| `grep` | Regex search across files and directories |
| `web_fetch` | Fetch URL content with HTML-to-text conversion |

- **Custom Tool Registration** — define your own tools with Pydantic schemas
- **Tool-Use Conversation Loop** — agents iteratively plan → use tools → observe → respond

### ⚡ Execution Engine
- **DAG-Based Pipelines** — topological execution with dependency management
- **Task Queue** — dependency-aware scheduling with auto-unblocking
- **Critic Loop** — iterative quality refinement with reviewer feedback
- **Cost Tracking** — per-agent, per-stage token usage and cost metrics

### 🔌 Multi-Provider LLM Support
| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-Turbo, O1 |
| **Anthropic** | Claude Sonnet 4, Claude Opus 4, Claude Haiku 3.5 |
| **Google** | Gemini 1.5 Pro, Gemini 2.0 Flash |
| **Ollama** | Llama 3, Mixtral, CodeLlama (local, free) |

### Production Infrastructure
- **FastAPI Backend** with Supabase auth & PostgreSQL
- **WebSocket Streaming** for real-time pipeline events
- **Next.js Frontend** with dashboard UI
- **Docker** containerization
- **Row-Level Security** for multi-tenant SaaS

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** (for frontend)
- At least one LLM API key (OpenAI, Anthropic, or Google) — or Ollama for local models

### 1. Clone & Install

```bash
git clone <repository-url>
cd Major

# Create virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy the example config
cp .env.example .env

# Edit .env with your API keys
```

Required `.env` variables:
```env
# Pick one (or more) LLM provider
OPENAI_API_KEY=sk-your-key
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key

# Or use Ollama (no key needed)
OLLAMA_BASE_URL=http://localhost:11434

# Set your default provider
DEFAULT_LLM_PROVIDER=openai
```

### 3. Run Team Orchestration (Recommended)

```bash
# Default team (architect + developer)
python run_team.py "Build a REST API for a todo app with CRUD operations"

# Full team (architect + developer + reviewer + tester)
python run_team.py "Build a Python CLI calculator" --team full

# Custom agents
python run_team.py "Write a web scraper for news sites" --agents "researcher,developer,reviewer"

# Use Ollama (free, local)
python run_team.py "Create a sorting algorithm visualizer" --provider ollama --model llama3

# Specify workspace directory
python run_team.py "Refactor this codebase" --workspace ./my-project
```

### 4. Run Pipeline (Structured Engineering Flow)

```bash
python run_pipeline.py "Build a real-time chat application" --provider openai
```

### 5. Start the Backend API

```bash
uvicorn backend.app.main:app --reload --port 8000
```

### 6. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 7. Start the Terminal TUI (Interactive CLI)

```bash
cd cli
npm install
npm run dev
```


---

## 📖 Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  Dashboard │ Pipeline View │ Team Management │ Cost Dashboard     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                      Backend (FastAPI)                            │
│  Auth │ Projects │ Pipelines │ Artifacts │ WebSocket Streaming   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Engine Layer                                 │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ PipelineOrch.   │  │ TeamOrchestrator │  │ CriticLoop    │  │
│  │ (DAG-based)     │  │ (Coordinator)    │  │ Controller    │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────────────┘  │
│           │                    │                                 │
│  ┌────────▼────────────────────▼─────────┐                      │
│  │          Task Queue + Scheduler       │                      │
│  └────────────────────┬──────────────────┘                      │
│                       │                                          │
│  ┌────────────────────▼──────────────────┐                      │
│  │            Agent Pool                  │                      │
│  │  (Concurrency-controlled execution)   │                      │
│  └────────────────────┬──────────────────┘                      │
│                       │                                          │
│  ┌────────────────────▼──────────────────┐                      │
│  │     Agents + Tools + Shared Memory    │                      │
│  │                                        │                      │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ │                      │
│  │  │BaseAgent│ │ToolSystem│ │SharedMem│ │                      │
│  │  └────┬────┘ └────┬─────┘ └────────┘ │                      │
│  │       │           │                    │                      │
│  │  ┌────▼───────────▼──────┐            │                      │
│  │  │    LLM Providers      │            │                      │
│  │  │ OpenAI│Anthropic│     │            │                      │
│  │  │ Google│Ollama   │     │            │                      │
│  │  └───────────────────────┘            │                      │
│  └────────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
```

### How Team Orchestration Works

```
User Goal: "Build a REST API for a blog"
        │
        ▼
┌─────────────────────────┐
│   Coordinator Agent     │  ← Receives goal + team roster
│   (Auto-decomposition)  │
└──────────┬──────────────┘
           │ Produces JSON task graph
           ▼
┌─────────────────────────────────────────┐
│         Task Queue (with deps)          │
│                                          │
│  [Design API] ──depends──▶ [Implement]  │
│       │                        │         │
│       └──depends──▶ [Write Tests]        │
│                        │                 │
│             [Review All] ◀──depends───┘  │
└──────────────────┬──────────────────────┘
                   │
                   ▼ Parallel execution
┌─────────────────────────────────────────┐
│              Agent Pool                  │
│                                          │
│  🏗️ architect ──▶ [Design API]          │
│  👨‍💻 developer ──▶ [Implement]           │  ← Runs after Design
│  🧪 tester    ──▶ [Write Tests]          │  ← Runs after Design
│  🔍 reviewer  ──▶ [Review All]           │  ← Runs after all above
│                                          │
│  Each agent has: Tools + SharedMemory    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────┐
│   Coordinator Agent     │  ← Receives all task results
│   (Synthesis)           │
└──────────┬──────────────┘
           │
           ▼
    Final Comprehensive Output
```

---

## 📁 Project Structure

```
Major/
├── agents/
│   ├── base/
│   │   ├── agent.py              # BaseAgent with tool-use loop
│   │   └── llm_provider.py       # Multi-provider LLM abstraction
│   ├── coordinator/
│   │   └── __init__.py           # Goal decomposition + synthesis
│   ├── teams/
│   │   ├── team.py               # Team (roster + memory + messaging)
│   │   ├── memory.py             # SharedMemory (namespaced KV store)
│   │   ├── messaging.py          # MessageBus (inter-agent comms)
│   │   └── pool.py               # AgentPool (concurrency control)
│   ├── tools/
│   │   ├── registry.py           # ToolDefinition + ToolRegistry
│   │   ├── executor.py           # ToolExecutor (validate + run)
│   │   └── builtin/
│   │       ├── bash_tool.py      # Shell command execution
│   │       ├── file_read_tool.py # File reading with offset/limit
│   │       ├── file_write_tool.py# File creation/writing
│   │       ├── file_edit_tool.py # Exact string replacement
│   │       ├── grep_tool.py      # Regex search in files
│   │       └── web_fetch_tool.py # URL content fetching
│   ├── requirements_analyst/     # Requirements gathering agent
│   ├── architect/                # System architecture agent
│   ├── task_planner/             # Task breakdown agent
│   ├── engineer/                 # Code implementation agent
│   ├── reviewer/                 # Code review/critic agent
│   └── devops/                   # DevOps/deployment agent
├── engine/
│   ├── orchestrator/
│   │   ├── pipeline.py           # DAG-based pipeline orchestrator
│   │   ├── team_orchestrator.py  # Full team orchestration engine
│   │   ├── task_queue.py         # Dependency-aware task queue
│   │   ├── dag.py                # DAG scheduler (topological sort)
│   │   ├── critic.py             # Critic loop controller
│   │   └── state.py              # Pipeline state manager
│   ├── contracts/
│   │   ├── messages.py           # Pydantic message schemas
│   │   └── artifacts.py          # Structured artifact schemas
│   └── tracker/
│       └── cost_tracker.py       # Token usage + cost tracking
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI application
│   │   ├── config.py             # Backend settings
│   │   ├── auth/                 # Supabase auth
│   │   ├── projects/             # Project management
│   │   ├── pipelines/            # Pipeline execution API
│   │   ├── artifacts/            # Artifact storage API
│   │   ├── github/               # GitHub integration
│   │   └── websocket/            # Real-time event streaming
│   └── schema.sql                # Supabase database schema
├── frontend/                     # Next.js dashboard
├── tests/
│   ├── test_engine.py            # Engine unit tests (26 tests)
│   ├── test_tools.py             # Tool system tests (21 tests)
│   ├── test_teams.py             # Team system tests (14 tests)
│   └── test_providers.py         # LLM provider tests
├── run_pipeline.py               # Pipeline CLI
├── run_team.py                   # Team orchestration CLI
├── config.py                     # Application configuration
├── requirements.txt              # Python dependencies
├── Dockerfile                    # Container build
├── docker-compose.yml            # Multi-service deployment
└── .env.example                  # Environment template
```

---

## 🧪 Running Tests

```bash
# Run all tests
python -m pytest tests/ -v

# Run specific test suites
python -m pytest tests/test_engine.py -v     # Engine tests (DAG, state, critic)
python -m pytest tests/test_tools.py -v      # Tool system tests
python -m pytest tests/test_teams.py -v      # Team + task queue + cost tracker tests

# Run with coverage
python -m pytest tests/ -v --cov=agents --cov=engine
```

---

## 🔧 Custom Tool Development

Create your own tools that agents can use:

```python
from pydantic import BaseModel, Field
from agents.tools.registry import ToolDefinition, ToolResult, ToolContext, define_tool

class MyToolInput(BaseModel):
    query: str = Field(description="The search query")
    max_results: int = Field(default=5, description="Maximum results")

async def my_tool_execute(input_data: dict, context: ToolContext) -> ToolResult:
    # Your tool logic here
    results = do_search(input_data["query"], input_data["max_results"])
    return ToolResult(data=results)

my_tool = define_tool(
    name="my_search",
    description="Search internal knowledge base",
    input_schema=MyToolInput,
    execute=my_tool_execute,
)

# Register with a registry
from agents.tools.registry import ToolRegistry
registry = ToolRegistry()
registry.register(my_tool)
```

---

## 🐳 Docker Deployment

```bash
# Build and run (backend only)
docker compose up -d backend

# With local Ollama for free LLM
docker compose --profile local-llm up -d
```

---

## 🧮 Cost Estimation

The platform tracks token usage and cost for every agent call:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|-----:|------:|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Gemini 1.5 Pro | $1.25 | $5.00 |
| Llama 3 (Ollama) | **$0.00** | **$0.00** |

---

## 📋 CLI Reference

### `run_team.py` — Team Orchestration

```
python run_team.py <GOAL> [OPTIONS]

Arguments:
  GOAL                      High-level goal for the team

Options:
  --provider {openai,anthropic,google,ollama}   LLM provider (default: openai)
  --model MODEL             Model name (default: gpt-4o)
  --team {full,dev,review,research}   Pre-built team template
  --agents "name1,name2"    Comma-separated custom agents
  --concurrency N           Max parallel agents (default: 3)
  --workspace PATH          Working directory for tool operations
  -v, --verbose             Enable debug logging
```

**Team Templates:**
| Template | Agents |
|----------|--------|
| `dev` | architect, developer |
| `full` | architect, developer, reviewer, tester |
| `review` | developer, reviewer |
| `research` | researcher, developer |

### `run_pipeline.py` — Structured Pipeline

```
python run_pipeline.py <REQUIREMENT> [OPTIONS]

Arguments:
  REQUIREMENT               Software requirement description

Options:
  --provider {openai,anthropic,google,ollama}
  --model MODEL
  --project-name NAME
  --output-dir PATH
  -v, --verbose
```

### `cli/` — Interactive TUI (Node.js)

The platform provides a `Claude Code`-like interactive terminal user interface built with React and Ink. It uses real-time WebSockets to stream events directly from the Supabase database.

```bash
cd cli
npm install
npm run dev
```

---

## 📐 Inspired By

This framework synthesizes ideas from:

- **[Claude Code](https://github.com/anthropics/claude-code)** — Tool system (bash, file I/O, grep), coordinator mode, agent conversation loops
- **[Open Multi-Agent](https://github.com/open-multi-agent)** — Team orchestration, shared memory, message bus, agent pool, task queue patterns
- **[MetaGPT](https://github.com/geekan/MetaGPT)** — Multi-agent software engineering pipelines

---

## 📄 License

MIT License — see LICENSE file for details.
