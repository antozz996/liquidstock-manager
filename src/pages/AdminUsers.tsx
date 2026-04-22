import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { ShieldCheck, UserCog, Building2, Search, Mail } from "lucide-react";
import { Input } from "../components/ui/Input";

interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  venue_id: string | null;
  venues: { name: string } | null;
}

interface Venue {
  id: string;
  name: string;
}

export default function AdminUsers() {
  const { role: myRole } = useAuthStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [venueAccess, setVenueAccess] = useState<Record<string, string[]>>({});

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Fetch Profiles with Venue info
    const { data: pData } = await supabase
      .from('profiles')
      .select('*, venues(name)')
      .order('full_name', { ascending: true });
    
    if (pData) setProfiles(pData as any);

    // 2. Fetch all Venues for the dropdown
    const { data: vData } = await supabase
      .from('venues')
      .select('id, name')
      .order('name', { ascending: true });
    
    if (vData) setVenues(vData);

    // 3. Fetch all access mapping
    const { data: aData } = await supabase.from('venue_access').select('user_id, venue_id');
    if (aData) {
      const mapping: Record<string, string[]> = {};
      aData.forEach(item => {
        if (!mapping[item.user_id]) mapping[item.user_id] = [];
        mapping[item.user_id].push(item.venue_id);
      });
      setVenueAccess(mapping);
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleAccess = async (userId: string, venueId: string) => {
    const current = venueAccess[userId] || [];
    const hasAccess = current.includes(venueId);

    if (hasAccess) {
      const { error } = await supabase
        .from('venue_access')
        .delete()
        .eq('user_id', userId)
        .eq('venue_id', venueId);
      
      if (!error) {
        setVenueAccess({
          ...venueAccess,
          [userId]: current.filter(id => id !== venueId)
        });
      }
    } else {
      const { error } = await supabase
        .from('venue_access')
        .insert([{ user_id: userId, venue_id: venueId }]);
      
      if (!error) {
        setVenueAccess({
          ...venueAccess,
          [userId]: [...current, venueId]
        });
      }
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    
    if (!error) {
      setProfiles(profiles.map(p => p.id === userId ? { ...p, role: newRole } : p));
    }
  };

  const handleUpdateVenue = async (userId: string, newVenueId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ venue_id: newVenueId })
      .eq('id', userId);
    
    if (!error) {
      const venueName = venues.find(v => v.id === newVenueId)?.name || "Nessuno";
      setProfiles(profiles.map(p => p.id === userId ? { ...p, venue_id: newVenueId, venues: { name: venueName } } : p));
    }
  };

  const filtered = profiles.filter(p => 
    (p.full_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (p.venues?.name?.toLowerCase() || "").includes(search.toLowerCase())
  );

  if (myRole !== 'super_admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato all'Amministratore Globale.</div>;
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <UserCog className="text-accent-orange w-5 h-5" />
        <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Gestione Utenti</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Cerca per nome o locale..." 
          className="pl-9 h-12 bg-white/5 border-white/10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1,2,3,5].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl"></div>)}
          </div>
        ) : (
          filtered.map(p => (
            <Card key={p.id} className="p-4 border-white/5 bg-white/5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white uppercase tracking-tight">{p.full_name || "Utente Senza Nome"}</h4>
                    <p className="text-[10px] text-muted-foreground font-black uppercase opacity-60 flex items-center gap-1">
                      <Mail size={10} /> {p.id.slice(0, 12)}...
                    </p>
                  </div>
                </div>
                <div className="px-2 py-1 rounded bg-accent-orange/10 text-accent-orange text-[9px] font-black uppercase tracking-widest border border-accent-orange/20">
                  {p.role}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cambia Ruolo</label>
                  <select 
                    className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white"
                    value={p.role}
                    onChange={(e) => handleUpdateRole(p.id, e.target.value)}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Titolare (Admin)</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cambia Locale</label>
                  <select 
                    className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white"
                    value={p.venue_id || ""}
                    onChange={(e) => handleUpdateVenue(p.id, e.target.value)}
                  >
                    <option value="">Nessun Locale</option>
                    {venues.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2">
                <Building2 size={12} />
                <span className="font-bold uppercase tracking-widest">Locale Principale: <span className="text-white">{p.venues?.name || "Nessuna Struttura"}</span></span>
              </div>

              <div className="pt-3 border-t border-white/5 space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-primary ml-1">Accessi Extra (Multi-Locale)</label>
                <div className="flex flex-wrap gap-1.5">
                  {venues.map(v => {
                    const isMain = p.venue_id === v.id;
                    const isExtra = (venueAccess[p.id] || []).includes(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => !isMain && handleToggleAccess(p.id, v.id)}
                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-all ${
                          isMain 
                            ? "bg-white/10 border-white/20 text-white cursor-default opacity-50" 
                            : isExtra 
                              ? "bg-primary/20 border-primary/40 text-primary shadow-lg shadow-primary/10" 
                              : "bg-black/20 border-white/5 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
