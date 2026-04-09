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
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user.email || "");
      }
    });
  }, [router]);

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

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <span className="sidebar-brand-name">Multi-Agent</span>
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

        <div className="sidebar-footer">
          <div
            className="sidebar-user"
            onClick={handleLogout}
            title="Click to logout"
          >
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{userEmail.split("@")[0]}</div>
              <div className="sidebar-user-email">{userEmail}</div>
            </div>
            <LogOut size={14} style={{ marginLeft: "auto", opacity: 0.4 }} />
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
