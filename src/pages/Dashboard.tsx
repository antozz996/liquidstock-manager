import { useEffect, useState } from "react";
import { useProductStore } from "../store/useProductStore";
import { Package, AlertTriangle, ArrowRight, History, Building2 } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/formatters";
import type { Event } from "../types";
import { useNavigate } from "react-router-dom";

// Dummy Card Component since we didn't write it fully, let's just make it simple
import { useAuthStore } from "../store/useAuthStore";

export default function Dashboard() {
  const navigate = useNavigate();
  const { products, fetchProducts } = useProductStore();
  const { role, venueId, user } = useAuthStore();
  const [lastEvent, setLastEvent] = useState<Event | null>(null);
  const [venueName, setVenueName] = useState<string>("");

  useEffect(() => {
    fetchProducts();
    
    async function fetchVenue() {
      if (!venueId) return;
      const { data } = await supabase.from('venues').select('name').eq('id', venueId).single();
      if (data) setVenueName(data.name);
    }
    
    async function fetchLast() {
      if (!venueId) return;
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('venue_id', venueId)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) setLastEvent(data[0] as Event);
    }
    fetchVenue();
    fetchLast();
  }, [fetchProducts, venueId]);

  const activeProducts = products.filter(p => p.is_active);
  const lowStockProducts = activeProducts.filter(p => p.current_stock <= p.min_threshold && p.min_threshold > 0);

  return (
    <div className="space-y-6 pt-4 pb-10">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground italic">
            Ciao, {user?.user_metadata?.full_name || 'Operatore'} 👋
          </p>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white leading-none">
            LiquidStock
          </h1>
          {venueName && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sei loggato in:</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-md">
                <Building2 size={10} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{venueName}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2">
        <div className="rounded-xl border border-muted bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Package className="w-5 h-5" />
            <span className="text-sm font-medium">Prodotti Attivi</span>
          </div>
          <span className="text-3xl font-bold">{activeProducts.length}</span>
        </div>

        {(role === 'admin' || role === 'super_admin') && (
          <div className="rounded-xl border border-accent-orange/50 bg-accent-orange/10 p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-accent-orange mb-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">Sotto Scorta</span>
            </div>
            <span className="text-3xl font-bold text-accent-orange">
              {lowStockProducts.length}
            </span>
          </div>
        )}

        {(role === 'admin' || role === 'super_admin') && (
          <div className="rounded-xl border border-muted bg-card p-4 shadow-sm flex flex-col justify-between col-span-2">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Package className="w-5 h-5" />
              <span className="text-sm font-medium">Valore Totale Magazzino (Costo)</span>
            </div>
            <span className="text-3xl font-bold text-white">
              {formatCurrency(activeProducts.reduce((acc, p) => acc + (p.current_stock * p.cost_price), 0))}
            </span>
          </div>
        )}
      </div>

      {lastEvent && (
        <Card className="p-4 border-muted/20 bg-card/40 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all" onClick={() => navigate(`/history/${lastEvent.id}`)}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <History size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Ultima Serata Chiusa</p>
              <p className="font-bold text-white text-lg">{lastEvent.name}</p>
            </div>
          </div>
          <ArrowRight className="text-muted/30" />
        </Card>
      )}

      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-semibold border-b border-muted/30 pb-2">Azioni Rapide</h2>
        <Button className="w-full justify-between h-14" variant="secondary" onClick={() => window.location.href='/events'}>
          <span className="text-lg">Vai a Gestione Serata</span>
          <ArrowRight className="w-5 h-5 opacity-50" />
        </Button>
        <Button className="w-full justify-between h-14" variant="outline" onClick={() => window.location.href='/products'}>
          <span className="text-lg">Gestisci Magazzino</span>
          <Package className="w-5 h-5 opacity-50" />
        </Button>
      </div>
    </div>
  );
}
