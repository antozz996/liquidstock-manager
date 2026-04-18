import { Home, Package, CalendarClock, History } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

export function BottomNav() {
  const location = useLocation();

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "Products", path: "/products", icon: Package },
    { name: "Events", path: "/events", icon: CalendarClock },
    { name: "History", path: "/history", icon: History },
  ];

  return (
    <div className="fixed bottom-0 z-50 w-full h-16 bg-[#0a0a0a] border-t border-muted/30 pb-safe">
      <div className="grid h-full w-full grid-cols-4 items-center">
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
              <Icon className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
