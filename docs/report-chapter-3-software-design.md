# Chapter 3: Software Design

## 3.1 Data Flow Diagram (DFD) - Level 0

The following diagram illustrates the high-level data flow between the user and the platform components.

```mermaid
graph LR
    User((User)) -- Submit Goal/Query --> CLI[Terminal CLI]
    CLI -- API Request / WebSocket --> Backend[FastAPI Backend]
    Backend -- Fetch Context --> DB[(Supabase DB)]
    Backend -- Execute --> Engine[Orchestration Engine]
    Engine -- Prompt --> LLM[LLM Provider]
    LLM -- Response/Tool Call --> Engine
    Engine -- Tool Execution --> Tools[Filesystem/Shell]
    Tools -- Results --> Engine
    Engine -- Progress Events --> CLI
```

## 3.2 UML Diagrams

### Class Diagram (Core Engine)

The relationship between the Orchestrator, Agents, and Tools.

```mermaid
classDiagram
    class TeamOrchestrator {
        +TaskQueue queue
        +AgentPool pool
        +run(goal)
    }
    class BaseAgent {
        +LLMProvider provider
        +ToolRegistry registry
        +execute_loop(prompt)
    }
    class ToolRegistry {
        +Map tools
        +register(tool)
    }
    class SharedMemory {
        +Map store
        +get(key)
        +set(key, value)
    }

    TeamOrchestrator --> BaseAgent : manages
    TeamOrchestrator --> SharedMemory : uses
    BaseAgent --> ToolRegistry : has
    BaseAgent ..> SharedMemory : reads/writes
```

### Sequence Diagram (Task Execution)

```mermaid
sequenceDiagram
    participant C as Coordinator
    participant Q as TaskQueue
    participant A as Worker Agent
    participant T as Tools

    C->>Q: Add tasks with dependencies
    loop While tasks pending
        Q->>A: Assign ready task
        A->>T: Invoke Tool (e.g. write_file)
        T-->>A: Tool Output
        A-->>Q: Task Completed (Artifacts)
    end
    Q-->>C: Goal Accomplished
```

## 3.3 Database Design

The database uses PostgreSQL (managed by Supabase) with the following core entities:

### E-R Diagram Summary
- **Projects**: The top-level container for all engineering work.
- **Pipelines**: A single execution run for a project requirement.
- **Stages**: Individual steps in a pipeline (e.g., Design, Code, Review).
- **Artifacts**: Structured data produced by stages (files, logs, metadata).

### Table Definitions

| Table | Fields | Data Type | Key |
| :--- | :--- | :--- | :--- |
| **projects** | id, name, description, owner_id | UUID, String, Text, UUID | PK (id) |
| **pipelines**| id, project_id, requirement, status | UUID, UUID, Text, Enum | PK (id), FK (project_id) |
| **stages** | id, pipeline_id, stage_name, status | UUID, UUID, String, Enum | PK (id), FK (pipeline_id) |
| **artifacts** | id, stage_id, type, data | UUID, UUID, String, JSONB | PK (id), FK (stage_id) |
