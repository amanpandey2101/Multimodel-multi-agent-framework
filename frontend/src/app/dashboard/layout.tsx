"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  Zap,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Sun,
  Moon,
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user.email || "");
      }
    });
  }, [router]);

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark";
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/projects", label: "Projects", icon: FolderOpen },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  const handleLogout = async () => {
    await authApi.logout();
    router.push("/login");
  };

  const initials = userEmail
    ? userEmail.substring(0, 2).toUpperCase()
    : "??";

  const isIde = pathname.startsWith("/dashboard/ide/");

  return (
    <div className={`layout ${isCollapsed ? "collapsed" : ""}`}>
      <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="sidebar-toggle"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="sidebar-brand" style={{ justifyContent: isCollapsed ? "center" : "flex-start" }}>
          <div className="sidebar-brand-icon">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          {!isCollapsed && <span className="sidebar-brand-name">Weave</span>}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Navigation</div>
          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? "active" : ""}`}
                >
                  <span className="sidebar-link-icon">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span>{item.label}</span>
                  {isActive && (
                    <ChevronRight
                      size={14}
                      style={{ marginLeft: "auto", opacity: 0.5 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Appearance</div>
          <nav className="sidebar-nav">
            <button 
              onClick={toggleTheme}
              className="sidebar-link"
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span className="sidebar-link-icon">
                {theme === "light" ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
              </span>
              <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div
            className="sidebar-user"
            onClick={handleLogout}
            title="Click to logout"
          >
            <div className="sidebar-avatar">{initials}</div>
            {!isCollapsed && (
              <>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name">{userEmail.split("@")[0]}</div>
                  <div className="sidebar-user-email">{userEmail}</div>
                </div>
                <LogOut size={14} style={{ marginLeft: "auto", opacity: 0.4 }} />
              </>
            )}
          </div>
        </div>
      </aside>

      <main className={`main-content ${isIde ? "no-padding" : ""}`}>{children}</main>
    </div>
  );
}
