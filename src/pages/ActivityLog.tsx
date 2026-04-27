import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { useProductStore } from "../store/useProductStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { History, Undo2, User, Clock, PackageMinus, PackagePlus, CalendarX } from "lucide-react";
import { formatDateTime } from "../lib/formatters";

interface LogEntry {
  id: string;
  action_type: 'event_close' | 'restock_close' | 'event_open' | 'restock_open';
  action_id: string;
  created_at: string;
  is_undone: boolean;
  details: any;
  profiles: { full_name: string | null };
}

export default function ActivityLog() {
  const { role, venueId } = useAuthStore();
  const { fetchProducts } = useProductStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    if (!venueId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('activity_log')
      .select('*, profiles:user_id(full_name)')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data) setLogs(data as any);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [venueId]);

  const handleUndo = async (log: LogEntry) => {
    if (log.is_undone) return;
    if (!confirm(`Sei sicuro di voler ANNULLARE questa operazione? Le giacenze verranno ripristinate allo stato precedente.`)) return;

    setIsLoading(true);
    try {
      if (log.action_type === 'restock_close') {
        // Undo Restock: sottrai le quantità caricate
        const items = log.details.items;
        for (const it of items) {
          const { data: prod } = await supabase.from('products').select('current_stock').eq('id', it.product_id).single();
          if (prod) {
            await supabase.from('products').update({ 
              current_stock: (prod.current_stock || 0) - it.quantity 
            }).eq('id', it.product_id);
          }
        }
      } else if (log.action_type === 'event_close') {
        // Undo Event Close: aggiungi indietro i consumi
        const details = log.details.summary.details_json;
        for (const row of details) {
          const { data: prod } = await supabase.from('products').select('current_stock').eq('id', row.product_id).single();
          if (prod) {
            await supabase.from('products').update({ 
              current_stock: (prod.current_stock || 0) + row.consumed 
            }).eq('id', row.product_id);
          }
        }
      }

      // Segna come annullato
      await supabase.from('activity_log').update({ is_undone: true }).eq('id', log.id);
      
      alert("✅ Operazione annullata e giacenze ripristinate!");
      await fetchProducts();
      await fetchLogs();
    } catch (err) {
      console.error(err);
      alert("Errore durante l'annullamento.");
    } finally {
      setIsLoading(false);
    }
  };

  if (role !== 'admin' && role !== 'super_admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato agli amministratori.</div>;
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <History className="text-accent-orange w-5 h-5" />
        <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Registro Attività</h1>
      </div>

      <div className="space-y-3">
        {isLoading && logs.length === 0 ? (
          <div className="animate-pulse space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl"></div>)}
          </div>
        ) : (
          logs.map(log => (
            <Card key={log.id} className={cn("p-4 border-white/5 bg-white/5 relative overflow-hidden", log.is_undone && "opacity-40 grayscale")}>
              {log.is_undone && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-black uppercase text-accent-red bg-accent-red/10 px-2 py-0.5 rounded border border-accent-red/20">
                  <CalendarX size={10} /> Annullato
                </div>
              )}
              
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border",
                    log.action_type === 'event_close' || log.action_type === 'event_open' ? "bg-accent-red/10 text-accent-red border-accent-red/20" : "bg-accent-green/10 text-accent-green border-accent-green/20"
                  )}>
                    {log.action_type === 'event_close' || log.action_type === 'event_open' ? <PackageMinus size={20} /> : <PackagePlus size={20} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-white uppercase tracking-tight text-sm">
                      {log.action_type === 'event_close' ? 'Chiusura Serata' : 
                       log.action_type === 'event_open' ? 'Inizio Serata' :
                       log.action_type === 'restock_open' ? 'Inizio Carico' : 'Carico Merce'}
                    </h4>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase flex items-center gap-1">
                      <Clock size={10} /> {formatDateTime(log.created_at)}
                    </p>
                  </div>
                </div>
                
                {!log.is_undone && (log.action_type === 'event_close' || log.action_type === 'restock_close') && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[9px] font-black uppercase tracking-widest border-accent-orange/30 text-accent-orange hover:bg-accent-orange/10"
                    onClick={() => handleUndo(log)}
                  >
                    <Undo2 size={12} className="mr-1" /> Undo
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-muted-foreground uppercase font-black tracking-widest">
                  <User size={12} className="text-primary" />
                  Operatore: <span className="text-white">{log.profiles?.full_name || "N/A"}</span>
                </div>
                <div className="text-muted-foreground uppercase font-black tracking-widest">
                  {log.action_type.includes('event') ? (
                    <span>Evento: <span className="text-white">{log.details.event_name}</span></span>
                  ) : (
                    <span>ID Carico: <span className="text-white">#{log.action_id.slice(0, 5)}</span></span>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
        {logs.length === 0 && !isLoading && (
          <div className="text-center py-20 text-muted-foreground uppercase text-xs font-bold opacity-30">Nessuna attività registrata</div>
        )}
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
