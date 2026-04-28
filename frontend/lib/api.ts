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
  me: () => request<{ id: string; email: string; role: "user" | "admin" }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
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
  render: (jobId: string, templateId: string, overrides: Record<string, unknown> = {}) =>
    request<{ status: string }>(`/jobs/${jobId}/render`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, overrides }),
    }),
  preview: (jobId: string, templateId: string, overrides: Record<string, unknown> = {}) =>
    request<import("./types").PreviewResponse>(`/jobs/${jobId}/preview`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, overrides }),
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
  deleteJob: (jobId: string) =>
    request<void>(`/jobs/${jobId}`, { method: "DELETE" }),
  uploadBatch: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return request<import("./types").BatchUploadItem[]>("/jobs/batch/upload", {
      method: "POST",
      body: fd,
    });
  },
  renderBatch: (
    jobIds: string[],
    templateId: string,
    overrides: Record<string, unknown> = {},
  ) =>
    request<import("./types").BatchRenderItem[]>("/jobs/batch/render", {
      method: "POST",
      body: JSON.stringify({ job_ids: jobIds, template_id: templateId, overrides }),
    }),
  batchDownloadUrl: (jobIds: string[]) =>
    `${BASE}/jobs/batch/download?ids=${jobIds.join(",")}`,
  submitFeedback: (
    category: import("./types").FeedbackCategory,
    title: string,
    body: string,
  ) =>
    request<import("./types").Feedback>("/feedback", {
      method: "POST",
      body: JSON.stringify({ category, title, body }),
    }),
  listMyFeedback: () => request<import("./types").Feedback[]>("/feedback/me"),
  listAdminFeedback: (filter?: {
    status?: import("./types").FeedbackStatus;
    category?: import("./types").FeedbackCategory;
  }) => {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set("status", filter.status);
    if (filter?.category) qs.set("category", filter.category);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<import("./types").Feedback[]>(`/admin/feedback${suffix}`);
  },
  updateAdminFeedback: (
    id: string,
    body: { status?: import("./types").FeedbackStatus; admin_note?: string },
  ) =>
    request<import("./types").Feedback>(`/admin/feedback/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
