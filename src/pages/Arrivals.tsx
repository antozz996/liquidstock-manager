import { useEffect, useState } from "react";
import { useArrivalStore } from "../store/useArrivalStore";
import { useProductStore } from "../store/useProductStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Truck, CheckCircle2, History, PackagePlus, ArrowLeft, Search } from "lucide-react";
import { groupBy, CATEGORY_ORDER } from "../lib/utils";
import { formatDateTime } from "../lib/formatters";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";

export default function Arrivals() {
  const { activeSession, items, isLoading, startSession, updateItemQty, closeSession, fetchActiveSession } = useArrivalStore();
  const { products, fetchProducts } = useProductStore();
  const { venueId } = useAuthStore();
  
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchActiveSession();
    fetchHistory();
  }, [venueId]);

  const fetchHistory = async () => {
    if (!venueId) return;
    const { data } = await supabase
      .from('restock_sessions')
      .select('*, restock_items(quantity, products(name))')
      .eq('venue_id', venueId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(10);
    if (data) setHistory(data);
  };

  const filteredProducts = products.filter(p => 
    p.is_active && (p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
  );

  const grouped = groupBy(filteredProducts, 'category');
  const categories = Object.keys(grouped).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const handleClose = async () => {
    const totalItems = Object.values(items).reduce((sum, val) => sum + val, 0);
    if (totalItems === 0) {
      if (!confirm("Non hai inserito alcun arrivo. Chiudere comunque?")) return;
    }
    if (confirm(`Stai per caricare ${totalItems} unità a magazzino. Confermi?`)) {
      await closeSession("Carico merce arrivata");
      fetchHistory();
    }
  };

  if (showHistory) {
    return (
      <div className="space-y-6 pt-4 pb-24">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">Storico Arrivi</h1>
        </div>

        <div className="space-y-4">
          {history.map(s => (
            <Card key={s.id} className="p-4 border-white/5 bg-white/5">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Sessione #{s.id.slice(0, 5)}</p>
                  <p className="text-sm font-bold text-white">{formatDateTime(s.closed_at)}</p>
                </div>
                <div className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 rounded">CHIUSA</div>
              </div>
              <div className="space-y-1 mt-3 pt-3 border-t border-white/5">
                {s.restock_items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[11px] uppercase tracking-tight">
                    <span className="text-muted-foreground">{it.products.name}</span>
                    <span className="font-black text-white">+{it.quantity}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {history.length === 0 && <p className="text-center py-10 text-muted-foreground">Nessuno storico disponibile.</p>}
        </div>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 px-6 text-center">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_30px_rgba(var(--primary-rgb),0.1)]">
          <Truck size={48} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white leading-tight">Nuovi Arrivi Merce</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Inizia una nuova sessione per caricare i prodotti arrivati a magazzino oggi.
          </p>
        </div>
        
        <div className="w-full max-w-xs space-y-3">
          <Button 
            className="w-full h-14 text-lg font-black uppercase italic tracking-widest shadow-xl shadow-primary/20"
            onClick={startSession}
            disabled={isLoading}
          >
            <PackagePlus className="mr-2" /> Inizia Carico
          </Button>
          <Button 
            variant="ghost" 
            className="w-full h-12 text-xs font-black uppercase tracking-widest text-muted-foreground"
            onClick={() => setShowHistory(true)}
          >
            <History className="mr-2 w-4 h-4" /> Vedi Storico Arrivi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 pb-28">
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white leading-none">Carico Merce</h1>
          <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-70">Sessione Aperta</p>
        </div>
        <Button 
          variant="secondary" 
          className="bg-accent-green/20 text-accent-green border-accent-green/20 h-10 font-black uppercase tracking-widest text-[10px]"
          onClick={handleClose}
          disabled={isLoading}
        >
          <CheckCircle2 size={16} className="mr-1" /> Conferma Arrivi
        </Button>
      </div>

      <div className="relative sticky top-0 z-10 bg-[#0a0a0a]/80 backdrop-blur-md pb-2 pt-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Cerca prodotto da caricare..." 
          className="pl-9 h-12 bg-white/5 border-white/10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-8">
        {categories.map(cat => (
          <div key={cat} className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <span className="w-4 h-px bg-white/10"></span>
              {cat}
            </h3>
            <div className="grid gap-2">
              {grouped[cat].map(p => (
                <Card key={p.id} className="p-4 border-white/5 bg-white/5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm uppercase truncate">{p.name}</p>
                      <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mt-0.5">Giacenza: {p.current_stock}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        className="w-10 h-10 rounded-lg bg-white/5 text-white font-black hover:bg-white/10 active:scale-90 transition-all border border-white/10"
                        onClick={() => updateItemQty(p.id, Math.max(0, (items[p.id] || 0) - 1))}
                      >
                        -
                      </button>
                      <Input 
                        type="number"
                        inputMode="decimal"
                        className="w-16 h-10 text-center bg-primary/10 border-primary/20 text-primary font-black text-lg p-0"
                        value={items[p.id] || ""}
                        onChange={e => updateItemQty(p.id, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <button 
                        className="w-10 h-10 rounded-lg bg-primary/10 text-primary font-black hover:bg-primary/20 active:scale-90 transition-all border border-primary/20"
                        onClick={() => updateItemQty(p.id, (items[p.id] || 0) + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
