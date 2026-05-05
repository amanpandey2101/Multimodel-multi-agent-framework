// src/index.tsx
import React15 from "react";
import { render } from "ink";

// src/App.tsx
import React14, { useState as useState9, useEffect as useEffect6 } from "react";
import { Box as Box12, Text as Text14 } from "ink";

// src/screens/LoginScreen.tsx
import React2, { useState as useState2, useCallback } from "react";
import { Box, Text as Text2, useInput } from "ink";
import TextInput from "ink-text-input";

// src/components/Spinner.tsx
import React, { useState, useEffect } from "react";
import { Text } from "ink";
var FRAMES = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
function Spinner({ label }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, []);
  const char = FRAMES[frame] ?? "\u25D0";
  return /* @__PURE__ */ React.createElement(Text, null, /* @__PURE__ */ React.createElement(Text, { color: "magenta" }, char, " "), label && /* @__PURE__ */ React.createElement(Text, { dimColor: true }, label));
}

// src/api.ts
import * as dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
var __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });
var BASE_URL = (process.env["NEXT_PUBLIC_API_URL"] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
var _token = null;
function setToken(token) {
  _token = token;
}
function headers() {
  const h = { "Content-Type": "application/json" };
  if (_token) h["Authorization"] = `Bearer ${_token}`;
  return h;
}
async function get(path2) {
  const resp = await fetch(`${BASE_URL}/api${path2}`, { headers: headers() });
  if (!resp.ok) throw new Error(`GET ${path2} \u2192 ${resp.status} ${resp.statusText}`);
  return resp.json();
}
async function post(path2, body) {
  const resp = await fetch(`${BASE_URL}/api${path2}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`POST ${path2} \u2192 ${resp.status}: ${text}`);
  }
  return resp.json();
}
async function login(email, password) {
  const result = await post("/auth/login", { email, password });
  setToken(result.access_token);
  return result;
}
async function listProjects() {
  return get("/projects");
}
async function listPipelines(projectId) {
  return get(`/pipelines/project/${projectId}`);
}
async function getPipeline(pipelineId) {
  return get(`/pipelines/${pipelineId}`);
}
async function createPipeline(body) {
  return post("/pipelines/", body);
}
async function cancelPipeline(pipelineId) {
  await post(`/pipelines/${pipelineId}/cancel`, {});
}
async function checkHealth() {
  try {
    await fetch(`${BASE_URL}/api/health`);
    return true;
  } catch {
    return false;
  }
}

// src/screens/LoginScreen.tsx
function LoginScreen({ onSuccess, onChat, onError }) {
  const [email, setEmail] = useState2("");
  const [password, setPassword] = useState2("");
  const [focus, setFocus] = useState2("email");
  const [loading, setLoading] = useState2(false);
  const submit = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      onSuccess(email.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess, onError]);
  useInput((_input, key) => {
    if (loading) return;
    if (key.tab) {
      setFocus((f) => f === "email" ? "password" : "email");
    }
    if (key.return && focus === "password") {
      void submit();
    }
    if (key.ctrl && (_input === "l" || _input === "L")) {
      onChat();
    }
  });
  return /* @__PURE__ */ React2.createElement(Box, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React2.createElement(Box, { marginBottom: 1 }, /* @__PURE__ */ React2.createElement(Text2, { bold: true, color: "magenta" }, "\u25C8 AgentiX"), /* @__PURE__ */ React2.createElement(Text2, { dimColor: true }, "  Autonomous Engineering Platform")), /* @__PURE__ */ React2.createElement(Box, { borderStyle: "round", borderColor: "magenta", flexDirection: "column", paddingX: 2, paddingY: 1, width: 50 }, /* @__PURE__ */ React2.createElement(Text2, { bold: true }, "Sign in"), /* @__PURE__ */ React2.createElement(Box, { marginTop: 1, flexDirection: "column", gap: 1 }, /* @__PURE__ */ React2.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React2.createElement(Text2, { dimColor: true }, "Email"), /* @__PURE__ */ React2.createElement(Box, { borderStyle: "single", borderColor: focus === "email" ? "magenta" : "gray", paddingX: 1 }, /* @__PURE__ */ React2.createElement(
    TextInput,
    {
      value: email,
      onChange: setEmail,
      onSubmit: () => setFocus("password"),
      focus: focus === "email" && !loading,
      placeholder: "you@example.com"
    }
  ))), /* @__PURE__ */ React2.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React2.createElement(Text2, { dimColor: true }, "Password"), /* @__PURE__ */ React2.createElement(Box, { borderStyle: "single", borderColor: focus === "password" ? "magenta" : "gray", paddingX: 1 }, /* @__PURE__ */ React2.createElement(
    TextInput,
    {
      value: password,
      onChange: setPassword,
      onSubmit: () => void submit(),
      focus: focus === "password" && !loading,
      mask: "*",
      placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    }
  )))), /* @__PURE__ */ React2.createElement(Box, { marginTop: 1 }, loading ? /* @__PURE__ */ React2.createElement(Spinner, { label: "Signing in\u2026" }) : /* @__PURE__ */ React2.createElement(Text2, { dimColor: true }, "Tab to switch \xB7 Enter to sign in \xB7 ", /* @__PURE__ */ React2.createElement(Text2, { color: "cyan" }, "Ctrl+L"), " for Local Agent"))));
}

// src/screens/ProjectsScreen.tsx
import React3, { useEffect as useEffect2, useState as useState3, useCallback as useCallback2 } from "react";
import { Box as Box2, Text as Text3, useInput as useInput2 } from "ink";
function ProjectsScreen({ onNavigate, onError }) {
  const [projects, setProjects] = useState3([]);
  const [loading, setLoading] = useState3(true);
  const [cursor, setCursor] = useState3(0);
  const load = useCallback2(async () => {
    setLoading(true);
    try {
      const data = await listProjects();
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProjects(data);
      setCursor(0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [onError]);
  useEffect2(() => {
    void load();
  }, [load]);
  useInput2((_input, key) => {
    if (loading) return;
    if (key.upArrow || _input === "k") {
      setCursor((c) => Math.max(0, c - 1));
    }
    if (key.downArrow || _input === "j") {
      setCursor((c) => Math.min(projects.length - 1, c + 1));
    }
    if (key.return && projects[cursor]) {
      const proj = projects[cursor];
      onNavigate({ type: "pipelines", projectId: proj.id, projectName: proj.name });
    }
    if (_input === "n" || _input === "N") {
      onError("New project creation CLI not implemented, use dashboard");
    }
    if (_input === "q") {
      process.exit(0);
    }
    if (_input === "?") {
      onNavigate({ type: "help" });
    }
    if (_input === "c" || _input === "C") {
      onNavigate({ type: "chat" });
    }
  });
  const maxVisible = 10;
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), projects.length - maxVisible));
  const visibleProjects = projects.slice(startIdx, startIdx + maxVisible);
  if (loading && projects.length === 0) {
    return /* @__PURE__ */ React3.createElement(Box2, { paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React3.createElement(Spinner, { label: "Loading projects\u2026" }));
  }
  return /* @__PURE__ */ React3.createElement(Box2, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React3.createElement(Box2, { marginBottom: 1, paddingX: 1, borderStyle: "round", borderColor: "magenta" }, /* @__PURE__ */ React3.createElement(Text3, { bold: true, color: "magenta" }, "\u25C8 "), /* @__PURE__ */ React3.createElement(Text3, null, "Press "), /* @__PURE__ */ React3.createElement(Text3, { bold: true, color: "cyan" }, "c"), /* @__PURE__ */ React3.createElement(Text3, null, " to open the local coding agent (Claude Code style)")), /* @__PURE__ */ React3.createElement(Text3, { bold: true, color: "magenta" }, "Projects"), /* @__PURE__ */ React3.createElement(Box2, { marginTop: 1, flexDirection: "column" }, projects.length === 0 ? /* @__PURE__ */ React3.createElement(Text3, { dimColor: true }, "No projects found. Create one in the web dashboard.") : visibleProjects.map((p, i) => {
    const actualIdx = startIdx + i;
    const selected = actualIdx === cursor;
    return /* @__PURE__ */ React3.createElement(Box2, { key: p.id, flexDirection: "row" }, /* @__PURE__ */ React3.createElement(Text3, { color: selected ? "magenta" : void 0 }, selected ? "\u276F " : "  "), /* @__PURE__ */ React3.createElement(Text3, { bold: selected, color: selected ? "white" : "gray" }, p.name.padEnd(20)), /* @__PURE__ */ React3.createElement(Text3, { dimColor: true }, p.pipeline_count > 0 ? `${p.pipeline_count} pipelines` : "No pipelines"));
  })), projects.length > maxVisible && /* @__PURE__ */ React3.createElement(Box2, { marginTop: 1 }, /* @__PURE__ */ React3.createElement(Text3, { dimColor: true }, "Showing ", startIdx + 1, "-", Math.min(startIdx + maxVisible, projects.length), " of ", projects.length)));
}

// src/screens/PipelinesScreen.tsx
import React5, { useEffect as useEffect3, useState as useState4, useCallback as useCallback3 } from "react";
import { Box as Box4, Text as Text5, useInput as useInput3 } from "ink";

// src/components/PipelineStages.tsx
import React4 from "react";
import { Box as Box3, Text as Text4 } from "ink";
var STAGE_LABELS = {
  requirements: "Requirements",
  architecture: "Architecture",
  task_breakdown: "Tasks",
  implementation: "Code",
  review: "Review",
  deployment: "Deploy"
};
var STATUS_ICON = {
  pending: "\u25CB",
  running: "\u25C9",
  completed: "\u25CF",
  failed: "\u2715",
  cancelled: "\u2298"
};
var STATUS_COLOR = {
  pending: "dim",
  running: "blue",
  completed: "green",
  failed: "red",
  cancelled: "yellow"
};
function PipelineStages({ stages, overallStatus }) {
  const stageMap = new Map(stages.map((s) => [s.stage_name, s]));
  const keys = Object.keys(STAGE_LABELS);
  return /* @__PURE__ */ React4.createElement(Box3, { flexDirection: "column", marginY: 1 }, /* @__PURE__ */ React4.createElement(Box3, null, /* @__PURE__ */ React4.createElement(Text4, { bold: true, color: "magenta" }, "Pipeline "), /* @__PURE__ */ React4.createElement(PipelineStatusBadge, { status: overallStatus })), /* @__PURE__ */ React4.createElement(Box3, { marginTop: 1, flexDirection: "row", flexWrap: "wrap" }, keys.map((key, i) => {
    const stage = stageMap.get(key);
    const status = stage?.status ?? "pending";
    const icon = STATUS_ICON[status];
    const col = STATUS_COLOR[status];
    const label = STAGE_LABELS[key] ?? key;
    return /* @__PURE__ */ React4.createElement(Box3, { key, flexDirection: "row" }, /* @__PURE__ */ React4.createElement(Text4, { color: col }, icon, " "), /* @__PURE__ */ React4.createElement(Text4, { color: status === "running" ? "blue" : void 0, dimColor: status === "pending" }, label), i < keys.length - 1 && /* @__PURE__ */ React4.createElement(Text4, { dimColor: true }, "  \u2192  "));
  })));
}
function PipelineStatusBadge({ status }) {
  const icon = STATUS_ICON[status];
  const col = STATUS_COLOR[status];
  return /* @__PURE__ */ React4.createElement(Text4, { color: col }, icon, " ", status);
}

// src/screens/PipelinesScreen.tsx
function PipelinesScreen({ projectId, projectName, onNavigate, onError }) {
  const [pipelines, setPipelines] = useState4([]);
  const [loading, setLoading] = useState4(true);
  const [cursor, setCursor] = useState4(0);
  const load = useCallback3(async () => {
    setLoading(true);
    try {
      const data = await listPipelines(projectId);
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPipelines(data);
      setCursor(0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [projectId, onError]);
  useEffect3(() => {
    void load();
  }, [load]);
  useInput3((_input, key) => {
    if (loading) return;
    if (key.upArrow || _input === "k") {
      setCursor((c) => Math.max(0, c - 1));
    }
    if (key.downArrow || _input === "j") {
      setCursor((c) => Math.min(pipelines.length - 1, c + 1));
    }
    if (key.return && pipelines[cursor]) {
      const pip = pipelines[cursor];
      onNavigate({ type: "watch", pipelineId: pip.id });
    }
    if (_input === "n" || _input === "N") {
      onNavigate({ type: "new-pipeline", projectId, projectName });
    }
    if (key.escape || _input === "b") {
      onNavigate({ type: "projects" });
    }
    if (_input === "q") {
      process.exit(0);
    }
  });
  const maxVisible = 10;
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), pipelines.length - maxVisible));
  const visible = pipelines.slice(startIdx, startIdx + maxVisible);
  if (loading && pipelines.length === 0) {
    return /* @__PURE__ */ React5.createElement(Box4, { paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React5.createElement(Spinner, { label: `Loading pipelines for ${projectName}\u2026` }));
  }
  return /* @__PURE__ */ React5.createElement(Box4, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React5.createElement(Text5, { bold: true }, /* @__PURE__ */ React5.createElement(Text5, { color: "magenta" }, projectName, " "), /* @__PURE__ */ React5.createElement(Text5, { dimColor: true }, "\u203A Pipelines")), /* @__PURE__ */ React5.createElement(Box4, { marginTop: 1, flexDirection: "column" }, pipelines.length === 0 ? /* @__PURE__ */ React5.createElement(Text5, { dimColor: true }, "No pipelines found. Press 'n' to create one.") : visible.map((p, i) => {
    const actualIdx = startIdx + i;
    const selected = actualIdx === cursor;
    const req = p.requirement.length > 40 ? p.requirement.slice(0, 37) + "..." : p.requirement;
    return /* @__PURE__ */ React5.createElement(Box4, { key: p.id, flexDirection: "row" }, /* @__PURE__ */ React5.createElement(Text5, { color: selected ? "magenta" : void 0 }, selected ? "\u276F " : "  "), /* @__PURE__ */ React5.createElement(Box4, { width: 15 }, /* @__PURE__ */ React5.createElement(PipelineStatusBadge, { status: p.status })), /* @__PURE__ */ React5.createElement(Box4, { width: 45 }, /* @__PURE__ */ React5.createElement(Text5, { bold: selected, color: selected ? "white" : "gray" }, req)), /* @__PURE__ */ React5.createElement(Text5, { dimColor: true }, p.llm_provider));
  })), pipelines.length > maxVisible && /* @__PURE__ */ React5.createElement(Box4, { marginTop: 1 }, /* @__PURE__ */ React5.createElement(Text5, { dimColor: true }, "Showing ", startIdx + 1, "-", Math.min(startIdx + maxVisible, pipelines.length), " of ", pipelines.length)));
}

// src/screens/NewPipelineScreen.tsx
import React6, { useState as useState5, useCallback as useCallback4 } from "react";
import { Box as Box5, Text as Text6, useInput as useInput4 } from "ink";
import TextInput2 from "ink-text-input";
function NewPipelineScreen({ projectId, projectName, onNavigate, onError }) {
  const [requirement, setRequirement] = useState5("");
  const [provider, setProvider] = useState5("openai");
  const [mode, setMode] = useState5("planning");
  const [focus, setFocus] = useState5("requirement");
  const [loading, setLoading] = useState5(false);
  const submit = useCallback4(async () => {
    if (!requirement.trim()) return;
    setLoading(true);
    try {
      const pip = await createPipeline({
        project_id: projectId,
        requirement,
        llm_provider: provider,
        mode
      });
      onNavigate({ type: "watch", pipelineId: pip.id });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Creation failed");
      setLoading(false);
    }
  }, [projectId, requirement, provider, mode, onNavigate, onError]);
  useInput4((_input, key) => {
    if (loading) return;
    if (key.escape) {
      onNavigate({ type: "pipelines", projectId, projectName });
      return;
    }
    if (key.tab) {
      setFocus((f) => {
        if (f === "requirement") return "provider";
        if (f === "provider") return "mode";
        return "requirement";
      });
    }
    if (focus === "provider" && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      setProvider((p) => p === "openai" ? "anthropic" : p === "anthropic" ? "gemini" : "openai");
    }
    if (focus === "mode" && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      setMode((m) => m === "planning" ? "fast" : "planning");
    }
    if (key.return && focus === "mode") {
      void submit();
    }
  });
  return /* @__PURE__ */ React6.createElement(Box5, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React6.createElement(Text6, { bold: true }, /* @__PURE__ */ React6.createElement(Text6, { color: "magenta" }, projectName, " "), /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "\u203A New Pipeline")), /* @__PURE__ */ React6.createElement(Box5, { marginTop: 1, borderStyle: "round", borderColor: "magenta", paddingX: 2, paddingY: 1, width: 60, flexDirection: "column" }, /* @__PURE__ */ React6.createElement(Box5, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Requirement"), /* @__PURE__ */ React6.createElement(Box5, { borderStyle: "single", borderColor: focus === "requirement" ? "magenta" : "gray", paddingX: 1 }, /* @__PURE__ */ React6.createElement(
    TextInput2,
    {
      value: requirement,
      onChange: setRequirement,
      onSubmit: () => setFocus("provider"),
      focus: focus === "requirement" && !loading,
      placeholder: "e.g. Build a snake game in React"
    }
  ))), /* @__PURE__ */ React6.createElement(Box5, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "LLM Provider (Arrow keys to change)"), /* @__PURE__ */ React6.createElement(Box5, { borderStyle: "single", borderColor: focus === "provider" ? "magenta" : "gray", paddingX: 1 }, /* @__PURE__ */ React6.createElement(Text6, { color: focus === "provider" ? "white" : "gray" }, provider === "openai" ? "\u25C9 OpenAI" : "\u25CB OpenAI", "  ", " ", provider === "anthropic" ? "\u25C9 Anthropic" : "\u25CB Anthropic", "  ", " ", provider === "gemini" ? "\u25C9 Gemini" : "\u25CB Gemini"))), /* @__PURE__ */ React6.createElement(Box5, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Mode (Arrow keys to change)"), /* @__PURE__ */ React6.createElement(Box5, { borderStyle: "single", borderColor: focus === "mode" ? "magenta" : "gray", paddingX: 1 }, /* @__PURE__ */ React6.createElement(Text6, { color: focus === "mode" ? "white" : "gray" }, mode === "planning" ? "\u25C9 Planning (Interactive)" : "\u25CB Planning (Interactive)", "  ", " ", mode === "fast" ? "\u25C9 Fast (Autonomous)" : "\u25CB Fast (Autonomous)"))), /* @__PURE__ */ React6.createElement(Box5, { marginTop: 1 }, loading ? /* @__PURE__ */ React6.createElement(Spinner, { label: "Starting pipeline\u2026" }) : /* @__PURE__ */ React6.createElement(Text6, { dimColor: true }, "Tab: next field \xB7 Enter in Mode: submit \xB7 Esc: cancel"))));
}

// src/screens/WatchScreen.tsx
import React7, { useEffect as useEffect4, useState as useState6, useCallback as useCallback5, useRef } from "react";
import { Box as Box6, Text as Text7, useInput as useInput5 } from "ink";
import { createClient } from "@supabase/supabase-js";
function WatchScreen({ pipelineId, onNavigate, onError }) {
  const [pipeline, setPipeline] = useState6(null);
  const [loading, setLoading] = useState6(true);
  const [logMessages, setLogMessages] = useState6([]);
  const channelRef = useRef(null);
  const loadInitial = useCallback5(async () => {
    try {
      const data = await getPipeline(pipelineId);
      setPipeline(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [pipelineId, onError]);
  useEffect4(() => {
    void loadInitial();
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    if (url && key) {
      const supabase = createClient(url, key);
      const channel = supabase.channel(`pipeline_${pipelineId}`);
      channel.on("broadcast", { event: "stage_update" }, (payload) => {
        setPipeline(payload.payload.pipeline);
      });
      channel.on("broadcast", { event: "log" }, (payload) => {
        const log = payload.payload;
        setLogMessages((prev) => {
          const newLogs = [...prev, {
            id: Math.random().toString(),
            msg: log.message,
            time: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
            is_error: log.level === "error"
          }];
          if (newLogs.length > 10) return newLogs.slice(newLogs.length - 10);
          return newLogs;
        });
      });
      channel.subscribe();
      channelRef.current = channel;
    } else {
      const interval = setInterval(() => {
        void loadInitial();
      }, 5e3);
      return () => clearInterval(interval);
    }
    return () => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
      }
    };
  }, [loadInitial, pipelineId]);
  useInput5((_input, key) => {
    if (key.escape || _input === "q") {
      if (pipeline) {
        onNavigate({ type: "pipelines", projectId: pipeline.project_id, projectName: "Project" });
      } else {
        onNavigate({ type: "projects" });
      }
    }
    if (_input === "c" && pipeline && (pipeline.status === "pending" || pipeline.status === "running")) {
      void cancelPipeline(pipelineId);
    }
  });
  if (loading || !pipeline) {
    return /* @__PURE__ */ React7.createElement(Box6, { paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React7.createElement(Spinner, { label: "Loading pipeline\u2026" }));
  }
  const isComplete = pipeline.status === "completed" || pipeline.status === "failed" || pipeline.status === "cancelled";
  return /* @__PURE__ */ React7.createElement(Box6, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, "Pipeline ", pipelineId), /* @__PURE__ */ React7.createElement(PipelineStages, { stages: pipeline.stages, overallStatus: pipeline.status }), /* @__PURE__ */ React7.createElement(Box6, { marginTop: 1, flexDirection: "column", borderStyle: "single", borderColor: "gray", paddingX: 1, width: "100%" }, /* @__PURE__ */ React7.createElement(Text7, { bold: true, dimColor: true }, "Activity Log"), /* @__PURE__ */ React7.createElement(Box6, { marginTop: 1, flexDirection: "column", height: 10 }, logMessages.length === 0 ? /* @__PURE__ */ React7.createElement(Text7, { dimColor: true, italic: true }, "Waiting for logs...") : logMessages.map((log) => /* @__PURE__ */ React7.createElement(Text7, { key: log.id }, /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, log.time, " "), /* @__PURE__ */ React7.createElement(Text7, { color: log.is_error ? "red" : void 0 }, log.msg))))), /* @__PURE__ */ React7.createElement(Box6, { marginTop: 1 }, !isComplete ? /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, "q/Esc: back \xB7 c: cancel active runs") : /* @__PURE__ */ React7.createElement(Text7, { dimColor: true }, "q/Esc: back (pipeline finished)")));
}

// src/screens/ChatScreen.tsx
import React12, { useState as useState8, useEffect as useEffect5, useCallback as useCallback6, useRef as useRef2 } from "react";
import { Box as Box10, Text as Text12, useInput as useInput7 } from "ink";
import * as fs from "fs/promises";
import * as path from "path";
import TextInput3 from "ink-text-input";

// src/components/MessageBubble.tsx
import React9 from "react";
import { Box as Box7, Text as Text9 } from "ink";

// src/components/Markdown.tsx
import React8, { useMemo } from "react";
import { Text as Text8 } from "ink";
import { marked } from "marked";
import markedTerminal from "marked-terminal";
marked.use(markedTerminal({
  // Options for marked-terminal
  showSectionPrefix: false,
  unescape: true,
  emoji: true,
  width: 80
}));
function Markdown({ children }) {
  const rendered = useMemo(() => {
    try {
      return marked.parse(children || "");
    } catch {
      return children;
    }
  }, [children]);
  return /* @__PURE__ */ React8.createElement(Text8, null, rendered);
}

// src/components/MessageBubble.tsx
function MessageBubble({ role, content }) {
  if (role === "user") {
    return /* @__PURE__ */ React9.createElement(Box7, { marginTop: 1 }, /* @__PURE__ */ React9.createElement(Box7, { flexDirection: "column" }, /* @__PURE__ */ React9.createElement(Text9, { color: "cyan", bold: true }, "\u25B6 You"), /* @__PURE__ */ React9.createElement(Box7, { marginLeft: 2 }, /* @__PURE__ */ React9.createElement(Markdown, null, content))));
  }
  return /* @__PURE__ */ React9.createElement(Box7, { marginTop: 1 }, /* @__PURE__ */ React9.createElement(Box7, { flexDirection: "column" }, /* @__PURE__ */ React9.createElement(Text9, { color: "magenta", bold: true }, "\u25C8 AgentiX"), /* @__PURE__ */ React9.createElement(Box7, { marginLeft: 2, flexDirection: "column" }, /* @__PURE__ */ React9.createElement(Markdown, null, content))));
}

// src/components/ToolCallLine.tsx
import React10 from "react";
import { Box as Box8, Text as Text10 } from "ink";
function formatArgs(rawArgs, toolName) {
  try {
    const args = JSON.parse(rawArgs);
    const summary = args["path"] ?? args["command"] ?? args["pattern"] ?? args["query"] ?? Object.values(args)[0] ?? "";
    const str = String(summary);
    return str.length > 60 ? str.slice(0, 57) + "..." : str;
  } catch {
    return "";
  }
}
var ICONS = {
  running: "\u27F3",
  done: "\u2713",
  error: "\u2717",
  denied: "\u2298",
  approval: "\u26A0"
};
var COLORS = {
  running: "yellow",
  done: "green",
  error: "red",
  denied: "gray",
  approval: "yellow"
};
function ToolCallLine({ name, args = "", status, output }) {
  const icon = ICONS[status];
  const color = COLORS[status];
  const summary = formatArgs(args, name);
  return /* @__PURE__ */ React10.createElement(Box8, { flexDirection: "column" }, /* @__PURE__ */ React10.createElement(Box8, null, /* @__PURE__ */ React10.createElement(Text10, { color }, icon, " "), /* @__PURE__ */ React10.createElement(Text10, { bold: true }, name), summary ? /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement(Text10, { dimColor: true }, "("), /* @__PURE__ */ React10.createElement(Text10, { dimColor: true }, summary), /* @__PURE__ */ React10.createElement(Text10, { dimColor: true }, ")")) : null), status === "error" && output ? /* @__PURE__ */ React10.createElement(Box8, { marginLeft: 2 }, /* @__PURE__ */ React10.createElement(Text10, { color: "red", dimColor: true }, output.slice(0, 200))) : null);
}

// src/components/ApprovalPrompt.tsx
import React11, { useState as useState7 } from "react";
import { Box as Box9, Text as Text11, useInput as useInput6 } from "ink";
function formatArgsForDisplay(rawArgs) {
  try {
    const parsed = JSON.parse(rawArgs);
    return Object.entries(parsed).map(([k, v]) => `  ${k}: ${String(v).slice(0, 100)}`).join("\n");
  } catch {
    return rawArgs.slice(0, 200);
  }
}
function ApprovalPrompt({ toolName, args, onDecision }) {
  const [done, setDone] = useState7(false);
  useInput6((input, _key) => {
    if (done) return;
    if (input === "y" || input === "Y") {
      setDone(true);
      onDecision(true);
    } else if (input === "n" || input === "N" || input === "") {
      setDone(true);
      onDecision(false);
    }
  });
  if (done) return null;
  return /* @__PURE__ */ React11.createElement(
    Box9,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "yellow",
      paddingX: 2,
      paddingY: 1,
      marginTop: 1
    },
    /* @__PURE__ */ React11.createElement(Text11, { bold: true, color: "yellow" }, "\u26A0  Permission required"),
    /* @__PURE__ */ React11.createElement(Box9, { marginTop: 1, flexDirection: "column" }, /* @__PURE__ */ React11.createElement(Text11, null, "Tool: ", /* @__PURE__ */ React11.createElement(Text11, { bold: true }, toolName)), /* @__PURE__ */ React11.createElement(Text11, { dimColor: true }, "Arguments:"), /* @__PURE__ */ React11.createElement(Box9, { marginLeft: 2 }, /* @__PURE__ */ React11.createElement(Text11, { dimColor: true }, formatArgsForDisplay(args)))),
    /* @__PURE__ */ React11.createElement(Box9, { marginTop: 1 }, /* @__PURE__ */ React11.createElement(Text11, null, "Allow? "), /* @__PURE__ */ React11.createElement(Text11, { bold: true, color: "green" }, "[y]"), /* @__PURE__ */ React11.createElement(Text11, null, " / "), /* @__PURE__ */ React11.createElement(Text11, { bold: true, color: "red" }, "[n]"))
  );
}

// src/agent/LLMClient.ts
import OpenAI from "openai";

// src/config.ts
import * as dotenv2 from "dotenv";
import { resolve as resolve2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var __srcDir = fileURLToPath2(new URL(".", import.meta.url));
var ENV_CANDIDATES = [
  resolve2(__srcDir, "../.env"),
  // Major/cli/.env
  resolve2(__srcDir, "../../.env"),
  // Major/.env  ← primary
  resolve2(__srcDir, "../../../.env"),
  // multi-agent root .env (fallback)
  resolve2(process.cwd(), ".env")
  // wherever you run from
];
for (const path2 of ENV_CANDIDATES) {
  dotenv2.config({ path: path2 });
}
var config3 = {
  openaiApiKey: process.env["OPENAI_API_KEY"] ?? "",
  anthropicApiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
  defaultModel: process.env["AGENT_MODEL"] ?? "gpt-4o-mini",
  defaultProvider: process.env["AGENT_PROVIDER"] ?? "openai",
  maxTokens: parseInt(process.env["AGENT_MAX_TOKENS"] ?? "4096", 10),
  temperature: parseFloat(process.env["AGENT_TEMPERATURE"] ?? "0.2"),
  historyDir: resolve2(
    process.env["USERPROFILE"] ?? process.env["HOME"] ?? ".",
    ".agent-cli",
    "history"
  ),
  permissionsFile: resolve2(
    process.env["USERPROFILE"] ?? process.env["HOME"] ?? ".",
    ".agent-cli",
    "permissions.json"
  )
};

// src/agent/LLMClient.ts
var LLMClient = class {
  client;
  constructor(apiKey) {
    this.client = new OpenAI({
      apiKey: apiKey ?? config3.openaiApiKey
    });
  }
  async *stream(messages, tools, model = config3.defaultModel, signal) {
    try {
      const toolCallBuffers = /* @__PURE__ */ new Map();
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages,
          tools: tools.length > 0 ? tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters }
          })) : void 0,
          stream: true,
          stream_options: { include_usage: true },
          temperature: config3.temperature,
          max_tokens: config3.maxTokens
        },
        { signal }
      );
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
        if (!choice) continue;
        const delta = choice.delta;
        if (delta.content) {
          yield { type: "text", delta: delta.content };
        }
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index;
          if (!toolCallBuffers.has(idx)) {
            toolCallBuffers.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
          }
          const buf = toolCallBuffers.get(idx);
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) buf.args += tc.function.arguments;
        }
      }
      for (const buf of toolCallBuffers.values()) {
        yield {
          type: "tool_call",
          toolCall: {
            id: buf.id,
            type: "function",
            function: { name: buf.name, arguments: buf.args }
          }
        };
      }
      yield { type: "done", usage: { inputTokens, outputTokens } };
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
};

// src/agent/ToolRegistry.ts
var ToolRegistry = class {
  tools = /* @__PURE__ */ new Map();
  register(tool) {
    this.tools.set(tool.definition.name, tool);
  }
  get(name) {
    return this.tools.get(name);
  }
  getDefinitions() {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }
  async execute(name, rawArgs, signal) {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: `Tool "${name}" is not registered.`, isError: true };
    }
    let args;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return { output: `Invalid JSON arguments for tool "${name}".`, isError: true };
    }
    try {
      return await tool.handler(args, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Tool "${name}" error: ${msg}`, isError: true };
    }
  }
  needsApproval(name, rawArgs) {
    const tool = this.tools.get(name);
    if (!tool?.requiresApproval) return false;
    try {
      const args = JSON.parse(rawArgs);
      return tool.requiresApproval(args);
    } catch {
      return false;
    }
  }
};

// src/agent/AgentLoop.ts
var AgentLoop = class {
  constructor(client, registry, systemPrompt) {
    this.client = client;
    this.registry = registry;
    this.systemPrompt = systemPrompt;
  }
  client;
  registry;
  systemPrompt;
  history = [];
  getHistory() {
    return [...this.history];
  }
  clearHistory() {
    this.history = [];
  }
  async *run(userMessage, opts = {}) {
    const { model, maxTurns = 20, signal, onApproval } = opts;
    this.history.push({ role: "user", content: userMessage });
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...this.history
    ];
    let turns = 0;
    while (turns < maxTurns) {
      if (signal?.aborted) break;
      turns++;
      const pendingToolCalls = [];
      let assistantText = "";
      let usage = { inputTokens: 0, outputTokens: 0 };
      for await (const chunk of this.client.stream(messages, this.registry.getDefinitions(), model, signal)) {
        if (chunk.type === "text") {
          assistantText += chunk.delta;
          yield { type: "text", delta: chunk.delta };
        } else if (chunk.type === "tool_call") {
          pendingToolCalls.push(chunk.toolCall);
        } else if (chunk.type === "done") {
          usage = chunk.usage;
          yield { type: "turn_done", usage };
        } else if (chunk.type === "error") {
          yield { type: "error", error: chunk.error };
          return;
        }
      }
      const assistantMessage = {
        role: "assistant",
        content: assistantText || null,
        ...pendingToolCalls.length > 0 ? { tool_calls: pendingToolCalls } : {}
      };
      messages.push(assistantMessage);
      this.history.push(assistantMessage);
      if (pendingToolCalls.length === 0) {
        break;
      }
      for (const tc of pendingToolCalls) {
        const { name, arguments: rawArgs } = tc.function;
        const callId = tc.id;
        const needsApproval2 = this.registry.needsApproval(name, rawArgs);
        if (needsApproval2) {
          yield { type: "approval_needed", name, args: rawArgs, callId };
          if (onApproval) {
            const approved = await onApproval(name, rawArgs);
            if (!approved) {
              const deniedOutput = `[User denied permission to run ${name}]`;
              const toolMsg2 = {
                role: "tool",
                tool_call_id: callId,
                content: deniedOutput
              };
              messages.push(toolMsg2);
              this.history.push(toolMsg2);
              yield { type: "tool_result", name, callId, output: deniedOutput, isError: false, needsApproval: true };
              continue;
            }
          }
        }
        yield { type: "tool_start", name, args: rawArgs, callId };
        const result = await this.registry.execute(name, rawArgs, signal);
        const toolMsg = {
          role: "tool",
          tool_call_id: callId,
          content: result.output
        };
        messages.push(toolMsg);
        this.history.push(toolMsg);
        yield { type: "tool_result", name, callId, output: result.output, isError: result.isError, needsApproval: false };
      }
    }
    yield { type: "done" };
  }
};

// src/context/GitContext.ts
import { exec } from "child_process";
import { promisify } from "util";
var execAsync = promisify(exec);
var MAX_STATUS_CHARS = 2e3;
async function run(cmd, cwd) {
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 5e3 });
    return stdout.trim();
  } catch {
    return "";
  }
}
async function isGitRepo(cwd) {
  try {
    const { stdout } = await execAsync("git rev-parse --is-inside-work-tree", { cwd, timeout: 3e3 });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
async function getGitContext(cwd) {
  if (!await isGitRepo(cwd)) return null;
  const [branch, status, log, userName] = await Promise.all([
    run("git rev-parse --abbrev-ref HEAD", cwd),
    run("git status --short", cwd),
    run("git log --oneline -n 5", cwd),
    run("git config user.name", cwd)
  ]);
  const truncatedStatus = status.length > MAX_STATUS_CHARS ? status.slice(0, MAX_STATUS_CHARS) + "\n... (truncated \u2014 run `git status` for full output)" : status;
  const parts = [
    `Git branch: ${branch || "unknown"}`,
    userName ? `Git user: ${userName}` : null,
    `Git status:
${truncatedStatus || "(clean)"}`,
    log ? `Recent commits:
${log}` : null
  ].filter(Boolean);
  return parts.join("\n\n");
}

// src/context/DirTree.ts
import { readdir } from "fs/promises";
import { join, relative } from "path";
var EXCLUDE = /* @__PURE__ */ new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "coverage", ".turbo"]);
var MAX_ENTRIES = 80;
var MAX_DEPTH = 3;
async function buildCompactTree(dir, depth, prefix, lines, count) {
  if (depth > MAX_DEPTH || count.n >= MAX_ENTRIES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < entries.length; i++) {
    if (count.n >= MAX_ENTRIES) {
      lines.push(`${prefix}\u2026`);
      break;
    }
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const conn = isLast ? "\u2514\u2500 " : "\u251C\u2500 ";
    const nextPrefix = isLast ? prefix + "   " : prefix + "\u2502  ";
    if (entry.isDirectory()) {
      if (EXCLUDE.has(entry.name)) continue;
      lines.push(`${prefix}${conn}${entry.name}/`);
      count.n++;
      await buildCompactTree(join(dir, entry.name), depth + 1, nextPrefix, lines, count);
    } else {
      lines.push(`${prefix}${conn}${entry.name}`);
      count.n++;
    }
  }
}
async function getDirTree(cwd) {
  const rel = relative(process.cwd(), cwd) || ".";
  const lines = [`${rel}/`];
  await buildCompactTree(cwd, 1, "", lines, { n: 0 });
  return lines.join("\n");
}

// src/context/ClaudeMd.ts
import { readFile, access } from "fs/promises";
import { join as join2, dirname } from "path";
var MEMORY_FILES = ["CLAUDE.md", "AGENT.md", ".agent.md", "AGENTS.md"];
async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
async function getClaudeMd(startDir) {
  let current = startDir;
  const root = dirname(current.split(":")[0] ?? current);
  for (let depth = 0; depth < 10; depth++) {
    for (const name of MEMORY_FILES) {
      const candidate = join2(current, name);
      if (await fileExists(candidate)) {
        try {
          const content = await readFile(candidate, "utf-8");
          if (content.trim()) {
            return `# Project Instructions (from ${name})

${content.trim()}`;
          }
        } catch {
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// src/context/SystemPrompt.ts
var BASE_PROMPT = `You are an expert software engineering assistant \u2014 a local coding agent running in the user's terminal.

You have access to the local filesystem and can read files, edit code, run commands, and search the codebase.

## Core principles
- EXTREMELY CONCISE: Be as brief as possible. Minimize token usage.
- Prefer action over explanation. Omit all pleasantries and filler words.
- For code explanations, give a 1-2 sentence summary unless a detailed breakdown is explicitly requested.
- Always read the relevant files before making edits.
- Prefer targeted edits (edit_file) over full rewrites (write_file).
- Run tests after making changes when a test command is known.
- If unsure, ask a clarifying question before taking action.
- Never run destructive commands without explicit user confirmation.

## Working with the codebase
- Use grep to search before assuming file contents.
- Use list_dir to understand project structure.
- Read small targeted sections of files using offset/limit in read_file.
- Make sure edits are syntactically valid \u2014 prefer running the code after editing.

## Communication style
- Use markdown formatting in responses.
- When showing code changes, show a before/after diff mentally.
- Keep responses focused \u2014 no unnecessary preamble.
`;
var cachedPrompt = null;
var cachedCwd = null;
async function buildSystemPrompt(cwd, forceRefresh = false) {
  if (cachedPrompt && cachedCwd === cwd && !forceRefresh) {
    return cachedPrompt;
  }
  const [claudeMd, gitContext, dirTree] = await Promise.all([
    getClaudeMd(cwd).catch(() => null),
    getGitContext(cwd).catch(() => null),
    getDirTree(cwd).catch(() => null)
  ]);
  const sections = [BASE_PROMPT];
  if (claudeMd) {
    sections.push(`---
${claudeMd}`);
  }
  sections.push(`---
## Environment
Current directory: ${cwd}
Platform: ${process.platform}
Date: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`);
  if (dirTree) {
    sections.push(`---
## Project Structure
\`\`\`
${dirTree}
\`\`\``);
  }
  if (gitContext) {
    sections.push(`---
## Git Context
${gitContext}`);
  }
  cachedPrompt = sections.join("\n\n");
  cachedCwd = cwd;
  return cachedPrompt;
}

// src/tools/ReadFileTool.ts
import { readFile as readFile2, stat as stat2 } from "fs/promises";
import { resolve as resolve3, relative as relative2 } from "path";
var MAX_FILE_SIZE = 5e5;
var ReadFileTool = {
  definition: {
    name: "read_file",
    description: "Read the contents of a file at the given path. For large files, use offset and limit to read specific line ranges.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file to read."
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-indexed). Defaults to 1."
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read. Defaults to 250."
        }
      },
      required: ["path"]
    }
  },
  async handler(args, _signal) {
    const rawPath = args["path"];
    if (typeof rawPath !== "string" || !rawPath) {
      return { output: "path is required and must be a string.", isError: true };
    }
    const absPath = resolve3(process.cwd(), rawPath);
    const relPath = relative2(process.cwd(), absPath);
    try {
      const info = await stat2(absPath);
      if (!info.isFile()) {
        return { output: `"${relPath}" is not a file.`, isError: true };
      }
      if (info.size > MAX_FILE_SIZE) {
        return {
          output: `File "${relPath}" is too large (${Math.round(info.size / 1024)}KB). Use offset and limit to read specific sections.`,
          isError: true
        };
      }
      const raw = await readFile2(absPath, "utf-8");
      const lines = raw.split("\n");
      const total = lines.length;
      const offset = typeof args["offset"] === "number" ? Math.max(1, args["offset"]) : 1;
      const limit = typeof args["limit"] === "number" ? args["limit"] : 250;
      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = sliced.map((line, i) => `${String(offset + i).padStart(4, " ")} \u2502 ${line}`);
      const showing = sliced.length < total ? ` (lines ${offset}\u2013${offset + sliced.length - 1} of ${total})` : "";
      return {
        output: `File: ${relPath}${showing}
${"\u2500".repeat(40)}
${numbered.join("\n")}`,
        isError: false
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Cannot read "${relPath}": ${msg}`, isError: true };
    }
  }
};

// src/tools/WriteFileTool.ts
import { writeFile, mkdir } from "fs/promises";
import { resolve as resolve4, relative as relative3, dirname as dirname2 } from "path";
var WriteFileTool = {
  definition: {
    name: "write_file",
    description: "Write content to a file, creating it (and any parent directories) if it does not exist. Overwrites existing content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to write." },
        content: { type: "string", description: "The content to write into the file." }
      },
      required: ["path", "content"]
    }
  },
  // Always require approval for write operations
  requiresApproval: () => true,
  async handler(args, _signal) {
    const rawPath = args["path"];
    const content = args["content"];
    if (typeof rawPath !== "string" || !rawPath) {
      return { output: "path is required.", isError: true };
    }
    if (typeof content !== "string") {
      return { output: "content must be a string.", isError: true };
    }
    const absPath = resolve4(process.cwd(), rawPath);
    const relPath = relative3(process.cwd(), absPath);
    try {
      await mkdir(dirname2(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
      const lines = content.split("\n").length;
      return { output: `Wrote ${lines} lines to ${relPath}`, isError: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Failed to write "${relPath}": ${msg}`, isError: true };
    }
  }
};

// src/tools/EditFileTool.ts
import { readFile as readFile3, writeFile as writeFile2 } from "fs/promises";
import { resolve as resolve5, relative as relative4 } from "path";
var EditFileTool = {
  definition: {
    name: "edit_file",
    description: `Edit a file by replacing an exact string match. 
IMPORTANT: old_string must be an exact, unique substring of the file \u2014 including leading whitespace.
For creating new files, use write_file instead.
Prefer small, focused edits over replacing large sections.`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to edit." },
        old_string: { type: "string", description: "Exact text to find and replace. Must be unique in the file." },
        new_string: { type: "string", description: "Text to replace old_string with." }
      },
      required: ["path", "old_string", "new_string"]
    }
  },
  requiresApproval: () => true,
  async handler(args, _signal) {
    const rawPath = args["path"];
    const oldString = args["old_string"];
    const newString = args["new_string"];
    if (typeof rawPath !== "string" || !rawPath) return { output: "path is required.", isError: true };
    if (typeof oldString !== "string") return { output: "old_string must be a string.", isError: true };
    if (typeof newString !== "string") return { output: "new_string must be a string.", isError: true };
    const absPath = resolve5(process.cwd(), rawPath);
    const relPath = relative4(process.cwd(), absPath);
    let content;
    try {
      content = await readFile3(absPath, "utf-8");
    } catch {
      return { output: `Cannot read "${relPath}" \u2014 does it exist?`, isError: true };
    }
    const occurrences = content.split(oldString).length - 1;
    if (occurrences === 0) {
      return {
        output: `old_string not found in "${relPath}". Check the exact text, including whitespace.`,
        isError: true
      };
    }
    if (occurrences > 1) {
      return {
        output: `old_string found ${occurrences} times in "${relPath}". Make it more specific to target a unique match.`,
        isError: true
      };
    }
    const updated = content.replace(oldString, newString);
    try {
      await writeFile2(absPath, updated, "utf-8");
      const added = newString.split("\n").length - oldString.split("\n").length;
      const sign = added >= 0 ? "+" : "";
      return {
        output: `Edited "${relPath}" (${sign}${added} lines net)`,
        isError: false
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Failed to write "${relPath}": ${msg}`, isError: true };
    }
  }
};

// src/tools/BashTool.ts
import { spawn } from "child_process";
var DEFAULT_TIMEOUT_MS = 3e4;
var BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/\s*$/,
  /format\s+[a-z]:/i,
  /del\s+\/[sf]/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
  /:(){ :|:& };:/
  // fork bomb
];
function isBlocked(command) {
  return BLOCKED_PATTERNS.some((p) => p.test(command));
}
var APPROVAL_PATTERNS = [
  /\brm\b/,
  /\bdel\b/,
  /\bnpm\s+(install|uninstall|ci)\b/,
  /\bpip\s+install\b/,
  /\bgit\s+(push|reset|rebase|merge|checkout\s+-[bB])/,
  /\bmkdir\b/,
  /\bchmod\b/,
  /\bsudo\b/,
  /\bpowerShell\s+-Command/i
];
function needsApproval(command) {
  return APPROVAL_PATTERNS.some((p) => p.test(command));
}
function runCommand(command, cwd, timeoutMs, signal) {
  return new Promise((resolve9) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "powershell.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["-NoProfile", "-Command", command] : ["-c", command];
    const child = spawn(shell, shellArgs, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve9({ stdout, stderr: stderr + "\n[Command timed out]", exitCode: 124 });
    }, timeoutMs);
    signal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      clearTimeout(timer);
      resolve9({ stdout, stderr: stderr + "\n[Command cancelled]", exitCode: 130 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve9({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}
var MAX_OUTPUT_CHARS = 1e4;
function truncate(s) {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  const half = MAX_OUTPUT_CHARS / 2;
  return s.slice(0, half) + "\n... [output truncated] ...\n" + s.slice(-half);
}
var BashTool = {
  definition: {
    name: "bash",
    description: `Execute a shell command and return its output.
- On Windows, commands run in PowerShell. Use PowerShell syntax.
- Avoid interactive commands that require stdin.
- Commands time out after 30s by default (use timeout_ms to override, max 120s).
- For long-running processes, add & to run in background.`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute." },
        cwd: { type: "string", description: "Working directory. Defaults to current project directory." },
        timeout_ms: { type: "number", description: "Timeout in milliseconds. Max 120000." }
      },
      required: ["command"]
    }
  },
  requiresApproval: (args) => {
    const command = args["command"];
    return typeof command === "string" && needsApproval(command);
  },
  async handler(args, signal) {
    const command = args["command"];
    if (typeof command !== "string" || !command.trim()) {
      return { output: "command is required.", isError: true };
    }
    if (isBlocked(command)) {
      return {
        output: `\u274C Command blocked for safety: ${command}
This command pattern is not allowed.`,
        isError: true
      };
    }
    const cwd = typeof args["cwd"] === "string" ? args["cwd"] : process.cwd();
    const rawTimeout = typeof args["timeout_ms"] === "number" ? args["timeout_ms"] : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(rawTimeout, 12e4);
    const { stdout, stderr, exitCode } = await runCommand(command, cwd, timeoutMs, signal);
    const parts = [];
    if (stdout.trim()) parts.push(truncate(stdout.trimEnd()));
    if (stderr.trim()) parts.push(`[stderr]
${truncate(stderr.trimEnd())}`);
    if (exitCode !== 0) parts.push(`[exit code: ${exitCode}]`);
    const output = parts.join("\n") || "(no output)";
    return { output, isError: exitCode !== 0 };
  }
};

// src/tools/GrepTool.ts
import { readFile as readFile4, readdir as readdir2, stat as stat3 } from "fs/promises";
import { join as join3, resolve as resolve6, relative as relative5 } from "path";
var EXCLUDE_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv"]);
var MAX_RESULTS = 250;
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = join3(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}
function matchesGlob(filename, glob) {
  if (!glob) return true;
  if (glob.startsWith("*.")) {
    return filename.endsWith(glob.slice(1));
  }
  return filename.includes(glob.replace("*", ""));
}
var GrepTool = {
  definition: {
    name: "grep",
    description: "Search for a regex pattern across files in a directory. Returns matching file paths and line contents.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern to search for." },
        path: { type: "string", description: "Directory or file to search in. Defaults to current directory." },
        glob: { type: "string", description: 'File glob filter (e.g. "*.ts", "*.py"). Optional.' },
        case_insensitive: { type: "boolean", description: "Whether to search case-insensitively. Default false." },
        max_results: { type: "number", description: `Max results to return. Defaults to ${MAX_RESULTS}.` }
      },
      required: ["pattern"]
    }
  },
  async handler(args, signal) {
    const rawPattern = args["pattern"];
    if (typeof rawPattern !== "string" || !rawPattern) {
      return { output: "pattern is required.", isError: true };
    }
    const flags = args["case_insensitive"] === true ? "i" : "";
    let regex;
    try {
      regex = new RegExp(rawPattern, flags);
    } catch {
      return { output: `Invalid regex: ${rawPattern}`, isError: true };
    }
    const searchPath = typeof args["path"] === "string" ? resolve6(process.cwd(), args["path"]) : process.cwd();
    const glob = typeof args["glob"] === "string" ? args["glob"] : "";
    const maxResults = typeof args["max_results"] === "number" ? args["max_results"] : MAX_RESULTS;
    const results = [];
    try {
      const info = await stat3(searchPath);
      const filesToSearch = info.isFile() ? [searchPath] : [];
      if (!info.isFile()) {
        for await (const file of walk(searchPath)) {
          if (signal?.aborted) break;
          if (glob && !matchesGlob(file, glob)) continue;
          filesToSearch.push(file);
        }
      }
      for (const file of filesToSearch) {
        if (signal?.aborted) break;
        if (results.length >= maxResults) break;
        let text;
        try {
          text = await readFile4(file, "utf-8");
        } catch {
          continue;
        }
        const lines = text.split("\n");
        const relFile = relative5(process.cwd(), file);
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          if (regex.test(lines[i])) {
            results.push(`${relFile}:${i + 1}: ${lines[i]}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Grep error: ${msg}`, isError: true };
    }
    if (results.length === 0) {
      return { output: "No matches found.", isError: false };
    }
    const truncated = results.length >= maxResults;
    const header = `Found ${results.length} match${results.length === 1 ? "" : "es"}${truncated ? ` (showing first ${maxResults})` : ""}:`;
    return { output: `${header}
${results.join("\n")}`, isError: false };
  }
};

// src/tools/ListDirTool.ts
import { readdir as readdir3, stat as stat4 } from "fs/promises";
import { join as join4, resolve as resolve7, relative as relative6 } from "path";
var EXCLUDE_DIRS2 = /* @__PURE__ */ new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "coverage"]);
var MAX_DEPTH2 = 4;
var MAX_ENTRIES2 = 200;
async function buildTree(dir, depth, prefix, lines, count) {
  if (depth > MAX_DEPTH2 || count.n >= MAX_ENTRIES2) return;
  let entries;
  try {
    entries = await readdir3(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < entries.length; i++) {
    if (count.n >= MAX_ENTRIES2) {
      lines.push(`${prefix}\u2026 (more entries)`);
      break;
    }
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isLast ? prefix + "    " : prefix + "\u2502   ";
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS2.has(entry.name)) {
        lines.push(`${prefix}${connector}${entry.name}/ (excluded)`);
        count.n++;
        continue;
      }
      lines.push(`${prefix}${connector}${entry.name}/`);
      count.n++;
      await buildTree(join4(dir, entry.name), depth + 1, childPrefix, lines, count);
    } else {
      let size = "";
      try {
        const info = await stat4(join4(dir, entry.name));
        const kb = Math.round(info.size / 1024);
        size = kb > 0 ? ` (${kb}KB)` : "";
      } catch {
      }
      lines.push(`${prefix}${connector}${entry.name}${size}`);
      count.n++;
    }
  }
}
var ListDirTool = {
  definition: {
    name: "list_dir",
    description: "List the contents of a directory as a tree. Shows files and subdirectories up to 4 levels deep.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list. Defaults to current working directory." },
        depth: { type: "number", description: "Max depth to recurse (1\u20134). Default 3." }
      },
      required: []
    }
  },
  async handler(args, _signal) {
    const rawPath = typeof args["path"] === "string" ? args["path"] : ".";
    const absPath = resolve7(process.cwd(), rawPath);
    const relPath = relative6(process.cwd(), absPath) || ".";
    const lines = [`${relPath}/`];
    const count = { n: 0 };
    try {
      await buildTree(absPath, 1, "", lines, count);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Cannot list "${relPath}": ${msg}`, isError: true };
    }
    return {
      output: lines.join("\n"),
      isError: false
    };
  }
};

// src/screens/ChatScreen.tsx
import { exec as exec2 } from "child_process";
var SLASH_COMMANDS = {
  "/help": "Show available slash commands",
  "/clear": "Clear conversation history",
  "/model": "Show or switch model: /model gpt-4o",
  "/context": "Show what context was injected into the system prompt",
  "/cwd": "Show current working directory",
  "/tools": "List available tools",
  "/exit": "Exit chat and return to menu"
};
function uid() {
  return Math.random().toString(36).slice(2);
}
function getGitBranch() {
  return new Promise((resolve9) => {
    exec2("git rev-parse --abbrev-ref HEAD", { cwd: process.cwd(), timeout: 2e3 }, (err, stdout) => {
      resolve9(err ? "" : stdout.trim());
    });
  });
}
function ChatScreen({ onNavigate }) {
  const [messages, setMessages] = useState8([]);
  const [input, setInput] = useState8("");
  const [suggestions, setSuggestions] = useState8([]);
  const [isRunning, setIsRunning] = useState8(false);
  const [loading, setLoading] = useState8(true);
  const [model, setModel] = useState8(config3.defaultModel);
  const [branch, setBranch] = useState8("");
  const [systemPrompt, setSystemPrompt] = useState8(null);
  const abortRef = useRef2(null);
  const registryRef = useRef2(null);
  const loopRef = useRef2(null);
  const approvalCallbackRef = useRef2(/* @__PURE__ */ new Map());
  const addMessage = useCallback6((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);
  const updateLastAssistant = useCallback6((delta) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + delta }
        ];
      }
      return [
        ...prev,
        { id: uid(), kind: "assistant", content: delta, streaming: true }
      ];
    });
  }, []);
  const finalizeAssistant = useCallback6(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
  }, []);
  useEffect5(() => {
    const init = async () => {
      const [sp, br] = await Promise.all([
        buildSystemPrompt(process.cwd()).catch(() => ""),
        getGitBranch()
      ]);
      setSystemPrompt(sp);
      setBranch(br);
      if (!config3.openaiApiKey) {
        addMessage({
          id: uid(),
          kind: "error",
          content: "OPENAI_API_KEY is missing. Please add it to your .env file in the Major/ directory."
        });
      }
      const registry = new ToolRegistry();
      registry.register(ReadFileTool);
      registry.register(WriteFileTool);
      registry.register(EditFileTool);
      registry.register(BashTool);
      registry.register(GrepTool);
      registry.register(ListDirTool);
      registryRef.current = registry;
      const client = new LLMClient();
      loopRef.current = new AgentLoop(client, registry, sp);
      setLoading(false);
      addMessage({
        id: uid(),
        kind: "info",
        content: `Agent ready. Model: ${config3.defaultModel} \xB7 Tools: read_file, write_file, edit_file, bash, grep, list_dir
Type /help for commands. Esc or /exit to go back.`
      });
    };
    void init();
  }, [addMessage]);
  useEffect5(() => {
    if (!registryRef.current || systemPrompt === null) return;
    const client = new LLMClient();
    loopRef.current = new AgentLoop(client, registryRef.current, systemPrompt);
  }, [model]);
  const handleSlashCommand = useCallback6((cmd) => {
    const parts = cmd.trim().split(/\s+/);
    const base = parts[0]?.toLowerCase() ?? "";
    if (base === "/help") {
      const helpText = Object.entries(SLASH_COMMANDS).map(([c, d]) => `${c.padEnd(12)} \u2014 ${d}`).join("\n");
      addMessage({ id: uid(), kind: "info", content: helpText });
      return;
    }
    if (base === "/clear") {
      setMessages([{ id: uid(), kind: "info", content: "Conversation cleared." }]);
      loopRef.current?.clearHistory();
      return;
    }
    if (base === "/model") {
      if (parts[1]) {
        const newModel = parts[1];
        setModel(newModel);
        addMessage({ id: uid(), kind: "info", content: `Model switched to: ${newModel}` });
      } else {
        addMessage({ id: uid(), kind: "info", content: `Current model: ${model}` });
      }
      return;
    }
    if (base === "/context") {
      const preview = systemPrompt.slice(0, 1500);
      addMessage({ id: uid(), kind: "info", content: `System prompt preview:
${preview}${systemPrompt.length > 1500 ? "\n\u2026 (truncated)" : ""}` });
      return;
    }
    if (base === "/cwd") {
      addMessage({ id: uid(), kind: "info", content: `Working directory: ${process.cwd()}` });
      return;
    }
    if (base === "/tools") {
      const tools = registryRef.current?.getDefinitions().map((t) => `\u2022 ${t.name} \u2014 ${t.description.split("\n")[0]}`) ?? [];
      addMessage({ id: uid(), kind: "info", content: tools.join("\n") });
      return;
    }
    if (base === "/exit") {
      onNavigate({ type: "projects" });
      return;
    }
    addMessage({ id: uid(), kind: "error", content: `Unknown command: ${base}. Type /help for list.` });
  }, [model, systemPrompt, onNavigate, addMessage]);
  const handleAgentEvent = useCallback6((event, toolStatusMap) => {
    switch (event.type) {
      case "text":
        updateLastAssistant(event.delta);
        break;
      case "tool_start": {
        const msgId = uid();
        toolStatusMap.set(event.callId, msgId);
        addMessage({ id: msgId, kind: "tool_start", name: event.name, args: event.args, callId: event.callId });
        break;
      }
      case "tool_result": {
        const msgId = uid();
        addMessage({
          id: msgId,
          kind: "tool_done",
          name: event.name,
          callId: event.callId,
          output: event.output,
          isError: event.isError
        });
        break;
      }
      case "approval_needed":
        break;
      case "error":
        finalizeAssistant();
        addMessage({ id: uid(), kind: "error", content: event.error.message });
        break;
      case "done":
        finalizeAssistant();
        break;
    }
  }, [updateLastAssistant, addMessage, finalizeAssistant]);
  const runAgent = useCallback6(async (userInput) => {
    if (!loopRef.current) {
      addMessage({ id: uid(), kind: "error", content: "Agent not initialised yet. Wait a moment." });
      return;
    }
    addMessage({ id: uid(), kind: "user", content: userInput });
    setIsRunning(true);
    let finalInput = userInput;
    const matches = [...userInput.matchAll(/@(?:\[([^\]]+)\]|([^\s]+))/g)];
    if (matches.length > 0) {
      let extraContext = "\n\n[System: The user referenced the following paths via @mentions:]\n";
      const resolvedPaths = [];
      for (const match of matches) {
        const filePath = match[1] || match[2];
        if (!filePath) continue;
        try {
          const fullPath = path.resolve(process.cwd(), filePath);
          const stats = await fs.stat(fullPath);
          if (stats.isFile()) {
            const content = await fs.readFile(fullPath, "utf8");
            extraContext += `
--- ${filePath} ---
${content.slice(0, 1e4)}${content.length > 1e4 ? "\n... (truncated)" : ""}
`;
            resolvedPaths.push(filePath);
          } else if (stats.isDirectory()) {
            const files = await fs.readdir(fullPath);
            extraContext += `
--- Directory: ${filePath} ---
${files.join("\n")}
`;
            resolvedPaths.push(`${filePath}/`);
          }
        } catch (e) {
          extraContext += `
--- ${filePath} ---
(Could not read file or directory. It may not exist.)
`;
        }
      }
      finalInput += extraContext;
      if (resolvedPaths.length > 0) {
        addMessage({ id: uid(), kind: "info", content: `Attached context: ${resolvedPaths.join(", ")}` });
      }
    }
    const abort = new AbortController();
    abortRef.current = abort;
    const toolStatusMap = /* @__PURE__ */ new Map();
    try {
      for await (const event of loopRef.current.run(finalInput, {
        model,
        signal: abort.signal,
        onApproval: (name, args) => {
          return new Promise((resolve9) => {
            const callId = `approval-${uid()}`;
            addMessage({ id: callId, kind: "approval", name, args, callId, resolved: false });
            approvalCallbackRef.current.set(callId, resolve9);
          });
        }
      })) {
        if (abort.signal.aborted) break;
        handleAgentEvent(event, toolStatusMap);
      }
    } finally {
      finalizeAssistant();
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [model, addMessage, finalizeAssistant, handleAgentEvent]);
  useEffect5(() => {
    const match = input.match(/@([^\s]*)$/);
    if (match) {
      const query = match[1] ?? "";
      const dirPath = path.dirname(query);
      const baseName = path.basename(query);
      const isDirQuery = query.endsWith("/");
      const targetDir = dirPath === "." && !query.includes("/") && !isDirQuery ? process.cwd() : path.resolve(process.cwd(), isDirQuery ? query : dirPath);
      const searchBase = isDirQuery ? "" : baseName;
      fs.readdir(targetDir).then((files) => {
        const matches = files.filter((f) => f.toLowerCase().startsWith(searchBase.toLowerCase())).slice(0, 5);
        const formatted = matches.map((f) => {
          if (dirPath === "." && !query.includes("/") && !isDirQuery) return f;
          return path.join(isDirQuery ? query : dirPath, f).replace(/\\/g, "/");
        });
        setSuggestions(formatted);
      }).catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
  }, [input]);
  const handleSubmit = useCallback6((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput("");
    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed);
      return;
    }
    if (!isRunning) {
      void runAgent(trimmed);
    }
  }, [handleSlashCommand, isRunning, runAgent]);
  useInput7((_input, key) => {
    if (key.tab && suggestions.length > 0) {
      const lastAt = input.lastIndexOf("@");
      if (lastAt !== -1) {
        const completion = suggestions[0];
        setInput(input.substring(0, lastAt + 1) + completion + " ");
        setSuggestions([]);
      }
      return;
    }
    if (key.escape) {
      if (isRunning && abortRef.current) {
        abortRef.current.abort();
        addMessage({ id: uid(), kind: "info", content: "[Interrupted]" });
      } else {
        onNavigate({ type: "projects" });
      }
    }
  });
  const handleApproval = useCallback6((callId, approved) => {
    const resolve9 = approvalCallbackRef.current.get(callId);
    if (resolve9) {
      resolve9(approved);
      approvalCallbackRef.current.delete(callId);
    }
    setMessages(
      (prev) => prev.map((m) => m.kind === "approval" && m.callId === callId ? { ...m, resolved: true } : m)
    );
  }, []);
  if (loading) {
    return /* @__PURE__ */ React12.createElement(Box10, { paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React12.createElement(Spinner, { label: "Initialising agent context\u2026" }));
  }
  const cwd = process.cwd().replace(process.env["HOME"] ?? process.env["USERPROFILE"] ?? "", "~");
  const MAX_VISIBLE = 30;
  return /* @__PURE__ */ React12.createElement(Box10, { flexDirection: "column", minHeight: 20 }, /* @__PURE__ */ React12.createElement(Box10, { paddingX: 2, paddingY: 0, borderStyle: "round", borderColor: "cyan", flexDirection: "row", justifyContent: "space-between" }, /* @__PURE__ */ React12.createElement(Box10, null, /* @__PURE__ */ React12.createElement(Text12, { bold: true, color: "cyan" }, "\u25C8 AgentiX"), /* @__PURE__ */ React12.createElement(Text12, { dimColor: true }, "  \xB7  ", model), /* @__PURE__ */ React12.createElement(Text12, { dimColor: true }, "  \xB7  ", isRunning ? "\u25CF running" : "\u25CB ready")), /* @__PURE__ */ React12.createElement(Box10, null, /* @__PURE__ */ React12.createElement(Text12, { dimColor: true }, cwd), branch ? /* @__PURE__ */ React12.createElement(Text12, { color: "green" }, "  [", branch, "]") : null)), /* @__PURE__ */ React12.createElement(Box10, { flexDirection: "column", paddingX: 2, flexGrow: 1 }, messages.slice(-MAX_VISIBLE).map((msg) => {
    switch (msg.kind) {
      case "user":
        return /* @__PURE__ */ React12.createElement(MessageBubble, { key: msg.id, role: "user", content: msg.content });
      case "assistant":
        return /* @__PURE__ */ React12.createElement(Box10, { key: msg.id, flexDirection: "column" }, /* @__PURE__ */ React12.createElement(MessageBubble, { role: "assistant", content: msg.content }), msg.streaming ? /* @__PURE__ */ React12.createElement(Spinner, null) : null);
      case "tool_start":
        return /* @__PURE__ */ React12.createElement(Box10, { key: msg.id, marginLeft: 4, marginTop: 0 }, /* @__PURE__ */ React12.createElement(ToolCallLine, { name: msg.name, args: msg.args, status: "running" }));
      case "tool_done":
        return /* @__PURE__ */ React12.createElement(Box10, { key: msg.id, marginLeft: 4 }, /* @__PURE__ */ React12.createElement(
          ToolCallLine,
          {
            name: msg.name,
            args: "",
            status: msg.isError ? "error" : "done",
            output: msg.isError ? msg.output : void 0
          }
        ));
      case "approval":
        if (msg.resolved) return null;
        return /* @__PURE__ */ React12.createElement(
          ApprovalPrompt,
          {
            key: msg.id,
            toolName: msg.name,
            args: msg.args,
            onDecision: (approved) => handleApproval(msg.callId, approved)
          }
        );
      case "error":
        return /* @__PURE__ */ React12.createElement(Box10, { key: msg.id, marginTop: 1 }, /* @__PURE__ */ React12.createElement(Text12, { color: "red" }, "\u2717 ", msg.content));
      case "info":
        return /* @__PURE__ */ React12.createElement(Box10, { key: msg.id, marginTop: 1, marginLeft: 2, flexDirection: "column" }, msg.content.split("\n").map((line, i) => /* @__PURE__ */ React12.createElement(Text12, { key: i, dimColor: true }, line)));
      default:
        return null;
    }
  })), suggestions.length > 0 && /* @__PURE__ */ React12.createElement(Box10, { paddingX: 2, paddingY: 0 }, /* @__PURE__ */ React12.createElement(Text12, { dimColor: true }, "Suggestions (Tab): "), /* @__PURE__ */ React12.createElement(Text12, { color: "green" }, suggestions.join("  "))), /* @__PURE__ */ React12.createElement(Box10, { paddingX: 2, paddingY: 0, borderStyle: "round", borderColor: isRunning ? "yellow" : "cyan" }, /* @__PURE__ */ React12.createElement(Text12, { color: isRunning ? "yellow" : "cyan" }, "> "), /* @__PURE__ */ React12.createElement(
    TextInput3,
    {
      value: input,
      onChange: setInput,
      onSubmit: handleSubmit,
      focus: !isRunning,
      placeholder: isRunning ? "Running\u2026 (Esc to interrupt)" : "Ask me anything about your code\u2026"
    }
  )), /* @__PURE__ */ React12.createElement(Box10, { paddingX: 2 }, /* @__PURE__ */ React12.createElement(Text12, { dimColor: true }, isRunning ? "Esc: interrupt" : "/help  /clear  /model  /context  /tools  Esc: menu")));
}

// src/components/StatusLine.tsx
import React13 from "react";
import { Box as Box11, Text as Text13, useStdout } from "ink";
var HINTS = {
  splash: "",
  login: "Tab to switch field \xB7 Enter to submit",
  projects: "c  chat agent \xB7 n  new project \xB7 Enter  open \xB7 ?  help \xB7 q  quit",
  pipelines: "n  new pipeline \xB7 Enter  watch \xB7 Esc  back \xB7 q  quit",
  "new-pipeline": "Tab  next field \xB7 Enter  confirm \xB7 Esc  cancel",
  watch: "q  back",
  help: "Esc  back",
  chat: "Esc  menu \xB7 /help  commands \xB7 /clear  reset"
};
function StatusLine({ screen, userEmail, error }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const hint = HINTS[screen.type] ?? "";
  const user = userEmail ? ` ${userEmail} ` : "";
  const pad = Math.max(0, cols - hint.length - user.length - 4);
  if (error) {
    return /* @__PURE__ */ React13.createElement(Box11, { borderStyle: "single", borderColor: "red", paddingX: 1 }, /* @__PURE__ */ React13.createElement(Text13, { color: "red" }, "\u2715 ", error));
  }
  return /* @__PURE__ */ React13.createElement(Box11, { paddingX: 1 }, /* @__PURE__ */ React13.createElement(Text13, { dimColor: true }, hint), /* @__PURE__ */ React13.createElement(Text13, null, " ".repeat(pad)), userEmail && /* @__PURE__ */ React13.createElement(Text13, { color: "magenta" }, user));
}

// src/App.tsx
function App() {
  const [screen, setScreen] = useState9({ type: "splash" });
  const [userEmail, setUserEmail] = useState9();
  const [error, setError] = useState9(null);
  useEffect6(() => {
    const autoLogin = async () => {
      const e = process.env["MULTI_AGENT_EMAIL"];
      const p = process.env["MULTI_AGENT_PASSWORD"];
      if (e && p) {
        try {
          await login(e, p);
          setUserEmail(e);
          setScreen({ type: "projects" });
        } catch (err) {
          setScreen({ type: "login" });
          setError(`Auto-login failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        setScreen({ type: "login" });
      }
    };
    void checkHealth().then((ok) => {
      if (!ok) {
        setError("Cannot reach backend server. Some features may be disabled.");
        setScreen({ type: "login" });
      } else {
        void autoLogin();
      }
    });
  }, []);
  const handleNavigate = (s) => {
    setError(null);
    setScreen(s);
  };
  const renderScreen = () => {
    switch (screen.type) {
      case "splash":
        return /* @__PURE__ */ React14.createElement(Box12, { paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React14.createElement(Text14, null, "Loading AgentiX Platform..."));
      case "login":
        return /* @__PURE__ */ React14.createElement(
          LoginScreen,
          {
            onSuccess: (email) => {
              setUserEmail(email);
              setError(null);
              setScreen({ type: "projects" });
            },
            onChat: () => handleNavigate({ type: "chat" }),
            onError: setError
          }
        );
      case "projects":
        return /* @__PURE__ */ React14.createElement(ProjectsScreen, { onNavigate: handleNavigate, onError: setError });
      case "pipelines":
        return /* @__PURE__ */ React14.createElement(PipelinesScreen, { projectId: screen.projectId, projectName: screen.projectName, onNavigate: handleNavigate, onError: setError });
      case "new-pipeline":
        return /* @__PURE__ */ React14.createElement(NewPipelineScreen, { projectId: screen.projectId, projectName: screen.projectName, onNavigate: handleNavigate, onError: setError });
      case "watch":
        return /* @__PURE__ */ React14.createElement(WatchScreen, { pipelineId: screen.pipelineId, onNavigate: handleNavigate, onError: setError });
      case "chat":
        return /* @__PURE__ */ React14.createElement(ChatScreen, { onNavigate: handleNavigate });
      case "help":
        return /* @__PURE__ */ React14.createElement(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1 }, /* @__PURE__ */ React14.createElement(Text14, { bold: true, color: "magenta" }, "AgentiX Platform CLI"), /* @__PURE__ */ React14.createElement(Text14, { dimColor: true }, "Version 1.0.0"), /* @__PURE__ */ React14.createElement(Box12, { marginTop: 1, flexDirection: "column" }, /* @__PURE__ */ React14.createElement(Text14, null, "The CLI allows you to start and monitor engineering pipelines."), /* @__PURE__ */ React14.createElement(Text14, null, "Most commands use standard VIM bindings (j/k) or Arrow Keys.")), /* @__PURE__ */ React14.createElement(Box12, { marginTop: 1 }, /* @__PURE__ */ React14.createElement(Text14, { dimColor: true }, "Esc to go back")));
    }
  };
  return /* @__PURE__ */ React14.createElement(Box12, { flexDirection: "column", minHeight: 15 }, /* @__PURE__ */ React14.createElement(Box12, { flexGrow: 1 }, renderScreen()), /* @__PURE__ */ React14.createElement(StatusLine, { screen, userEmail, error }));
}

// src/index.tsx
console.clear();
var { waitUntilExit } = render(/* @__PURE__ */ React15.createElement(App, null));
waitUntilExit().catch(console.error);
