import React, { useEffect, useState } from "react";
import { useEventStore } from "../store/useEventStore";
import { useProductStore } from "../store/useProductStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";

export default function EventsSpace() {
  const { currentEvent, eventStocks, isLoading, fetchCurrentEvent, openNewEvent, updateFinalStock, closeEvent } = useEventStore();
  const { products, fetchProducts } = useProductStore();

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);

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
            disabled={!eventName || products.length === 0}
            onClick={() => openNewEvent(eventName, eventDate, products.filter(p => p.is_active))}
          >
            Apri Serata
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

      <div className="space-y-4 mt-6">
        {eventStocks?.map(stock => {
          const product = stock.product;
          if (!product) return null;
          
          return (
            <Card key={stock.id} className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="font-semibold text-white text-lg">{product.name}</p>
                <p className="text-sm text-muted-foreground">Inizio: {stock.initial_qty}</p>
              </div>
              <div className="flex items-center gap-3">
                <Input 
                  type="number"
                  inputMode="decimal"
                  placeholder="Rimanenza..."
                  className="w-24 text-center text-xl font-bold h-12"
                  value={stock.final_qty === null ? "" : stock.final_qty}
                  onChange={(e) => {
                    const val = e.target.value ? parseFloat(e.target.value) : null;
                    if(val !== null) updateFinalStock(stock.id, val);
                  }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
