import { useEffect, useState } from 'react';
import { Building2, ChevronRight, LayoutGrid, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

interface Venue {
  id: string;
  name: string;
}

export function VenueSwitcher() {
  const { role, actualRole, venueId, switchVenue, setRole, user } = useAuthStore();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const isSuperAdmin = actualRole === 'super_admin' || role === 'super_admin';

  useEffect(() => {
    fetchVenues();
  }, [isSuperAdmin, user?.id]);

  const fetchVenues = async () => {
    if (isSuperAdmin) {
      const { data } = await supabase.from('venues').select('id, name').order('name');
      if (data) setVenues(data);
    } else {
      // Per gli Admin/Staff, cerchiamo nella tabella venue_access
      const { data } = await supabase
        .from('venue_access')
        .select('venue_id, venues(id, name)')
        .eq('user_id', user?.id);
      
      if (data) {
        const accessibleVenues = data.map((item: any) => item.venues).filter(Boolean);
        setVenues(accessibleVenues);
      }
    }
  };

  if (!isSuperAdmin && venues.length <= 1) return null;

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
            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">
              Struttura Attiva {role !== actualRole && <span className="text-primary">(VISTA {role})</span>}
            </span>
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
          {isSuperAdmin && (
            <>
              <Link 
                to="/admin/users" 
                onClick={() => setIsOpen(false)}
                className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center gap-3 transition-all hover:bg-primary/20 shadow-lg shadow-primary/10"
              >
                <UserCog size={18} />
                <span className="font-black uppercase tracking-widest text-[11px]">👥 Gestione Utenti Globale</span>
              </Link>

              <Link 
                to="/admin/venues" 
                onClick={() => setIsOpen(false)}
                className="p-3 rounded-xl bg-accent-orange/20 border border-accent-orange/40 text-accent-orange flex items-center gap-3 transition-all hover:bg-accent-orange/30 shadow-lg shadow-accent-orange/10"
              >
                <ShieldCheck size={18} />
                <span className="font-black uppercase tracking-widest text-[11px]">⚙️ Gestione Locali (SaaS)</span>
              </Link>

              {/* Anteprima Ruoli per Super Admin */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <LayoutGrid size={12} className="text-primary" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">Anteprima Ruolo</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setRole('staff')}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                      (role as string) === 'staff' ? "bg-primary text-white border-primary" : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                  >
                    Staff
                  </button>
                  <button 
                    onClick={() => setRole('admin')}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                      (role as string) === 'admin' ? "bg-primary text-white border-primary" : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                  >
                    Admin
                  </button>
                  <button 
                    onClick={() => setRole('super_admin')}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                      (role as string) === 'super_admin' ? "bg-accent-orange text-white border-accent-orange shadow-[0_0_10px_rgba(255,107,0,0.4)]" : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                  >
                    Super Admin
                  </button>
                </div>
              </div>

              <div className="h-[1px] bg-white/5 my-1" />
            </>
          )}

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
