"use client";

import Link from "next/link";
import { useT } from "@/components/settings-provider";
import { UploadBox } from "@/components/upload-box";

export function HomeContent({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Word Templator</h1>
      <p className="mt-3 text-base text-text-muted">{t("home.tagline")}</p>

      {signedIn ? (
        <UploadBox />
      ) : (
        <div className="mt-8 rounded-token-xl border border-border bg-surface p-12 text-center">
          <div className="text-5xl">🔒</div>
          <p className="mt-4 text-base font-medium">{t("home.signInRequired")}</p>
          <p className="mt-1 text-sm text-text-muted">{t("home.signInToUpload")}</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-token bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t("home.signIn")}
          </Link>
        </div>
      )}
    </>
  );
}
