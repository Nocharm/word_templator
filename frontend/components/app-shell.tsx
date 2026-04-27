"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useSettings } from "@/components/settings-provider";
import { LANGUAGE_OPTIONS, type MessageKey } from "@/lib/i18n";

interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "nav.convert", icon: "↻" },
  { href: "/batch", labelKey: "nav.batch", icon: "≡" },
  { href: "/dashboard", labelKey: "nav.history", icon: "◷" },
  { href: "/templates", labelKey: "nav.templates", icon: "◫" },
  { href: "/feedback", labelKey: "nav.feedback", icon: "✎" },
];

const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin/feedback",
  labelKey: "nav.admin",
  icon: "⚐",
};

interface AppShellProps {
  email: string | null;
  role?: "user" | "admin" | null;
  children: ReactNode;
}

export function AppShell({ email, role, children }: AppShellProps) {
  // 로그인/회원가입 등 비인증 라우트는 풀스크린 카드 — 데스크탑 셸 숨김.
  if (!email) return <>{children}</>;

  return (
    <div className="grid h-screen grid-cols-[240px_1fr] bg-bg">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-col">
        <StatusBar email={email} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ role }: { role?: "user" | "admin" | null }) {
  const pathname = usePathname();
  const { t } = useSettings();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex h-screen flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center border-b border-border px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid h-6 w-6 place-items-center rounded bg-primary text-xs font-bold text-white">
            W
          </span>
          Word Templator
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={t(item.labelKey)}
            icon={item.icon}
            active={isActive(item.href)}
          />
        ))}

        {role === "admin" ? (
          <>
            <div className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("nav.adminSection")}
            </div>
            <SidebarLink
              href={ADMIN_NAV_ITEM.href}
              label={t(ADMIN_NAV_ITEM.labelKey)}
              icon={ADMIN_NAV_ITEM.icon}
              active={isActive(ADMIN_NAV_ITEM.href)}
              tone="warning"
            />
          </>
        ) : null}
      </nav>

      <div className="border-t border-border px-4 py-2 text-[11px] text-text-muted">
        {t("nav.versionLabel")}
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  tone = "default",
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  tone?: "default" | "warning";
}) {
  const isWarning = tone === "warning";
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-3 rounded-token px-3 py-2 text-sm transition",
        active
          ? isWarning
            ? "bg-warning/15 text-warning font-medium"
            : "bg-primary/10 text-primary font-medium"
          : isWarning
            ? "text-warning hover:bg-warning/10"
            : "text-text-muted hover:bg-surface-elevated hover:text-text",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "grid h-5 w-5 place-items-center rounded text-[13px] leading-none",
          active
            ? isWarning
              ? "bg-warning/20"
              : "bg-primary/15"
            : "bg-transparent",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function StatusBar({ email }: { email: string }) {
  const router = useRouter();
  const { t, language, setLanguage } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleSignOut() {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // ignore — 그래도 로그인 화면으로 이동
    }
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  const otherLang = language === "en" ? "ko" : "en";
  const otherLabel = LANGUAGE_OPTIONS.find((o) => o.value === otherLang)?.short ?? "EN";

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-end gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <ClockBadge locale={language === "ko" ? "ko-KR" : "en-US"} />

      <button
        type="button"
        onClick={() => setLanguage(otherLang)}
        aria-label={t("statusbar.langToggleAria")}
        title={t("statusbar.langToggleAria")}
        className="flex h-8 items-center gap-1 rounded-token border border-border bg-surface-elevated px-2 text-xs font-semibold text-text-muted hover:bg-surface hover:text-text"
      >
        <span aria-hidden>🌐</span>
        <span>{otherLabel}</span>
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[180px] truncate text-text-muted sm:inline">
            {email}
          </span>
          <span className="text-xs text-text-muted">▾</span>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-token-lg border border-border bg-surface-elevated shadow-token"
          >
            <div className="border-b border-border px-4 py-2 text-xs text-text-muted">
              {email}
            </div>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-surface"
            >
              {t("statusbar.settings")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={busy}
              className="block w-full border-t border-border px-4 py-2 text-left text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {busy ? t("statusbar.signingOut") : t("statusbar.signOut")}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

// 매초 갱신되는 시계 — SSR 시점에는 빈 placeholder 로 두고 mount 후 채움 → hydration mismatch 회피.
function ClockBadge({ locale }: { locale: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const text = now
    ? now.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--";

  return (
    <span
      suppressHydrationWarning
      className="hidden h-8 items-center rounded-token border border-border bg-surface-elevated px-3 font-mono text-xs tabular-nums text-text-muted sm:inline-flex"
      aria-label="Current time"
    >
      {text}
    </span>
  );
}
