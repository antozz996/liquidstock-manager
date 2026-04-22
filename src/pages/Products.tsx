import { useEffect, useState } from "react";
import { useProductStore } from "../store/useProductStore";
import { Search, Plus, Upload } from "lucide-react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { calculateReorder } from "../lib/calculations";
import { generateReorderPDF } from "../lib/pdf";
import ImportModal from "../components/ImportModal";
import AddProductModal from "../components/AddProductModal";
import EditProductModal from "../components/EditProductModal";
import { groupBy, CATEGORY_ORDER, cn } from "../lib/utils";
import type { Product } from "../types";

import { useAuthStore } from "../store/useAuthStore";

export default function ProductsList() {
  const { products, fetchProducts, isLoading } = useProductStore();
  const { role } = useAuthStore();
  const [search, setSearch] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupBy(filtered, 'category');
  const categories = Object.keys(grouped).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  return (
    <div className="space-y-4 pt-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Magazzino</h1>
        {(role === 'admin' || role === 'super_admin') && (
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
        )}
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
        {(role === 'admin' || role === 'super_admin') && (
          <>
            <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-5 w-5" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 shrink-0 border-primary/30 text-primary"
              onClick={() => setIsImportOpen(true)}
            >
              <Upload className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      <AddProductModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <EditProductModal 
        product={selectedProduct} 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
      />

      {isLoading ? (
        <div className="animate-pulse space-y-3 pt-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-card rounded-xl"></div>)}
        </div>
      ) : (
        <div className="space-y-8 pt-2">
          {categories.map(cat => (
            <div key={cat} className="space-y-3">
              <h2 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                <span className="h-px bg-primary/20 flex-1"></span>
                {cat || "Generale"}
                <span className="h-px bg-primary/20 flex-1"></span>
              </h2>
              <div className="grid gap-3">
                {grouped[cat].map(p => (
                  <Card 
                    key={p.id} 
                    className={cn(
                      "p-4 flex justify-between items-center transition-all",
                      (role === 'admin' || role === 'super_admin') ? "cursor-pointer hover:border-primary/50 active:scale-[0.98]" : "cursor-default",
                      !p.is_active && "opacity-50"
                    )}
                    onClick={() => {
                      if(role === 'admin' || role === 'super_admin') setSelectedProduct(p);
                    }}
                  >
                    <div>
                      <p className="font-semibold text-white">{p.name}</p>
                      <div className="flex flex-col gap-1 mt-1">
                        {(role === 'admin' || role === 'super_admin') ? (
                          <>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Costo Unitario: {p.cost_price.toFixed(2)}€</p>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Valore Totale: {(p.current_stock * p.cost_price).toFixed(2)}€</p>
                          </>
                        ) : (
                          <span className="text-[10px] opacity-40 italic uppercase">Cod: {p.id.slice(0, 4)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mb-0.5">Giacenza</p>
                        <p className={cn(
                          "text-xl font-bold",
                          (role === 'admin' || role === 'super_admin') && p.min_threshold > 0 && p.current_stock <= p.min_threshold 
                            ? 'text-accent-orange' 
                            : 'text-accent-green'
                        )}>
                          {p.current_stock}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nessun prodotto trovato.</p>
          )}
        </div>
      )}
    </div>
  );
}
