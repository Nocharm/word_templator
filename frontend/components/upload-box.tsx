"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/components/settings-provider";

export function UploadBox() {
  const router = useRouter();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.upload(file);
      router.push(`/editor/${job_id}`);
    } catch (err) {
      const msg = (err as Error).message;
      // 401이 떨어지면 로그인 페이지로 보냄 (세션 만료 등)
      if (msg.startsWith("401")) {
        router.push("/login");
        return;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-8 cursor-pointer rounded-token-xl border-2 border-dashed border-border bg-surface p-12 text-center transition hover:border-primary"
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        onChange={handleUpload}
        disabled={busy}
        className="hidden"
      />
      <div className="text-5xl">📄</div>
      <p className="mt-4 text-base font-medium">
        {busy ? t("upload.uploading") : t("upload.click")}
      </p>
      <p className="mt-1 text-sm text-text-muted">{t("upload.maxSize")}</p>
      {error ? (
        <p className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
    </div>
  );
}
