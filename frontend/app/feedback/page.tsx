import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/auth";
import { FeedbackClient } from "./feedback-client";

export const metadata = {
  title: "Feedback · Word Templator",
  description: "Report bugs, request features, or share thoughts.",
};

export default async function FeedbackPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  return <FeedbackClient />;
}
