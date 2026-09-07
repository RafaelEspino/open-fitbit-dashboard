import { useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AiPage from "./pages/AiPage";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeartPulse } from "lucide-react";

type Page = "dashboard" | "ai" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-muted p-1.5">
              <HeartPulse className="size-5 text-red-400" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">Fitbit AI Dashboard</h1>
          </div>
          <Tabs value={page} onValueChange={(v) => setPage(v as Page)}>
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {page === "dashboard" ? <DashboardPage /> : page === "ai" ? <AiPage /> : <SettingsPage />}
      </main>
    </div>
  );
}
