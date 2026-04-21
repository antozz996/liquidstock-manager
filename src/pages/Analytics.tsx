import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from "recharts";
import { Card } from "../components/ui/Card";
import { formatCurrency } from "../lib/formatters";
import { TrendingUp, AlertCircle } from "lucide-react";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Analytics() {
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setIsLoading(true);
      const { data } = await supabase
        .from('reports')
        .select('*, event:events(name, date)')
        .order('generated_at', { ascending: true });
      
      if (data) setReports(data);
      setIsLoading(false);
    }
    fetchStats();
  }, []);

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

  // 4. Dati per Volume Consumato (Area Chart)
  const volumeData = reports.map(r => {
    const totalVolume = r.details_json.reduce((sum: number, item: any) => sum + (item.consumed || 0), 0);
    return {
      name: r.event?.name.slice(0, 10),
      volume: totalVolume
    };
  }).slice(-15); // Ultime 15 serate

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <TrendingUp className="text-primary w-5 h-5" />
        <h1 className="text-2xl font-bold tracking-tight">Analisi Consumi</h1>
      </div>

      <div className="grid gap-6">
        {/* Trend Volume Consumato - Area Chart */}
        <Card className="p-5 border-muted/20 bg-card/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={80} />
          </div>
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-6">Volume Totale Consumato (Unità)</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                  formatter={(val: number) => [val, "Unità"]}
                />
                <Bar dataKey="volume" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Trend Costi Serata - Line Chart */}
        <Card className="p-5 border-muted/20 bg-card/40">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-6">Andamento Costi Ultime Serate</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} tickFormatter={(val) => `€${val}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                  formatter={(val: number) => [formatCurrency(val), "Costo"]}
                />
                <Line type="monotone" dataKey="costo" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Grid per Category e Top Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Prodotti */}
          <Card className="p-5 border-muted/20 bg-card/40">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-6">Top 5 Prodotti</h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 8, fill: '#888' }} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                  />
                  <Bar dataKey="qty" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Distribuzione spesa per categoria */}
          <Card className="p-5 border-muted/20 bg-card/40">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-6">Distribuzione Spesa</h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                    formatter={(val: number) => formatCurrency(val)}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '8px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
