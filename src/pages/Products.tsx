import { useEffect, useState } from "react";
import { useProductStore } from "../store/useProductStore";
import { Search, Plus } from "lucide-react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { calculateReorder } from "../lib/calculations";
import { generateReorderPDF } from "../lib/pdf";

export default function ProductsList() {
  const { products, fetchProducts, isLoading } = useProductStore();
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pt-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Magazzino</h1>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 border-accent-orange/50 text-accent-orange"
          onClick={() => {
            const items = calculateReorder(products);
            if(items.length > 0) generateReorderPDF(items);
            else alert("Nessun prodotto sotto soglia!");
          }}
        >
          Genera Ordine
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Cerca prodotto..." 
            className="pl-9 h-10" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="icon" className="h-10 w-10 shrink-0">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3 pt-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-card rounded-xl"></div>)}
        </div>
      ) : (
        <div className="grid gap-3 pt-2">
          {filtered.map(p => (
            <Card key={p.id} className={`p-4 flex justify-between items-center ${!p.is_active ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-semibold text-white">{p.name}</p>
                <div className="flex gap-2 text-xs mt-1 text-muted-foreground">
                  <span className="bg-muted/30 px-2 py-0.5 rounded-sm">{p.category}</span>
                  <span>{p.cost_price}€ cad.</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-0.5">Giacenza</p>
                  <p className={`text-xl font-bold ${p.current_stock <= p.min_threshold && p.min_threshold > 0 ? 'text-accent-orange' : 'text-accent-green'}`}>
                    {p.current_stock}
                  </p>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-10 w-10 rounded-full bg-muted/10 hov:bg-muted/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    const qty = prompt(`Quante unità di "${p.name}" stai aggiungendo?`);
                    if(qty) useProductStore.getState().restockProduct(p.id, parseFloat(qty));
                  }}
                >
                  <Plus className="w-5 h-5 text-primary" />
                </Button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nessun prodotto trovato.</p>
          )}
        </div>
      )}
    </div>
  );
}
