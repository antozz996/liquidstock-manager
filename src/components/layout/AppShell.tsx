import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { VenueSwitcher } from "./VenueSwitcher";

export function AppShell() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-white pb-24">
      <main className="flex-1 w-full max-w-md mx-auto p-4 overflow-x-hidden pt-6">
        <VenueSwitcher />
        <Outlet />
      </main>
      
      <BottomNav />
    </div>
  );
}
