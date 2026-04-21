import { Home, Package, CalendarClock, History, BarChart3, LogOut, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/useAuthStore";

export function BottomNav() {
  const location = useLocation();
  const { role, signOut } = useAuthStore();

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    ...(role === 'admin' || role === 'super_admin' || role === 'staff' ? [
      { name: "Analisi", path: "/analytics", icon: BarChart3 },
      { name: "Team", path: "/team", icon: Users },
      { name: "Storia", path: "/history", icon: History }
    ] : []),
    { name: "Magazzino", path: "/products", icon: Package },
    { name: "Serata", path: "/events", icon: CalendarClock },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 px-2 h-16 flex items-center justify-around relative overflow-hidden">
        {/* Glow effect background */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
        
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
                          (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-300",
                isActive ? "text-accent-orange scale-110" : "text-muted-foreground hover:text-white"
              )}
            >
              <div className={cn(
                "absolute -top-1 w-8 h-[2px] rounded-full transition-all duration-300",
                isActive ? "bg-accent-orange shadow-[0_0_8px_rgba(255,107,0,0.6)]" : "bg-transparent"
              )} />
              
              <Icon className={cn("w-5 h-5 mb-1 transition-transform", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
              <span className={cn(
                "text-[9px] font-black uppercase tracking-tighter transition-all",
                isActive ? "opacity-100" : "opacity-70"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
        
        <button
          onClick={() => {
            if(confirm("Vuoi uscire dall'app?")) signOut();
          }}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground/60 hover:text-accent-red transition-all group"
        >
          <LogOut className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase tracking-tighter opacity-70 group-hover:opacity-100">Esci</span>
        </button>
      </div>
    </div>
  );
}
