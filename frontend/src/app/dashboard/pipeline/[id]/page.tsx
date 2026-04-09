"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import {
  pipelinesApi,
  artifactsApi,
  githubApi,
  type Pipeline,
  type Artifact,
  type GitHubRepo,
  type GitHubStatus,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  ClipboardList,
  Layers,
  FileCode2,
  Code2,
  TestTube2,
  Rocket,
  ChevronRight,
  GitBranch,
  UploadCloud,
  XCircle,
  CheckCircle2,
  Loader2,
  CircleDot,
  AlertTriangle,
  Package,
  ArrowUpRight,
  File,
  FileText,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

interface PipelineEvent {
  event_type: string;
  message?: string;
  stage?: string;
  created_at?: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
}

const AGENT_STAGES = [
  { key: "requirements", icon: ClipboardList, label: "Requirements" },
  { key: "architecture", icon: Layers, label: "Architecture" },
  { key: "task_breakdown", icon: FileCode2, label: "Tasks" },
  { key: "implementation", icon: Code2, label: "Code" },
  { key: "review", icon: TestTube2, label: "Review" },
  { key: "deployment", icon: Rocket, label: "Deploy" },
];

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml", css: "css",
    html: "html", sh: "bash", sql: "sql", env: "bash", txt: "text",
  };
  return map[ext] || "text";
}

function parseArtifactFiles(content: unknown): GeneratedFile[] {
  if (!content) return [];
  if (typeof content === "string") {
    return [{ path: "output.txt", content, language: "text" }];
  }
  if (typeof content === "object" && content !== null) {
    const c = content as Record<string, unknown>;
    // Handle { files: [{path, content}] } format
    if (Array.isArray(c.files)) {
      return (c.files as Array<{ path?: string; content?: string }>).map((f, i) => ({
        path: f.path || `file_${i}`,
        content: typeof f.content === "string" ? f.content : JSON.stringify(f.content, null, 2),
        language: inferLanguage(f.path || ""),
      }));
    }
    // Handle { path: content } flat map
    const entries = Object.entries(c);
    if (entries.length > 0 && typeof entries[0][1] === "string") {
      return entries.map(([path, content]) => ({
        path,
        content: content as string,
        language: inferLanguage(path),
      }));
    }
    // Fallback: stringify the whole thing
    return [{ path: "artifact.json", content: JSON.stringify(content, null, 2), language: "json" }];
  }
  return [];
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 14px", background: "rgba(0,0,0,0.25)",
        borderBottom: "1px solid var(--border)", borderRadius: "var(--radius-md) var(--radius-md) 0 0",
      }}>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
          {language}
        </span>
        <button
          onClick={handleCopy}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem" }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: "16px", overflow: "auto", maxHeight: 480,
        fontSize: "0.8rem", lineHeight: 1.65, color: "var(--text-secondary)",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        background: "transparent", borderRadius: "0 0 var(--radius-md) var(--radius-md)",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ArtifactViewer({ artifacts, activeTab, onTabChange }: {
  artifacts: Artifact[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const activeArtifact = artifacts.find((a) => a.stage_name === activeTab);
  const files = activeArtifact ? parseArtifactFiles(activeArtifact.content) : [];
  const selectedFilePath =
    activeFile && files.some((file) => file.path === activeFile)
      ? activeFile
      : (files[0]?.path ?? null);
  const currentFile = files.find((file) => file.path === selectedFilePath);

  const getFileIcon = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (["ts", "tsx", "js", "jsx"].includes(ext)) return <FileCode2 size={13} />;
    if (ext === "md") return <FileText size={13} />;
    return <File size={13} />;
  };

  if (artifacts.length === 0) return null;

  return (
    <div className="artifact-viewer" style={{ display: "flex", flexDirection: "column" }}>
      {/* Stage Tabs */}
      <div className="artifact-tabs" style={{ flexShrink: 0 }}>
        {artifacts.map((a) => (
          <div
            key={a.id}
            className={`artifact-tab ${activeTab === a.stage_name ? "active" : ""}`}
            onClick={() => { onTabChange(a.stage_name); setActiveFile(null); }}
          >
            {a.stage_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: 4 }}>
              v{a.version}
            </span>
          </div>
        ))}
      </div>

      {/* Split: File Tree + Code Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", flex: 1, minHeight: 0 }}>
        {/* File Tree */}
        <div style={{
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "8px 0",
          background: "rgba(0,0,0,0.1)",
        }}>
          {files.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              No files
            </div>
          ) : (
            files.map((file) => (
              <button
                key={file.path}
                onClick={() => setActiveFile(file.path)}
                style={{
                  width: "100%", textAlign: "left" as const, border: "none",
                  cursor: "pointer", padding: "6px 14px", display: "flex", alignItems: "center", gap: 7,
                  fontSize: "0.74rem", color: selectedFilePath === file.path ? "var(--accent-primary)" : "var(--text-secondary)",
                  background: selectedFilePath === file.path ? "rgba(99,102,241,0.1)" : "transparent",
                  borderLeft: selectedFilePath === file.path ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  fontFamily: "monospace",
                }}
              >
                {getFileIcon(file.path)}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.path.split("/").pop() || file.path}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Code Panel */}
        <div className="artifact-content" style={{ overflow: "auto", padding: 0 }}>
          {currentFile ? (
            <CodeBlock code={currentFile.content} language={currentFile.language || "text"} />
          ) : (
            <div style={{ padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Select a file to view its content
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // GitHub state
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [showPush, setShowPush] = useState(false);
  const [pushRepo, setPushRepo] = useState("");
  const [pushBranch, setPushBranch] = useState("agent/auto-generated");
  const [pushMessage, setPushMessage] = useState("feat: auto-generated by Multi-Agent Pipeline");
  const [createPR, setCreatePR] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Initial data fetch
  useEffect(() => {
    pipelinesApi.get(id).then(setPipeline).catch(() => {});
    artifactsApi
      .listByPipeline(id)
      .then((a) => {
        setArtifacts(a);
        if (a.length > 0) {
          setActiveTab((previous) => previous || a[0].stage_name);
        }
      })
      .catch(() => {});
    githubApi.status().then(setGhStatus).catch(() => {});
  }, [id]);

  // Supabase Realtime — pipeline_events
  useEffect(() => {
    const channel = supabase
      .channel(`pipeline-events-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pipeline_events",
          filter: `pipeline_id=eq.${id}`,
        },
        (payload) => {
          const newEvent = payload.new as PipelineEvent;
          setEvents((prev) => [...prev, newEvent]);

          if (
            newEvent.event_type === "stage_completed" ||
            newEvent.event_type === "pipeline_completed" ||
            newEvent.event_type === "pipeline_failed"
          ) {
            pipelinesApi.get(id).then(setPipeline).catch(() => {});
            artifactsApi.listByPipeline(id).then((a) => {
              setArtifacts(a);
              if (a.length > 0) {
                setActiveTab((previous) => previous || a[0].stage_name);
              }
            }).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Pipeline status changes
  useEffect(() => {
    const channel = supabase
      .channel(`pipeline-status-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pipelines", filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new;
          setPipeline((prev) =>
            prev ? { ...prev, status: updated.status, completed_at: updated.completed_at } : prev
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Load repos when showing push panel
  useEffect(() => {
    if (showPush && ghStatus?.connected && ghRepos.length === 0) {
      githubApi.repos().then(setGhRepos).catch(() => {});
    }
  }, [showPush, ghStatus, ghRepos.length]);

  const handlePush = async () => {
    if (!pushRepo) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result = await githubApi.push({
        repo_full_name: pushRepo,
        pipeline_id: id,
        branch: pushBranch || undefined,
        commit_message: pushMessage,
        create_pr: createPR,
      });
      setPushResult({
        ok: true,
        msg: `Pushed ${result.commit.files_pushed} files successfully!` +
          (result.pull_request?.url ? `\nPR: ${result.pull_request.url}` : ""),
      });
    } catch (err) {
      setPushResult({ ok: false, msg: `Push failed: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setPushing(false);
    }
  };

  const getEventIcon = (type: string) => {
    const map: Record<string, React.ReactNode> = {
      pipeline_started: <Rocket size={13} />,
      stage_started: <CircleDot size={13} />,
      stage_completed: <CheckCircle2 size={13} style={{ color: "var(--success)" }} />,
      stage_failed: <XCircle size={13} style={{ color: "var(--error)" }} />,
      critic_iteration: <RefreshCw size={13} />,
      pipeline_completed: <CheckCircle2 size={13} style={{ color: "var(--success)" }} />,
      pipeline_failed: <AlertTriangle size={13} style={{ color: "var(--error)" }} />,
      pipeline_cancelled: <XCircle size={13} />,
      log: <FileText size={13} />,
      artifact_produced: <Package size={13} />,
      code_pushed: <UploadCloud size={13} />,
    };
    return map[type] || <CircleDot size={13} />;
  };

  const getStageStatus = (stageKey: string) => {
    const stage = pipeline?.stages.find((s) => s.stage_name === stageKey);
    return stage?.status || "pending";
  };

  if (!pipeline) {
    return (
      <div className="animate-in">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-text" style={{ width: "60%" }} />
        <div style={{ marginTop: 32 }}>
          <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-lg)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link href="/dashboard">Dashboard</Link>
        <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
        <Link href={`/dashboard/projects/${pipeline.project_id}`}>Project</Link>
        <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
        <span style={{ color: "var(--text-secondary)" }}>Pipeline</span>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Pipeline Monitor</h1>
          <p className="page-subtitle">{pipeline.requirement}</p>
        </div>
        <div className="page-actions">
          <span className={`badge badge-${pipeline.status}`}>
            <span className="badge-dot" />
            {pipeline.status}
          </span>
          {pipeline.status === "running" && (
            <button className="btn btn-danger btn-sm" onClick={() => pipelinesApi.cancel(id)}>
              <XCircle size={14} />
              Cancel
            </button>
          )}
          {pipeline.status === "completed" && ghStatus?.connected && (
            <button className="btn btn-success btn-sm" onClick={() => setShowPush(!showPush)}>
              <UploadCloud size={14} />
              Push to GitHub
            </button>
          )}
        </div>
      </div>

      {/* Agent Flow */}
      <div className="card" style={{ marginBottom: 24, padding: "16px 24px" }}>
        <div className="agent-flow">
          {AGENT_STAGES.map((agent, idx, arr) => {
            const status = getStageStatus(agent.key);
            const Icon = agent.icon;
            return (
              <div key={agent.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  className={`agent-node ${status}`}
                  onClick={() => {
                    const a = artifacts.find((art) => art.stage_name === agent.key);
                    if (a) setActiveTab(agent.key);
                  }}
                >
                  <div className="agent-node-icon">
                    {status === "running" ? (
                      <Loader2 size={18} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Icon size={18} strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="agent-node-label">{agent.label}</div>
                </div>
                {idx < arr.length - 1 && (
                  <div className={`agent-arrow ${status === "completed" ? "active" : ""}`}>
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* GitHub Push Panel */}
      {showPush && (
        <div className="push-panel" style={{ marginBottom: 24 }}>
          <div className="push-panel-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GitBranch size={16} />
              Push to GitHub
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPush(false)} style={{ padding: "4px 8px" }}>
              <XCircle size={14} />
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Repository</label>
            <select
              className="form-select"
              value={pushRepo}
              onChange={(e) => setPushRepo(e.target.value)}
            >
              <option value="">Select a repository...</option>
              {ghRepos.map((repo) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name} {repo.private ? "(private)" : "(public)"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Branch</label>
              <input
                className="form-input"
                value={pushBranch}
                onChange={(e) => setPushBranch(e.target.value)}
                placeholder="agent/auto-generated"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Commit Message</label>
              <input
                className="form-input"
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              className={`toggle ${createPR ? "active" : ""}`}
              onClick={() => setCreatePR(!createPR)}
            />
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Create Pull Request
            </span>
          </div>

          {pushResult && (
            <div style={{
              padding: "10px 14px", borderRadius: "var(--radius-sm)",
              fontSize: "0.82rem", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 8,
              background: pushResult.ok ? "var(--success-bg)" : "var(--error-bg)",
              color: pushResult.ok ? "var(--success)" : "var(--error)",
              border: `1px solid ${pushResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}>
              {pushResult.ok ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span style={{ whiteSpace: "pre-line" }}>{pushResult.msg}</span>
              {pushResult.msg.includes("PR:") && (
                <a
                  href={pushResult.msg.split("PR: ")[1]}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 2 }}
                >
                  <ArrowUpRight size={12} />
                </a>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPush(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePush}
              disabled={!pushRepo || pushing}
            >
              {pushing ? (
                <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Pushing...</>
              ) : (
                <><UploadCloud size={13} /> Push Code</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Timeline + Content */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
        {/* Timeline */}
        <div className="card" style={{ padding: 20, alignSelf: "start" }}>
          <h3 className="card-title" style={{ marginBottom: 16, fontSize: "0.85rem" }}>
            Stage Timeline
          </h3>
          <div className="timeline">
            {AGENT_STAGES.map((agent, idx) => {
              const status = getStageStatus(agent.key);
              const stage = pipeline.stages.find((s) => s.stage_name === agent.key);
              const Icon = agent.icon;
              return (
                <div className="timeline-item" key={agent.key}>
                  <div className="timeline-marker">
                    <div className={`timeline-dot ${status}`}>
                      {status === "running" ? (
                        <Loader2 size={10} style={{ animation: "spin 1s linear infinite", color: "var(--accent-primary)" }} />
                      ) : status === "completed" ? (
                        <CheckCircle2 size={10} style={{ color: "var(--success)" }} />
                      ) : status === "failed" ? (
                        <XCircle size={10} style={{ color: "var(--error)" }} />
                      ) : null}
                    </div>
                    {idx < AGENT_STAGES.length - 1 && <div className="timeline-line" />}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon size={12} strokeWidth={1.5} />
                      {agent.label}
                    </div>
                    <div className="timeline-meta">
                      {stage ? `Iteration ${stage.iteration} · ${stage.status}` : "Pending"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Artifact Viewer */}
          <ArtifactViewer
            artifacts={artifacts}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {/* Live Log */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <h3 className="card-title" style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                Live Events
                {pipeline.status === "running" && (
                  <span style={{
                    display: "inline-block", width: 7, height: 7,
                    borderRadius: "50%", background: "var(--success)",
                    animation: "pulse-glow 1.5s infinite",
                  }} />
                )}
              </h3>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {events.length} events
              </span>
            </div>
            <div className="log-stream">
              {events.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                  {pipeline.status === "running" ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      Waiting for events...
                    </span>
                  ) : "No events recorded"}
                </div>
              ) : (
                events.map((event, idx) => (
                  <div className="log-line" key={idx}>
                    <span className="log-icon">{getEventIcon(event.event_type)}</span>
                    <span className="log-msg">{event.message || event.event_type}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
