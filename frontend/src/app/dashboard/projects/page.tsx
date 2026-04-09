"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { projectsApi, type Project } from "@/lib/api";
import {
  Plus,
  FolderOpen,
  GitBranch,
  Clock,
  X,
  AlertCircle,
} from "lucide-react";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    projectsApi
      .list()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const newProject = await projectsApi.create(name, description);
      setProjects([newProject, ...projects]);
      setShowCreate(false);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">
            Manage your autonomous engineering projects
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus size={16} strokeWidth={2.5} />
            New Project
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 className="modal-title">Create Project</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCreate(false)}
                style={{ padding: "4px 8px" }}
              >
                <X size={16} />
              </button>
            </div>
            <p className="modal-description">
              Start a new project to organize your AI-powered development pipelines.
            </p>
            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                fontSize: "0.82rem", marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
                background: "var(--error-bg)", color: "var(--error)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will this project build?"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || !name.trim()}
                >
                  {creating ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div className="card-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <FolderOpen size={36} strokeWidth={1.2} />
            </div>
            <div className="empty-state-title">No projects yet</div>
            <div className="empty-state-text">
              Create your first project to start generating production-ready code with AI agents.
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Create Your First Project
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {projects.map((project, idx) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className={`card card-interactive stagger-${Math.min(idx + 1, 4)}`}>
                <div className="card-header">
                  <h3 className="card-title">{project.name}</h3>
                  <span className="badge badge-completed" style={{ fontSize: "0.7rem" }}>
                    {project.pipeline_count || 0} pipelines
                  </span>
                </div>
                {project.description && (
                  <p className="card-description">
                    {project.description.length > 120
                      ? `${project.description.substring(0, 120)}...`
                      : project.description}
                  </p>
                )}
                <div className="card-meta">
                  <span className="card-meta-item">
                    <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                    {timeAgo(project.created_at)}
                  </span>
                  <span className="card-meta-item">
                    <GitBranch size={12} style={{ display: "inline", marginRight: 4 }} />
                    {project.pipeline_count || 0} runs
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
