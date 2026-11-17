import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { WorkspaceDto } from "./lib/types";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null);
  const [view, setView] = useState<"landing" | "dashboard">(() =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/app")
      ? "dashboard"
      : "landing",
  );
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then(({ workspace: ws }) => {
        setWorkspace(ws);
        if (ws && window.location.pathname.startsWith("/app")) {
          setView("dashboard");
        }
      })
      .catch(() => {})
      .finally(() => setBooted(true));
  }, []);

  const enterDashboard = (ws: WorkspaceDto) => {
    setWorkspace(ws);
    setView("dashboard");
    window.history.pushState({}, "", "/app");
  };

  const backHome = () => {
    setView("landing");
    window.history.pushState({}, "", "/");
  };

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading FormBeam…
      </div>
    );
  }

  if (view === "dashboard" && workspace) {
    return (
      <DashboardPage
        workspace={workspace}
        onWorkspaceChange={(ws) => {
          setWorkspace(ws);
          if (!ws) backHome();
        }}
        onBackHome={backHome}
      />
    );
  }

  return <LandingPage workspace={workspace} onEnterApp={enterDashboard} />;
}

export default App;
