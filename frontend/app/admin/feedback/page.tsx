import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/auth";
import { AdminFeedbackClient } from "./admin-feedback-client";

export const metadata = {
  title: "Feedback admin · Word Templator",
  description: "Admin — view and respond to user feedback.",
};

export default async function AdminFeedbackPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  return <AdminFeedbackClient />;
}
