import { useEffect, useState } from "react";
import { useEventStore } from "../store/useEventStore";
import { useProductStore } from "../store/useProductStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { formatCurrency } from "../lib/formatters";
import { AlertCircle, Plus, RotateCcw } from "lucide-react";
import { groupBy, CATEGORY_ORDER, cn } from "../lib/utils";

import { useAuthStore } from "../store/useAuthStore";

export default function EventsSpace() {
  const { 
    currentEvent, eventStocks, isLoading, fetchCurrentEvent, 
    openNewEvent, addFinalCount, clearFinalCounts, closeEvent 
  } = useEventStore();
  const { products, fetchProducts } = useProductStore();
  const { user, role } = useAuthStore();

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  
  // State per gestire i nuovi conteggi inseriti
  const [newCounts, setNewCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCurrentEvent();
    fetchProducts();
  }, [fetchCurrentEvent, fetchProducts]);

  if (isLoading) return <div className="pt-8 text-center animate-pulse">Caricamento serata...</div>;

  if (!currentEvent) {
    return (
      <div className="pt-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Avvia Serata</h1>
          <p className="text-muted-foreground text-sm">Avvia un nuovo evento per scattare una fotografia iniziale dell'inventario.</p>
        </div>

        <Card className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-muted-foreground">Nome Evento</label>
            <Input 
              value={eventName} 
              onChange={e => setEventName(e.target.value)} 
              placeholder="es. Sabato 14 Giugno" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-muted-foreground">Data</label>
            <Input 
              type="date"
              value={eventDate} 
              onChange={e => setEventDate(e.target.value)} 
            />
          </div>
          <Button 
            className="w-full mt-4" 
            disabled={!eventName || products.length === 0 || (role !== 'admin' && role !== 'staff' && role !== 'super_admin')}
            onClick={() => openNewEvent(eventName, eventDate, products.filter(p => p.is_active))}
          >
            {(role === 'admin' || role === 'staff' || role === 'super_admin') ? "Apri Serata" : "Non hai i permessi per aprire serate"}
          </Button>
        </Card>
      </div>
    );
  }

  // EVENTO APERTO - CHIUSURA
  const handleClose = async () => {
    // Validazione basica (tutti final inseriti?)
    const allFilled = eventStocks.every(es => es.final_qty !== null && es.final_qty !== undefined);
    if (!allFilled) {
      alert("Devi compilare le quantità finali per tutti i prodotti attivi prima di chiudere la serata.");
      return;
    }
    await closeEvent();
    alert("Serata chiusa con successo! Giacenze aggiornate.");
  };

  return (
    <div className="pt-4 pb-24 space-y-4">
      <div className="flex justify-between items-end border-b border-muted/30 pb-4">
        <div>
          <span className="text-accent-green text-xs font-bold uppercase track">Evento Aperto</span>
          <h1 className="text-2xl font-bold">{currentEvent.name}</h1>
        </div>
        <Button variant="destructive" size="sm" onClick={handleClose}>Chiudi e Calcola</Button>
      </div>
      
      <p className="text-sm text-muted-foreground">Conta le bottiglie rimaste nel frigo per calcolare in automatico i consumi e sistemare le giacenze.</p>

      {/* Live Summary */}
      {(role === 'admin' || role === 'staff' || role === 'super_admin') && (
        <div className="grid grid-cols-1 gap-3 mt-4">
          <div className="bg-card border border-muted/30 p-3 rounded-lg">
            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Costo Consumato Est.</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(eventStocks.reduce((acc, es) => {
                if (es.final_qty === null || !es.product) return acc;
                return acc + (es.initial_qty - es.final_qty) * es.product.cost_price;
              }, 0))}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-10 mt-6">
        {Object.entries(groupBy(eventStocks, (es: any) => es.product?.category || 'Generale'))
          .sort(([catA], [catB]) => {
            const idxA = CATEGORY_ORDER.indexOf(catA);
            const idxB = CATEGORY_ORDER.indexOf(catB);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          })
          .map(([cat, stocks]) => (
          <div key={cat} className="space-y-4">
            <h2 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1 flex items-center gap-2">
              <span className="h-px bg-primary/20 flex-1"></span>
              {cat}
              <span className="h-px bg-primary/20 flex-1"></span>
            </h2>
            
            <div className="space-y-3">
              {stocks.map(stock => {
                const product = stock.product;
                if (!product) return null;
                
                const consumed = stock.final_qty !== null ? stock.initial_qty - stock.final_qty : 0;
                const isAnomaly = consumed < 0;

                return (
                  <Card key={stock.id} className={`p-4 transition-colors ${isAnomaly ? 'border-accent-red/50 bg-accent-red/5' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-lg truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-muted/20 px-1.5 py-0.5 rounded text-muted-foreground border border-muted/30">
                            Inizio: {stock.initial_qty}
                          </span>
                          {stock.final_qty !== null && (
                            <span className={`text-xs font-bold ${isAnomaly ? 'text-accent-red' : 'text-accent-green'}`}>
                              {isAnomaly ? 'Anomalia: ' : 'Consumato: '}{consumed}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1">Giacenza Totale</p>
                          <div className={cn(
                            "text-2xl font-black leading-none",
                            stock.final_qty !== null ? "text-white" : "text-white/20"
                          )}>
                            {stock.final_qty !== null ? stock.final_qty : "--"}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Input 
                            type="number"
                            inputMode="decimal"
                            placeholder="+ Aggiungi"
                            className="w-24 h-9 text-xs text-center font-bold bg-white/5 border-white/10"
                            value={newCounts[stock.id] || ""}
                            onChange={(e) => setNewCounts({ ...newCounts, [stock.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newCounts[stock.id]) {
                                addFinalCount(stock.id, parseFloat(newCounts[stock.id]), user?.email || 'Staff');
                                setNewCounts({ ...newCounts, [stock.id]: "" });
                              }
                            }}
                          />
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="h-9 w-9 p-0 border-white/5"
                            onClick={() => {
                              if (newCounts[stock.id]) {
                                addFinalCount(stock.id, parseFloat(newCounts[stock.id]), user?.email || 'Staff');
                                setNewCounts({ ...newCounts, [stock.id]: "" });
                              }
                            }}
                          >
                            <Plus size={16} />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-9 w-9 p-0 text-muted-foreground hover:text-accent-red"
                            onClick={() => {
                              if (confirm(`Vuoi azzerare i conteggi per ${product.name}?`)) {
                                clearFinalCounts(stock.id);
                              }
                            }}
                          >
                            <RotateCcw size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {isAnomaly && (
                      <div className="mt-2 flex items-center gap-1.5 text-accent-red text-[10px] font-medium">
                        <AlertCircle size={12} />
                        <span>Hai inserito una giacenza finale superiore a quella iniziale!</span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
