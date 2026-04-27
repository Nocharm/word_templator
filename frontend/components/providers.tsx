"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SettingsProvider } from "./settings-provider";
import type { Language } from "@/lib/i18n";

export function Providers({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider initialLanguage={initialLanguage}>{children}</SettingsProvider>
    </QueryClientProvider>
  );
}
