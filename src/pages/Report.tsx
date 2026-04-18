import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { formatCurrency, formatDate } from "../lib/formatters";
import { generateReportPDF } from "../lib/pdf";
import { ChevronLeft, Download, AlertTriangle, Edit2 } from "lucide-react";
import { useEventStore } from "../store/useEventStore";
import type { Event, Report as ReportType } from "../types";

export default function ReportPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { softEditReport, isLoading: isUpdating } = useEventStore();
  const [event, setEvent] = useState<Event | null>(null);
  const [report, setReport] = useState<ReportType | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReportData = async () => {
    if (!eventId) return;
    setLoading(true);

    const { data: evData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    const { data: repData } = await supabase
      .from('reports')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (evData) setEvent(evData as Event);
    if (repData) setReport(repData as ReportType);
    setLoading(false);
  };

  useEffect(() => {
    fetchReportData();
  }, [eventId]);

  const handleSoftEdit = async (productId: string, currentFinal: number) => {
    const newVal = prompt(`Nuova giacenza finale per il prodotto:`, currentFinal.toString());
    if (newVal === null || newVal === currentFinal.toString()) return;
    
    const note = prompt(`Motivazione della modifica (obbligatoria):`);
    if (!note || note.length < 3) {
      alert("La nota è obbligatoria per tracciare le modifiche (min 3 caratteri).");
      return;
    }

    await softEditReport(event!.id, report!.id, productId, parseFloat(newVal), note);
    fetchReportData(); // Refresh
  };

  if (loading) return <div className="pt-8 text-center animate-pulse">Caricamento report...</div>;
  if (!event || !report) return <div className="pt-8 text-center text-accent-red">Report non trovato.</div>;

  const canEdit = new Date() < new Date(event.is_editable_until || 0);

  return (
    <div className="pt-4 pb-24 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Riepilogo Serata</h1>
      </div>

      <Card className="p-4 bg-primary/10 border-primary/20">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white">{event.name}</h2>
            <p className="text-sm text-muted-foreground">{formatDate(event.date)}</p>
          </div>
          <Button size="sm" onClick={() => generateReportPDF(event, report)}>
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-muted/30 p-4 rounded-xl">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Costo Consumato</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(report.total_cost_consumed)}</p>
        </div>
        <div className="bg-card border border-muted/30 p-4 rounded-xl">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Ricavo Stimato</p>
          <p className="text-2xl font-bold text-accent-green">{formatCurrency(report.total_revenue_est)}</p>
        </div>
        <div className="bg-card border border-muted/30 p-4 rounded-xl col-span-2">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Margine Lordo</p>
          <p className="text-3xl font-bold text-white">{formatCurrency(report.total_margin)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center justify-between">
          Dettaglio Prodotti
          {canEdit && (
            <span className="text-[10px] font-bold text-accent-orange uppercase flex items-center gap-1">
              <AlertTriangle size={10} />
              Modificabile
            </span>
          )}
        </h3>
        <div className="space-y-3">
          {report.details_json.map((item: any, idx: number) => (
            <div key={idx} className="bg-card/50 border border-muted/20 p-3 rounded-lg flex justify-between items-center text-sm">
              <div>
                <p className="font-bold text-white">{item.product?.name || 'Prodotto'}</p>
                <p className="text-muted-foreground text-[10px]">
                  {item.initial_qty} → {item.final_qty} (Consumato: {item.consumed})
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-medium text-white">{formatCurrency(item.rev_value)}</p>
                  <p className="text-[10px] text-muted-foreground">Costo: {formatCurrency(item.cost_value)}</p>
                </div>
                {canEdit && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => handleSoftEdit(item.product_id, item.final_qty)}
                  >
                    <Edit2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
