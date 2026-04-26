"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // ignore — still navigate to login
    }
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50 ${className}`}
    >
      {busy ? "..." : "로그아웃"}
    </button>
  );
}
