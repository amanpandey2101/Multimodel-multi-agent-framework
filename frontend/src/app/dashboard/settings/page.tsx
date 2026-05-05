"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { githubApi, type GitHubStatus, type GitHubRepo } from "@/lib/api";
import {
  GitBranch,
  Bot,
  XCircle,
  RefreshCw,
  ExternalLink,
  Lock,
  Globe,
  Star,
  CheckCheck,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghToken, setGhToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [showRepos, setShowRepos] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Provider settings (local state)
  const [provider, setProvider] = useState("openai");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");

  useEffect(() => {
    githubApi.status().then(setGhStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const github = searchParams.get("github");
    if (!github) return;

    const username = searchParams.get("username");
    const message = searchParams.get("message");

    if (github === "connected") {
      githubApi.status().then(setGhStatus).catch(() => {});
      setToast(username ? `Connected as @${username}` : "GitHub connected");
      setTimeout(() => setToast(""), 4000);
    } else if (github === "error") {
      setError(message || "GitHub connection failed");
    }

    router.replace("/dashboard/settings");
  }, [router, searchParams]);

  const handleConnectGithub = async () => {
    if (!ghToken.trim()) return;
    setConnecting(true);
    setError("");
    try {
      const result = await githubApi.connect(ghToken);
      setGhStatus({ connected: true, github_username: result.github_username });
      setGhToken("");
      setToast(`Connected as @${result.github_username}`);
      setTimeout(() => setToast(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await githubApi.disconnect();
      setGhStatus({ connected: false });
      setGhRepos([]);
      setShowRepos(false);
    } catch { /* ignore */ }
  };

  const handleLoadRepos = async () => {
    setLoadingRepos(true);
    try {
      const repos = await githubApi.repos();
      setGhRepos(repos);
      setShowRepos(true);
    } catch { /* ignore */ }
    setLoadingRepos(false);
  };

  const handleConnectGithubOAuth = async () => {
    setConnecting(true);
    setError("");
    try {
      const { authorization_url } = await githubApi.oauthUrl("/dashboard/settings");
      window.location.href = authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start GitHub OAuth");
      setConnecting(false);
    }
  };

  const langColor: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572a5",
    Go: "#00add8",
    Rust: "#dea584",
    Java: "#b07219",
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Configure GitHub integration and LLM providers
          </p>
        </div>
      </div>

      {/* GitHub Integration */}
      <div className="card" style={{ marginBottom: 24, padding: 0 }}>
        <div className="github-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <GitBranch size={22} strokeWidth={1.5} style={{ color: "var(--text-primary)" }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>GitHub</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Push generated code directly to repositories
              </div>
            </div>
          </div>
          <div className="github-status">
            <div className={`github-status-dot ${ghStatus?.connected ? "connected" : "disconnected"}`} />
            <span style={{ color: ghStatus?.connected ? "var(--success)" : "var(--text-muted)" }}>
              {ghStatus?.connected ? `@${ghStatus.github_username}` : "Not connected"}
            </span>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {!ghStatus?.connected ? (
            <>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                Connect your GitHub account to push pipeline-generated code directly to your repositories.
                OAuth is the default flow. Personal access token entry remains available as a fallback.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleConnectGithubOAuth}
                  disabled={connecting}
                >
                  <GitBranch size={14} />
                  {connecting ? "Redirecting..." : "Connect with GitHub"}
                </button>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                If you prefer a token, generate a Personal Access Token at{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-secondary)" }}
                >
                  github.com/settings/tokens
                </a>{" "}
                with the <code style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4, fontSize: "0.8rem" }}>repo</code> scope.
              </p>
              {error && (
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--error-bg)", color: "var(--error)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}>
                  <XCircle size={14} />
                  {error}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="form-input"
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleConnectGithub}
                  disabled={connecting || !ghToken.trim()}
                >
                  {connecting ? "Connecting..." : "Connect"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleLoadRepos}
                  disabled={loadingRepos}
                >
                  {loadingRepos ? (
                    <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Loading...</>
                  ) : (
                    <><GitBranch size={13} /> View Repos</>
                  )}
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDisconnect}>
                  <XCircle size={13} />
                  Disconnect
                </button>
              </div>

              {showRepos && (
                <div className="github-repo-list" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  {ghRepos.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No repositories found
                    </div>
                  ) : (
                    ghRepos.map((repo) => (
                      <div key={repo.id} className="github-repo-item">
                        <div className="github-repo-info">
                          <div className="github-repo-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {repo.private ? (
                              <Lock size={12} style={{ color: "var(--text-muted)" }} />
                            ) : (
                              <Globe size={12} style={{ color: "var(--text-muted)" }} />
                            )}
                            {repo.name}
                          </div>
                          <div className="github-repo-meta">
                            {repo.language && (
                              <span className="github-repo-lang">
                                <span
                                  className="github-repo-lang-dot"
                                  style={{ background: langColor[repo.language] || "#666" }}
                                />
                                {repo.language}
                              </span>
                            )}
                            {repo.stars > 0 && (
                              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <Star size={11} />
                                {repo.stars}
                              </span>
                            )}
                            <span>{repo.description?.substring(0, 50) || ""}</span>
                          </div>
                        </div>
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          <ExternalLink size={12} />
                          Open
                        </a>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* LLM Provider Config */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={16} strokeWidth={1.8} />
            Default LLM Provider
          </h3>
        </div>
        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Provider</label>
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
          {provider === "ollama" && (
            <div className="form-group">
              <label className="form-label">Ollama URL</label>
              <input
                className="form-input"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <div className="form-hint">Local Ollama server address</div>
            </div>
          )}
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          This setting determines which LLM provider is used by default when creating new pipelines.
          You can override this per-pipeline.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast toast-success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCheck size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
