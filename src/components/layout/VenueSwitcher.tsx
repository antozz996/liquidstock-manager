import { useEffect, useState } from 'react';
import { Building2, ChevronRight, LayoutGrid, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

interface Venue {
  id: string;
  name: string;
}

export function VenueSwitcher() {
  const { role, venueId, switchVenue } = useAuthStore();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (role === 'super_admin') {
      fetchVenues();
    }
  }, [role]);

  const fetchVenues = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('venues').select('id, name');
    if (data) setVenues(data);
    setIsLoading(false);
  };

  if (role !== 'super_admin') return null;

  const currentVenue = venues.find(v => v.id === venueId);

  return (
    <div className="mb-6">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-orange/20 flex items-center justify-center text-accent-orange">
            <Building2 size={20} />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">Struttura Attiva</span>
            <h3 className="text-lg font-bold leading-none mt-1">{currentVenue?.name || 'Caricamento...'}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs font-medium uppercase tracking-tighter">Opzioni</span>
          <ChevronRight size={16} className={cn("transition-transform", isOpen && "rotate-90")} />
        </div>
      </div>

      {isOpen && (
        <div className="mt-2 grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <Link 
            to="/admin/venues" 
            onClick={() => setIsOpen(false)}
            className="p-3 rounded-xl bg-accent-orange/20 border border-accent-orange/40 text-accent-orange flex items-center gap-3 transition-all hover:bg-accent-orange/30 shadow-lg shadow-accent-orange/10"
          >
            <ShieldCheck size={18} />
            <span className="font-black uppercase tracking-widest text-[11px]">⚙️ Console Amministrazione SaaS</span>
          </Link>

          <div className="h-[1px] bg-white/5 my-1" />

          {venues.map((venue) => (
            <div
              key={venue.id}
              onClick={() => {
                if (venue.id !== venueId) switchVenue(venue.id);
                setIsOpen(false);
              }}
              className={cn(
                "p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer",
                venue.id === venueId 
                  ? "bg-white/10 border-white/20 text-white" 
                  : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
              )}
            >
              <LayoutGrid size={16} />
              <span className="font-bold">{venue.name}</span>
              {venue.id === venueId && <div className="ml-auto w-2 h-2 rounded-full bg-accent-orange shadow-[0_0_8px_rgba(255,107,0,0.8)]" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
