# Chapter 2: Software Requirement Analysis

## 2.1 Requirement Analysis

The platform must satisfy the following core requirements:

### Functional Requirements
1.  **Goal Decomposition**: The system must take a high-level natural language prompt and break it down into a Directed Acyclic Graph (DAG) of executable tasks.
2.  **Multi-Agent Coordination**: Support for a "Coordinator" agent to manage a pool of specialized agents (Architect, Developer, Tester, etc.).
3.  **Tool Execution System**: Agents must be able to call tools for reading/writing files, running shell commands, and searching directories.
4.  **Shared Memory**: A namespaced key-value store for agents to persist and share context across tasks.
5.  **Real-time Monitoring**: Real-time streaming of agent thoughts and tool outputs to a terminal UI.
6.  **Web Dashboard**: A centralized web interface for project visualization and historical pipeline analysis.
7.  **Interactive Web IDE**: A high-fidelity development environment with real-time code sync, Monaco editor, and live preview.
8.  **Automated Execution**: One-click provisioning of development environments and servers for generated code.

### Non-Functional Requirements
1.  **Security**: Tool execution and application runtimes MUST be isolated via **Docker Containerization** to protect the host OS.
2.  **Scalability**: The engine must support parallel task execution with configurable concurrency limits.
3.  **Extensibility**: Developers should be able to register custom tools and agent roles easily.

## 2.2 Feasibility Analysis

1.  **Technical Feasibility**: Python (FastAPI/Pydantic) provides a strong foundation for LLM orchestration. Node.js (Ink/React) allows for a high-performance terminal UI.
2.  **Economic Feasibility**: The platform supports low-cost models (GPT-4o-mini, Gemini Flash) and local models (Ollama), making it accessible for development.
3.  **Operational Feasibility**: The CLI-first approach integrates seamlessly into existing developer workflows.

## 2.3 Modules Description

The system architecture is divided into the **Core Engine** and the **User Interfaces** built on top of it:

### Core Framework Modules
| Module | Description |
| :--- | :--- |
| **Orchestration Engine** | The core multi-agent framework managing Task Queues, DAG scheduling, and Critic loops. |
| **Agent Pool** | A registry of specialized agents (Architect, Dev, etc.) that power the core logic. |
| **Tool System** | A library of validated functions (Bash, File I/O) invoked by the core engine. |
| **Backend API** | A FastAPI server that exposes the core framework to external clients. |
| **Execution Runner** | A dedicated service for provisioning and managing Docker-based application runtimes. |

### Interface Modules (Built on Top)
| Module | Description |
| :--- | :--- |
| **Terminal CLI** | A React Ink-based interface providing real-time, local-first agent control. |
| **Web Dashboard** | A Next.js application for project management and pipeline visualization. |

## 2.4 Functionalities of Key Modules

- **Coordinator Agent**: Acts as the "manager". Analyzes the goal, identifies dependencies, and assigns tasks to workers.
- **Task Queue**: Dynamically unblocks tasks as their dependencies (parent nodes in the DAG) are satisfied.
- **Bash Tool**: Executes shell commands within an isolated Docker container with timeout protection and workspace sandboxing.
- **Web Dashboard**: Renders interactive DFDs and provides an artifact explorer for downloaded project outputs.

## 2.5 Use Case Scenario (Sample)

**Scenario**: "Create a Python web scraper for a news site."
1.  **User** submits goal via CLI.
2.  **Coordinator** decomposes goal into: [Analyze Site Structure] → [Write Scraper Code] → [Verify Output].
3.  **Architect** analyzes the site structure using the `web_fetch` tool.
4.  **Developer** writes the code using `file_write` based on the Architect's findings.
5.  **Tester** runs the code using the `bash` tool to ensure it works.
