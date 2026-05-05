"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  projectsApi,
  pipelinesApi,
  githubApi,
  type Project,
  type PipelineListItem,
  type GitHubStatus,
} from "@/lib/api";
import {
  Wrench,
  CheckCircle2,
  Zap,
  Plus,
  ChevronRight,
  AlertCircle,
  CircleDot,
  ArrowRight,
  Brain,
  Rocket,
  X,
  Trash2,
} from "lucide-react";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New pipeline form
  const [showForm, setShowForm] = useState(false);
  const [requirement, setRequirement] = useState("");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("planning");
  const [creating, setCreating] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  // GitHub status
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [proj, pipes] = await Promise.all([
          projectsApi.get(id),
          pipelinesApi.listByProject(id),
        ]);
        setProject(proj);
        setPipelines(pipes);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
    githubApi.status().then(setGhStatus).catch(() => {});
  }, [id]);

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const pipe = await pipelinesApi.create({
        project_id: id,
        requirement,
        llm_provider: provider,
        llm_model: model || undefined,
        mode,
      });
      setPipelines([pipe, ...pipelines]);
      setShowForm(false);
      setRequirement("");
    } catch { /* ignore */ }
    setCreating(false);
  };

  const formatCreatedAt = (date: string) => new Date(date).toLocaleString();

  if (loading) {
    return (
      <div className="animate-in">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-text" style={{ width: "50%" }} />
        <div style={{ marginTop: 32 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="animate-in">
        <div className="empty-state">
          <div className="empty-state-icon">
            <AlertCircle size={36} strokeWidth={1.2} />
          </div>
          <div className="empty-state-title">Project not found</div>
          <Link href="/dashboard/projects" className="btn btn-primary btn-sm">
            Back to Projects
          </Link>
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
        <Link href="/dashboard/projects">Projects</Link>
        <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
        <span style={{ color: "var(--text-secondary)" }}>{project.name}</span>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">{project.description || "No description"}</p>
        </div>
        <div className="page-actions">
          {ghStatus?.connected && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
              GitHub connected
            </span>
          )}
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} strokeWidth={2.5} />
            New Pipeline
          </button>
          <button className="btn btn-danger" style={{ background: "transparent", border: "1px solid var(--error)", color: "var(--error)" }} onClick={() => setShowDelete(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete Project</h2>
            <p className="modal-description">
              This action cannot be undone. To confirm, type <strong>delete</strong> below.
            </p>
            <div className="form-group">
              <input
                className="form-input"
                value={deleteKeyword}
                onChange={(e) => setDeleteKeyword(e.target.value)}
                placeholder="delete"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={deleteKeyword !== "delete" || deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await projectsApi.delete(id);
                    router.push("/dashboard/projects");
                  } catch (e) {
                    console.error(e);
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-card hover-lift">
          <div className="stat-icon blue">
            <Wrench size={20} />
          </div>
          <div className="stat-value">{pipelines.length}</div>
          <div className="stat-label">Total Pipelines</div>
        </div>
        <div className="stat-card hover-lift">
          <div className="stat-icon green">
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-value">
            {pipelines.filter((p) => p.status === "completed").length}
          </div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card hover-lift">
          <div className="stat-icon amber">
            <Zap size={20} />
          </div>
          <div className="stat-value">
            {pipelines.filter((p) => p.status === "running").length}
          </div>
          <div className="stat-label">Active</div>
        </div>
      </div>

      {/* Create Pipeline Form */}
      {showForm && (
        <div className="push-panel" style={{ marginBottom: 24 }}>
          <div className="push-panel-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={16} />
              New Pipeline
            </span>
            <button className="btn btn-ghost btn-sm" style={{ padding: "4px 8px" }} onClick={() => setShowForm(false)}>
              <X size={14} />
            </button>
          </div>
          <form onSubmit={handleCreatePipeline}>
            <div className="form-group">
              <label className="form-label">Requirement</label>
              <textarea
                className="form-textarea"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="Describe what you want to build. Be specific about features, tech stack, and constraints..."
                rows={4}
                required
              />
              <div className="form-hint">
                The more detailed your requirement, the better the generated code will be.
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">LLM Provider</label>
                <select
                  className="form-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="openai">OpenAI (GPT-4)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="google">Google (Gemini)</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Model (optional)</label>
                <input
                  className="form-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gpt-4o, claude-3.5-sonnet"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Execution Mode</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setMode("planning")}
                  className={`mode-card ${mode === "planning" ? "active" : ""}`}
                >
                  <Brain size={18} strokeWidth={1.5} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Planning Mode</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Coordinator plans first</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("fast")}
                  className={`mode-card ${mode === "fast" ? "active" : ""}`}
                >
                  <Rocket size={18} strokeWidth={1.5} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Fast Mode</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Direct implementation</div>
                  </div>
                </button>
              </div>
              <div className="form-hint">
                Fast mode skips the task breakdown and sends the goal directly to the agents simultaneously.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || !requirement.trim()}
              >
                {creating ? (
                  <>
                    <CircleDot size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Starting...
                  </>
                ) : (
                  <>
                    <Rocket size={14} />
                    Start Pipeline
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pipelines Table */}
      {pipelines.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Zap size={36} strokeWidth={1.2} />
            </div>
            <div className="empty-state-title">No pipelines yet</div>
            <div className="empty-state-text">
              Start your first autonomous pipeline to generate production-ready code.
            </div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Start First Pipeline
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((pipe) => (
                <tr key={pipe.id}>
                  <td>
                    <div style={{ maxWidth: 350 }}>
                      <span style={{ fontWeight: 500 }}>
                        {pipe.requirement.length > 70
                          ? `${pipe.requirement.substring(0, 70)}...`
                          : pipe.requirement}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {pipe.llm_provider}
                      {pipe.llm_model ? ` / ${pipe.llm_model}` : ""}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${pipe.status}`}>
                      <span className="badge-dot" />
                      {pipe.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {formatCreatedAt(pipe.created_at)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/pipeline/${pipe.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      View <ArrowRight size={12} style={{ display: "inline" }} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
