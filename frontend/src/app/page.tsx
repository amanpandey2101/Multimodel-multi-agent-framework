"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Zap } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="sidebar-brand-icon" style={{ width: 56, height: 56 }}>
          <Zap size={26} strokeWidth={2.5} />
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          MULTI-AGENT
        </span>
      </div>
    );
  }

  return null;
}
