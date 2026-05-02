# Chapter 5: Software Testing

## 5.1 Testing Strategy

The platform employs a multi-layered testing strategy to ensure the reliability of autonomous agent behaviors and tool safety.

- **Unit Testing (White Box)**: Focused on internal engine logic (DAG scheduling, cost calculation, and state transitions).
- **Integration Testing (Black Box)**: Verifies the full loop from user input to tool execution and output validation.
- **Safety Auditing**: Manual and automated checks on tool permissions and directory traversal guards.

## 5.2 Test Suites

### 5.2.1 Core Engine Tests (`pytest tests/test_engine.py`)
- **Test Case 1**: Verify that the Task Queue correctly blocks tasks with unsatisfied dependencies.
- **Test Case 2**: Ensure that the DAG scheduler correctly sorts tasks in topological order.
- **Test Case 3**: Validate that the Critic Loop forces a failure after the maximum number of rejections.

### 5.2.2 Tool System Tests (`pytest tests/test_tools.py`)
- **Test Case 4**: Verify that the `bash` tool correctly enforces timeouts (default 300s).
- **Test Case 5**: Ensure the `file_read` tool correctly rejects paths outside the defined workspace.
- **Test Case 6**: Test the `grep` tool with various regex patterns across multi-line files.

### 5.2.3 CLI Integration Tests
- **Test Case 7**: Verify the "Login" screen correctly transitions to the "Projects" screen upon successful auth.
- **Test Case 8**: Confirm that the `@` mention shortcut correctly resolves file paths and injects them into the context.

## 5.3 Test Results Summary

| Test Area | Total Tests | Passed | Failed |
| :--- | :--- | :--- | :--- |
| **Engine Logic** | 26 | 26 | 0 |
| **Tool Execution** | 21 | 21 | 0 |
| **Team Coordination**| 14 | 14 | 0 |
| **CLI UI (Manual)** | 8 | 8 | 0 |

All critical safety guards and orchestration logic have passed verification, ensuring the system is ready for production-grade software engineering tasks.
