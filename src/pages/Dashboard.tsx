import { useEffect } from "react";
import { useProductStore } from "../store/useProductStore";
import { Package, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

// Dummy Card Component since we didn't write it fully, let's just make it simple
export default function Dashboard() {
  const { products, fetchProducts, isLoading } = useProductStore();

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const activeProducts = products.filter(p => p.is_active);
  const lowStockProducts = activeProducts.filter(p => p.current_stock <= p.min_threshold && p.min_threshold > 0);

  return (
    <div className="space-y-6 pt-4 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">LiquidStock</h1>
      </div>

      <div className="grid gap-4 grid-cols-2">
        <div className="rounded-xl border border-muted bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Package className="w-5 h-5" />
            <span className="text-sm font-medium">Prodotti Attivi</span>
          </div>
          <span className="text-3xl font-bold">{activeProducts.length}</span>
        </div>

        <div className="rounded-xl border border-accent-orange/50 bg-accent-orange/10 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-accent-orange mb-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">Sotto Scorta</span>
          </div>
          <span className="text-3xl font-bold text-accent-orange">
            {lowStockProducts.length}
          </span>
        </div>
      </div>

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
