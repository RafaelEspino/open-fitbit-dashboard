import { useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AiPage from "./pages/AiPage";

type Page = "dashboard" | "ai" | "settings";

const PAGES: { key: Page; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ai", label: "AI" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-100">Fitbit AI Dashboard</h1>
          <nav className="flex gap-1">
            {PAGES.map((p) => (
              <button
                key={p.key}
                onClick={() => setPage(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  page === p.key
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {page === "dashboard" ? <DashboardPage /> : page === "ai" ? <AiPage /> : <SettingsPage />}
      </main>
    </div>
  );
}
