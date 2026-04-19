import { Home, Package, CalendarClock, History, BarChart3, LogOut, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/useAuthStore";

export function BottomNav() {
  const location = useLocation();
  const { role, signOut } = useAuthStore();

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    ...(role === 'admin' ? [
      { name: "Analisi", path: "/analytics", icon: BarChart3 },
      { name: "Team", path: "/team", icon: Users },
      { name: "Storia", path: "/history", icon: History }
    ] : []),
    { name: "Magazzino", path: "/products", icon: Package },
    { name: "Serata", path: "/events", icon: CalendarClock },
  ];

  return (
    <div className="fixed bottom-0 z-50 w-full h-16 bg-[#0a0a0a] border-t border-muted/30 pb-safe">
      <div className={cn("grid h-full w-full items-center", role === 'admin' ? "grid-cols-6" : "grid-cols-5")}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
                          (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-white"
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium leading-tight">{item.name}</span>
            </Link>
          );
        })}
        
        <button
          onClick={() => {
            if(confirm("Vuoi uscire dall'app?")) signOut();
          }}
          className="flex flex-col items-center justify-center h-full text-muted-foreground hover:text-accent-red transition-colors"
        >
          <LogOut className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Esci</span>
        </button>
      </div>
    </div>
  );
}
