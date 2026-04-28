import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export const metadata = {
  title: "Settings · Word Templator",
  description: "Manage account and display preferences.",
};

export default async function SettingsPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  return <SettingsClient email={me.email} />;
}
