import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FileText, Download, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Event, Report as ReportType } from "../types";
import { generateReportPDF } from "../lib/pdf";

export default function HistoryArea() {
  const navigate = useNavigate();
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });
      if (data) setPastEvents(data as Event[]);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const downloadReport = async (e: React.MouseEvent, event: Event) => {
    e.stopPropagation();
    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('event_id', event.id)
      .single();
    
    if (report) {
      generateReportPDF(event, report as ReportType);
    } else {
      alert("Report non trovato per questo evento.");
    }
  }

  if (loading) return <div className="pt-8 text-center animate-pulse">Caricamento storico...</div>;

  return (
    <div className="pt-4 pb-20 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Storico Serate</h1>
      <p className="text-muted-foreground text-sm">Visualizza i report passati e scarica i PDF dei consumi chiusi.</p>

      <div className="space-y-4 mt-6">
        {pastEvents.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nessun evento chiuso trovato.</p>
        ) : (
          pastEvents.map(ev => (
            <Card 
              key={ev.id} 
              className="p-4 flex items-center justify-between cursor-pointer active:bg-muted/10 transition-colors"
              onClick={() => navigate(`/history/${ev.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-card border border-muted/30 flex items-center justify-center text-primary">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">{ev.name}</p>
                  <p className="text-xs text-muted-foreground">Chiuso: {new Date(ev.closed_at!).toLocaleDateString('it-IT')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" onClick={(e) => downloadReport(e, ev)}>
                  <Download className="w-4 h-4 text-muted-foreground" />
                </Button>
                <ChevronRight className="w-4 h-4 text-muted/30" />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
