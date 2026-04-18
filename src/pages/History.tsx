import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FileText, Download } from "lucide-react";
import type { Event } from "../types";

export default function HistoryArea() {
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

  const downloadReport = (eventId: string) => {
    // Logica jsPDF qui
    alert("Funzionalità PDF in arrivo! Simulazione per l'evento: " + eventId);
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
            <Card key={ev.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-card border border-muted flex items-center justify-center text-primary">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">{ev.name}</p>
                  <p className="text-xs text-muted-foreground">Chiuso: {new Date(ev.closed_at!).toLocaleDateString('it-IT')}</p>
                </div>
              </div>
              <Button size="icon" variant="outline" onClick={() => downloadReport(ev.id)}>
                <Download className="w-4 h-4" />
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
