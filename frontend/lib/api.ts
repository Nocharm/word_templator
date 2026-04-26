// 빈값/미설정 시 동일 origin의 /api 로 — nginx 프록시 거치므로 CORS·포트 노출 불필요
const BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ id: string; email: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ status: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; email: string }>("/auth/me"),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ job_id: string; outline: import("./types").Outline }>("/jobs/upload", {
      method: "POST",
      body: fd,
    });
  },
  getOutline: (jobId: string) => request<import("./types").Outline>(`/jobs/${jobId}/outline`),
  putOutline: (jobId: string, outline: import("./types").Outline) =>
    request<{ status: string }>(`/jobs/${jobId}/outline`, {
      method: "PUT",
      body: JSON.stringify(outline),
    }),
  render: (jobId: string, templateId: string) =>
    request<{ status: string }>(`/jobs/${jobId}/render`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, overrides: {} }),
    }),
  downloadUrl: (jobId: string) => `${BASE}/jobs/${jobId}/download`,
  listJobs: () => request<import("./types").JobSummary[]>("/jobs"),
  listTemplates: () => request<import("./types").Template[]>("/templates"),
  createTemplate: (name: string, spec: Record<string, unknown>) =>
    request<import("./types").Template>("/templates", {
      method: "POST",
      body: JSON.stringify({ name, spec }),
    }),
  updateTemplate: (id: string, body: { name?: string; spec?: Record<string, unknown> }) =>
    request<import("./types").Template>(`/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),
};
