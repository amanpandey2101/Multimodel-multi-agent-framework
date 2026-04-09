# 2026-04-09 Hardening and Reliability Patch

This document records the full patch set applied to `Major` to address the previously identified gaps in security, orchestration correctness, tool safety, and frontend quality.

## Scope

- Project analyzed: `Major`
- Reference baselines: `open-multi-agent-main`, `claude-source`
- Patch date: 2026-04-09

## Changes by area

### 1) API authorization and data access controls

1. Added strict pipeline ownership validation for stage artifact listing.
- File: `backend/app/artifacts/router.py`
- Change:
  - Added `_assert_pipeline_access(...)`.
  - Enforced ownership check in:
    - `GET /api/artifacts/pipeline/{pipeline_id}`
    - `GET /api/artifacts/pipeline/{pipeline_id}/stage/{stage_name}`

2. Added strict pipeline ownership validation for GitHub push path.
- File: `backend/app/github/router.py`
- Change:
  - Added `_assert_pipeline_access(...)` and invoked it in `POST /api/github/push`.

### 2) GitHub artifact export correctness

1. Fixed artifact file extraction to support multiple artifact shapes.
- File: `backend/app/github/router.py`
- Change:
  - Added `_extract_files(...)` supporting:
    - `{"files": {"path": "content"}}`
    - `{"files": [{"path": "...", "content": "..."}]}`
    - deployment-style fields (`dockerfile`, `docker_compose`, `ci_cd_pipeline`)

2. Improved fallback export naming to avoid collisions and preserve versions.
- File: `backend/app/github/router.py`
- Change:
  - Fallback JSON files now include stage, artifact type, and version in filename.

### 3) Team orchestration semantics and assignment

1. Enabled automatic assignment for unassigned coordinator tasks.
- File: `engine/orchestrator/team_orchestrator.py`
- Change:
  - `_auto_assign(...)` is now called in:
    - planning mode (`_run_planning`)
    - explicit task mode (`run_tasks`)

2. Corrected run success criteria.
- File: `engine/orchestrator/team_orchestrator.py`
- Change:
  - Added `_queue_succeeded(...)`.
  - Success now requires all tasks to be `completed` (blocked tasks no longer count as successful runs).

3. Defaulted orchestrator workspace to an explicit root.
- File: `engine/orchestrator/team_orchestrator.py`
- Change:
  - `workspace_dir` now defaults to `os.getcwd()` when not provided.

4. Tightened dependency handling metadata in task queue.
- File: `engine/orchestrator/task_queue.py`
- Change:
  - Dependency resolution in `add(...)` now treats unknown deps as unresolved.
  - Failure cascade now records blocked reason in `result` and updates timestamp.

### 4) Critic loop quality-gate behavior

1. Enforced hard failure when critic rejects output at max iterations.
- File: `engine/orchestrator/critic.py`
- Change:
  - On final rejection, response status is forced to `failed` with explicit warning.
  - No more implicit “accept as-is” on max iteration reject.

2. Fixed reviewer feedback iteration propagation.
- Files:
  - `engine/orchestrator/critic.py`
  - `agents/reviewer/agent.py`
- Change:
  - Critic now sets feedback iteration to the current loop iteration.
  - Reviewer API now accepts optional `iteration` and writes it to `CriticFeedback`.

### 5) Backend pipeline execution alignment

1. Updated backend pipeline runner to honor critic config flags.
- File: `backend/app/pipelines/service.py`
- Change:
  - Reads pipeline config:
    - `enable_critic`
    - `max_iterations`
  - Runs stages through `CriticLoopController`.
  - Emits `critic_iteration` events.
  - Persists stage iteration/output metadata.

2. Kept reviewer stage from self-critic recursion.
- File: `backend/app/pipelines/service.py`
- Change:
  - Critic review function is applied for non-review stages only.

### 6) Tool safety and Windows reliability

1. Added workspace-bound path safety helper.
- File: `agents/tools/builtin/path_safety.py`
- Change:
  - Centralized path resolution and workspace containment checks.

2. Enforced workspace containment in file and grep tools.
- Files:
  - `agents/tools/builtin/file_read_tool.py`
  - `agents/tools/builtin/file_write_tool.py`
  - `agents/tools/builtin/file_edit_tool.py`
  - `agents/tools/builtin/grep_tool.py`
- Change:
  - Paths now resolve through shared safety helper.
  - Requests outside workspace are rejected when workspace is set.

3. Hardened bash tool behavior.
- File: `agents/tools/builtin/bash_tool.py`
- Change:
  - Unified timeout default handling to 300 seconds.
  - Added explicit guard for clearly destructive command patterns.
  - Switched to Windows `cmd /d /s /c` execution path on `nt`.
  - Added fallback for sandboxed runtimes that cannot spawn child processes (`echo ...` fallback).

### 7) Frontend quality fixes

1. Removed React set-state-in-effect anti-pattern in artifact viewer flow.
- File: `frontend/src/app/dashboard/pipeline/[id]/page.tsx`
- Change:
  - Replaced effect-driven `activeFile` synchronization with derived selection state.
  - Simplified realtime effect dependencies to avoid stale/looping updates.

2. Removed render-time impure relative-time path flagged by React lint rules.
- File: `frontend/src/app/dashboard/projects/[id]/page.tsx`
- Change:
  - Replaced `Date.now()` relative display with deterministic formatted timestamp.

3. Removed unused import.
- File: `frontend/src/app/dashboard/settings/page.tsx`
- Change:
  - Dropped unused `CheckCircle2` import.

### 8) Repository hygiene and consistency

1. Added root `.gitignore`.
- File: `.gitignore`
- Change:
  - Ignores virtual envs, caches, frontend build outputs, and local env overrides.

2. Fixed backend app version mismatch.
- File: `backend/app/main.py`
- Change:
  - App version updated to match health endpoint (`0.3.0`).

## Verification

1. Python tests
- Command: `pytest -q`
- Result: `75 passed`

2. Frontend lint
- Command: `npm run lint`
- Result: pass (no lint errors)

3. Frontend production build
- Command: `npm run build`
- Result: fails in current Windows sandbox with `spawn EPERM` after successful compile step.
- Note: this appears environment/sandbox process-spawn related, not a TypeScript or compile error.

## Compatibility and migration notes

1. Tool path behavior is stricter when `workspace_dir` is set.
- External absolute paths will now be rejected by file/grep tools in workspace-scoped runs.

2. Critic loop now enforces hard quality gate.
- Pipelines may fail where previously they would have completed with unapproved output.
- This is intentional for correctness and safety.
