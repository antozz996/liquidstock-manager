import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProductStore } from "../store/useProductStore";
import { calculateReorder } from "../lib/calculations";
import { generateReorderPDF } from "../lib/pdf";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { ChevronLeft, FileText, Package } from "lucide-react";

export default function OrderReview() {
  const navigate = useNavigate();
  const { products, fetchProducts, isLoading } = useProductStore();
  const [orderItems, setOrderItems] = useState<any[]>([]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (products.length > 0) {
      const suggested = calculateReorder(products).map(item => {
        const name = item.name.toUpperCase();
        let unit = 'CT';
        let divisor = 6;
        
        if (name.includes('ABACO') || name.includes('ABACA')) {
          unit = 'CT';
          divisor = 9;
        } else if (name.includes('SCHWEPPES') || name.includes('ACQUA')) {
          unit = 'BOX';
          divisor = 1; // Già contati in box
        }

        return {
          ...item,
          unit,
          divisor,
          qtyInUnits: Math.ceil(item.qty_to_order / divisor)
        };
      });
      setOrderItems(suggested);
    }
  }, [products]);

  const handleUpdateQty = (id: string, newQty: number) => {
    setOrderItems(prev => prev.map(item => 
      item.id === id ? { ...item, qtyInUnits: newQty } : item
    ));
  };

  const handleGenerate = () => {
    // Passiamo gli oggetti con il campo displayQty già calcolato per il PDF
    const finalItems = orderItems.map(item => ({
      ...item,
      displayQty: `${item.qtyInUnits} ${item.unit}`
    }));
    generateReorderPDF(finalItems);
  };

  if (isLoading && orderItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 pt-6 pb-32">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revisione Ordine</h1>
          <p className="text-sm text-muted-foreground">Controlla e modifica i quantitativi prima del PDF</p>
        </div>
      </div>

      {orderItems.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-white/10">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground">Nessun prodotto sotto soglia da ordinare.</p>
          <Button variant="link" onClick={() => navigate(-1)} className="mt-2">Torna al magazzino</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orderItems.map(item => (
            <Card key={item.id} className="p-5 bg-card/50 backdrop-blur-sm border-white/5 hover:border-primary/20 transition-all">
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <h3 className="font-bold text-lg leading-tight mb-1">{item.name}</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-green"></div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Giacenza: <span className="text-white">{item.current_stock}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-orange"></div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Soglia: <span className="text-white">{item.min_threshold}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                  <span className="text-[10px] font-black text-primary uppercase">{item.unit}</span>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-primary mb-2 block">
                    Quantità ({item.unit})
                  </label>
                  <Input 
                    type="number"
                    min="0"
                    value={item.qtyInUnits}
                    onChange={(e) => handleUpdateQty(item.id, Number(e.target.value))}
                    className="h-12 text-xl font-bold bg-background/50 border-white/10 focus:border-primary/50"
                  />
                </div>
                <div className="hidden sm:block pb-3">
                  <p className="text-[10px] text-muted-foreground italic">
                    * Suggerito: {Math.ceil(item.qty_to_order / item.divisor)} {item.unit}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <Button 
            className="w-full h-14 text-lg font-black uppercase tracking-widest gap-3 shadow-2xl shadow-primary/30 rounded-xl transition-all active:scale-[0.98]"
            onClick={handleGenerate}
            disabled={orderItems.length === 0}
          >
            <FileText className="h-6 w-6" />
            Genera PDF Ordine
          </Button>
        </div>
      </div>
    </div>
  );
}
