import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FileText, Download, ChevronRight, Calendar as CalendarIcon, List, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Event, Report as ReportType } from "../types";
import { generateReportPDF } from "../lib/pdf";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths 
} from "date-fns";
import { it } from 'date-fns/locale';
import { cn } from "../lib/utils";

export default function HistoryArea() {
  const navigate = useNavigate();
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  // Logica Calendario
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getEventsForDay = (day: Date) => {
    return pastEvents.filter(ev => isSameDay(new Date(ev.date), day));
  };

  if (loading) return <div className="pt-8 text-center animate-pulse text-muted-foreground uppercase text-xs font-bold tracking-widest">Accesso Archivio Storico...</div>;

  return (
    <div className="pt-4 pb-20 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storico Serate</h1>
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-widest mt-1">Archivio Digitale Sessioni</p>
        </div>
        <div className="flex bg-card border border-muted/20 p-1 rounded-lg">
          <Button 
            variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <List size={16} />
          </Button>
          <Button 
            variant={viewMode === 'calendar' ? 'secondary' : 'ghost'} 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarIcon size={16} />
          </Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-4">
          {pastEvents.length === 0 ? (
            <div className="text-center py-20 bg-card/20 rounded-2xl border border-dashed border-muted/30">
              <p className="text-muted-foreground text-sm">Nessuna serata in archivio.</p>
            </div>
          ) : (
            pastEvents.map(ev => (
              <Card 
                key={ev.id} 
                className="p-4 flex items-center justify-between cursor-pointer hover:border-primary/40 active:scale-[0.98] transition-all"
                onClick={() => navigate(`/history/${ev.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{ev.name}</p>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">
                      {new Date(ev.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={(e) => downloadReport(e, ev)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted/30" />
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="p-4 border-muted/20 bg-card/40 backdrop-blur-sm">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-primary italic">
              {format(currentMonth, 'MMMM yyyy', { locale: it })}
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeftIcon size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRightIcon size={16} />
              </Button>
            </div>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
              <div key={day} className="text-[9px] font-black uppercase text-muted-foreground text-center py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());

              return (
                <div 
                  key={i} 
                  className={cn(
                    "relative aspect-square rounded-lg flex flex-col items-center justify-center border transition-all",
                    !isCurrentMonth ? "opacity-20 border-transparent" : "border-muted/10",
                    isToday ? "bg-primary/5 border-primary/30" : "bg-black/20",
                    dayEvents.length > 0 ? "border-accent-orange/50 cursor-pointer hover:bg-accent-orange/10" : "cursor-default"
                  )}
                  onClick={() => {
                    if (dayEvents.length > 0) {
                      navigate(`/history/${dayEvents[0].id}`);
                    }
                  }}
                >
                  <span className={cn(
                    "text-[11px] font-bold",
                    isToday ? "text-primary" : "text-white/70",
                    dayEvents.length > 0 && "text-accent-orange"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  {dayEvents.length > 0 && (
                    <div className="absolute bottom-1 w-1 h-1 rounded-full bg-accent-orange shadow-[0_0_4px_rgba(255,107,0,0.8)]" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-2 text-[9px] font-medium text-muted-foreground uppercase tracking-widest px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-orange" />
            <span>Giorni con serate registrate</span>
          </div>
        </Card>
      )}
    </div>
  );
}
