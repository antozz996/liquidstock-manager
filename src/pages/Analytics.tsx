import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { Card } from "../components/ui/Card";
import { formatCurrency } from "../lib/formatters";
import { TrendingUp, AlertCircle, Calendar, Euro, Package, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { cn } from "../lib/utils";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Analytics() {
  const { venueId } = useAuthStore();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!venueId) return;
      setIsLoading(true);
      const { data } = await supabase
        .from('reports')
        .select('*, event:events(name, date)')
        .eq('venue_id', venueId)
        .order('generated_at', { ascending: true });
      
      if (data) setReports(data);
      setIsLoading(false);
    }
    fetchStats();
  }, [venueId]);

  if (isLoading) return <div className="pt-8 text-center animate-pulse text-muted-foreground uppercase text-xs font-bold tracking-widest">Elaborazione Statistiche Chirurugiche...</div>;

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 text-center space-y-4 px-6">
        <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center text-muted-foreground">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold">Nessun dato ancora</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Chiudi la tua prima serata per iniziare a vedere i grafici dei consumi e dei costi.</p>
      </div>
    );
  }


  // 2. Dati per Top Prodotti (Aggregati dai JSON detials)
  const productConsumption: Record<string, number> = {};
  reports.forEach(r => {
    r.details_json?.forEach((row: any) => {
      const name = row.product?.name || row.name;
      if (!name) return;
      if (!productConsumption[name]) productConsumption[name] = 0;
      productConsumption[name] += row.consumed || 0;
    });
  });


  // 3. Dati per Categorie (Pie Chart)
  const categoryCost: Record<string, number> = {};
  reports.forEach(r => {
    r.details_json?.forEach((row: any) => {
      const cat = row.product?.category || row.category || 'Altro';
      if (!categoryCost[cat]) categoryCost[cat] = 0;
      categoryCost[cat] += row.cost_value || 0;
    });
  });

  const categoryData = Object.entries(categoryCost)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 5. KPI Calcoli
  const totalEvents = reports.length;
  const totalCosts = reports.reduce((acc, r) => acc + (r.total_cost_consumed || 0), 0);
  const avgCostPerEvent = totalCosts / totalEvents;
  const totalVolume = reports.reduce((acc, r) => {
    return acc + (r.details_json?.reduce((sum: number, item: any) => sum + (item.consumed || 0), 0) || 0);
  }, 0);

  // 6. Top Prodotti per COSTO (non solo Q.tà)
  const productCosts: Record<string, number> = {};
  reports.forEach(r => {
    r.details_json?.forEach((row: any) => {
      const name = row.product?.name || row.name;
      if (!name) return;
      if (!productCosts[name]) productCosts[name] = 0;
      productCosts[name] += row.cost_value || 0;
    });
  });

  const topCostlyProducts = Object.entries(productCosts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 7. Trend Delta (confronto ultima serata con media)
  const lastEventCost = reports[reports.length - 1]?.total_cost_consumed || 0;
  const costTrend = lastEventCost > avgCostPerEvent ? 'up' : 'down';
  const costDiff = Math.abs(((lastEventCost - avgCostPerEvent) / avgCostPerEvent) * 100).toFixed(1);

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Activity className="text-primary w-5 h-5" />
          <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Analisi Business</h1>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50">Statistiche e Performance Operative</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 md:p-5 bg-white/5 border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-center opacity-60">
            <Calendar size={14} className="text-primary" />
            <span className="text-[8px] font-black uppercase">Totali</span>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-black text-white leading-tight">{totalEvents}</p>
            <p className="text-[8px] md:text-[9px] font-bold uppercase text-muted-foreground tracking-widest truncate">Serate Archiviate</p>
          </div>
        </Card>

        <Card className="p-3 md:p-5 bg-white/5 border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-center opacity-60">
            <Euro size={14} className="text-accent-green" />
            <span className={cn(
              "flex items-center text-[8px] font-black uppercase",
              costTrend === 'up' ? "text-accent-red" : "text-accent-green"
            )}>
              {costTrend === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {costDiff}%
            </span>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-black text-white leading-tight truncate">{formatCurrency(totalCosts)}</p>
            <p className="text-[8px] md:text-[9px] font-bold uppercase text-muted-foreground tracking-widest truncate">Costo Totale</p>
          </div>
        </Card>

        <Card className="p-3 md:p-5 bg-white/5 border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-center opacity-60">
            <TrendingUp size={14} className="text-accent-orange" />
            <span className="text-[8px] font-black uppercase">Media</span>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-black text-white leading-tight truncate">{formatCurrency(avgCostPerEvent)}</p>
            <p className="text-[8px] md:text-[9px] font-bold uppercase text-muted-foreground tracking-widest truncate">Costo x Serata</p>
          </div>
        </Card>

        <Card className="p-3 md:p-5 bg-white/5 border-white/5 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-center opacity-60">
            <Package size={14} className="text-blue-500" />
            <span className="text-[8px] font-black uppercase">Volume</span>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-black text-white leading-tight">{totalVolume.toLocaleString()}</p>
            <p className="text-[8px] md:text-[9px] font-bold uppercase text-muted-foreground tracking-widest truncate">Unità Consumate</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6">
        {/* Trend Area Chart - Unione Volume e Costo */}
        <Card className="p-5 border-white/5 bg-white/5 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">Performance Storica</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-accent-green"></div>
                <span className="text-[8px] font-bold uppercase text-muted-foreground">Costi (€)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-accent-orange"></div>
                <span className="text-[8px] font-bold uppercase text-muted-foreground">Volume</span>
              </div>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reports.map(r => ({
                name: r.event?.name.slice(0, 10),
                costo: r.total_cost_consumed,
                volume: r.details_json?.reduce((sum: number, item: any) => sum + (item.consumed || 0), 0) || 0
              })).slice(-10)}>
                <defs>
                  <linearGradient id="colorCosto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="costo" stroke="#10B981" fillOpacity={1} fill="url(#colorCosto)" strokeWidth={2} />
                <Area type="monotone" dataKey="volume" stroke="#F59E0B" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Grid per Category e Top Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Prodotti per COSTO */}
          <Card className="p-5 border-white/5 bg-white/5">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6">Prodotti ad alto impatto (€)</h3>
            <div className="space-y-4">
              {topCostlyProducts.map((p, idx) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-muted-foreground w-4">{idx + 1}.</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-bold text-white uppercase">{p.name}</span>
                      <span className="text-[10px] font-black text-accent-green">{formatCurrency(p.value)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent-green rounded-full opacity-80"
                        style={{ width: `${(p.value / topCostlyProducts[0].value) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Distribuzione spesa per categoria */}
          <Card className="p-5 border-white/5 bg-white/5 flex flex-col items-center">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary self-start mb-6">Spesa per Categoria</h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px' }}
                    formatter={(val: number) => formatCurrency(val)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 w-full">
              {categoryData.slice(0, 6).map((cat, idx) => (
                <div key={cat.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase truncate">{cat.name}</span>
                  <span className="text-[9px] font-black text-white ml-auto">{formatCurrency(cat.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Detailed Breakdown Table */}
        <Card className="border-white/5 bg-white/5 overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">Classifica Consumi (Volume)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8px] font-black uppercase text-muted-foreground tracking-widest border-b border-white/5 bg-white/[0.02]">
                  <th className="px-5 py-3">Prodotto</th>
                  <th className="px-5 py-3 text-right">Totale Unità</th>
                  <th className="px-5 py-3 text-right">Costo Generato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {Object.entries(productConsumption)
                  .map(([name, qty]) => ({ name, qty, cost: productCosts[name] || 0 }))
                  .sort((a, b) => b.qty - a.qty)
                  .slice(0, 10)
                  .map((p) => (
                    <tr key={p.name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-[10px] font-bold text-white uppercase">{p.name}</td>
                      <td className="px-5 py-4 text-right text-[10px] font-black text-accent-orange">{p.qty}</td>
                      <td className="px-5 py-4 text-right text-[10px] font-black text-accent-green">{formatCurrency(p.cost)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
