import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-white pb-16">
      {/* Header fisso in top volendo, o delegato alle singole view */}
      <main className="flex-1 w-full max-w-md mx-auto p-4 overflow-x-hidden">
        <Outlet />
      </main>
      
      {/* Footer Nav */}
      <BottomNav />
    </div>
  );
}
