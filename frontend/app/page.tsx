import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { UploadBox } from "@/components/upload-box";

export default async function HomePage() {
  const me = await fetchMe();

  return (
    <main className="mx-auto max-w-2xl p-6 pt-16">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Word Templator</h1>
        <nav className="flex gap-2 text-sm">
          {me ? (
            <>
              <Link
                href="/batch"
                className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-text-muted hover:text-text"
              >
                일괄 변환
              </Link>
              <Link
                href="/dashboard"
                className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-text-muted hover:text-text"
              >
                히스토리
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-token bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-hover"
            >
              로그인
            </Link>
          )}
        </nav>
      </header>

      <p className="mt-3 text-base text-text-muted">
        .docx 파일을 업로드해 표준 양식으로 변환하세요.
      </p>

      {me ? (
        <UploadBox />
      ) : (
        <div className="mt-8 rounded-token-xl border border-border bg-surface p-12 text-center">
          <div className="text-5xl">🔒</div>
          <p className="mt-4 text-base font-medium">로그인이 필요합니다</p>
          <p className="mt-1 text-sm text-text-muted">
            업로드하려면 먼저 로그인하세요.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-token bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            로그인하기
          </Link>
        </div>
      )}
    </main>
  );
}
