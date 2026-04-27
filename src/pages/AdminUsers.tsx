import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Search, Mail, Trash2, CheckCircle2, UserPlus, X, Lock, User, UserCog, ShieldCheck, Building2, Edit2, Save } from "lucide-react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/utils";

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
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | null>>({});
  
  // Create User Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "staff" as any,
    venueId: ""
  });
  const [isCreating, setIsCreating] = useState(false);

  // Rename state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

    setSaveStatus({ ...saveStatus, [userId]: 'saving' });

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
        setSaveStatus({ ...saveStatus, [userId]: 'saved' });
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [userId]: null })), 2000);
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
        setSaveStatus({ ...saveStatus, [userId]: 'saved' });
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [userId]: null })), 2000);
      }
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    setSaveStatus({ ...saveStatus, [userId]: 'saving' });
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    
    if (!error) {
      setProfiles(profiles.map(p => p.id === userId ? { ...p, role: newRole } : p));
      setSaveStatus({ ...saveStatus, [userId]: 'saved' });
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [userId]: null })), 2000);
    }
  };

  const handleUpdateVenue = async (userId: string, newVenueId: string) => {
    setSaveStatus({ ...saveStatus, [userId]: 'saving' });
    const { error } = await supabase
      .from('profiles')
      .update({ venue_id: newVenueId })
      .eq('id', userId);
    
    if (!error) {
      const venueName = venues.find(v => v.id === newVenueId)?.name || "Nessuno";
      setProfiles(profiles.map(p => p.id === userId ? { ...p, venue_id: newVenueId, venues: { name: venueName } } : p));
      setSaveStatus({ ...saveStatus, [userId]: 'saved' });
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [userId]: null })), 2000);
    }
  };

  const handleDeleteUser = async (userId: string, name: string | null) => {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente ${name || 'questo utente'}? Questa operazione lo rimuoverà anche da Supabase Auth.`)) return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (!error) {
      setProfiles(profiles.filter(p => p.id !== userId));
    } else {
      alert("Errore durante l'eliminazione dell'utente.");
    }
  };

  const { signUp } = useAuthStore();
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      alert("Tutti i campi sono obbligatori.");
      return;
    }

    setIsCreating(true);
    const { error } = await signUp(
      newUser.email, 
      newUser.password, 
      newUser.role, 
      newUser.venueId || undefined, 
      newUser.fullName
    );

    if (error) {
      alert(`Errore: ${error.message || "Impossibile creare l'utente."}`);
    } else {
      alert("Utente creato con successo! È stata inviata un'email di conferma (se abilitata). Il profilo apparirà tra pochi secondi.");
      setShowAddForm(false);
      setNewUser({ email: "", password: "", fullName: "", role: "staff", venueId: "" });
      setTimeout(fetchData, 2000); // Refresh list
    }
    setIsCreating(false);
  };

  const handleUpdateName = async (userId: string) => {
    if (!editingName.trim()) return;
    setSaveStatus({ ...saveStatus, [userId]: 'saving' });
    
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: editingName })
      .eq('id', userId);
    
    if (!error) {
      setProfiles(profiles.map(p => p.id === userId ? { ...p, full_name: editingName } : p));
      setEditingUserId(null);
      setSaveStatus({ ...saveStatus, [userId]: 'saved' });
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [userId]: null })), 2000);
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCog className="text-accent-orange w-5 h-5" />
          <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Gestione Utenti</h1>
        </div>
        <Button 
          onClick={() => setShowAddForm(!showAddForm)}
          variant={showAddForm ? "ghost" : "secondary"}
          className="h-9 px-3 gap-2 text-[10px] font-black uppercase tracking-widest border border-white/5"
        >
          {showAddForm ? <><X size={14} /> Annulla</> : <><UserPlus size={14} /> Nuovo Utente</>}
        </Button>
      </div>

      {showAddForm && (
        <Card className="p-5 border-primary/30 bg-primary/5 animate-in slide-in-from-top-4 duration-300">
          <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <UserPlus size={14} /> Registra Collaboratore
          </h3>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Nome Completo" 
                  className="pl-9 bg-black/40"
                  value={newUser.fullName}
                  onChange={e => setNewUser({...newUser, fullName: e.target.value})}
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="email"
                  placeholder="Email Aziendale" 
                  className="pl-9 bg-black/40"
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="password"
                  placeholder="Password (min 6 caratteri)" 
                  className="pl-9 bg-black/40"
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Ruolo</label>
                <select 
                  className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white"
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value})}
                >
                  <option value="staff">Staff</option>
                  <option value="osservatore">Osservatore</option>
                  <option value="admin">Titolare (Admin)</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Locale Assegnato</label>
                <select 
                  className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white"
                  value={newUser.venueId}
                  onChange={e => setNewUser({...newUser, venueId: e.target.value})}
                  required
                >
                  <option value="">Seleziona...</option>
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 font-black uppercase italic tracking-widest"
              disabled={isCreating}
            >
              {isCreating ? "Creazione in corso..." : "Crea Account"}
            </Button>
          </form>
        </Card>
      )}

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
                    {editingUserId === p.id ? (
                      <div className="flex items-center gap-2">
                        <Input 
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="h-8 py-0 px-2 text-xs w-40 bg-black/40"
                          autoFocus
                        />
                        <button onClick={() => handleUpdateName(p.id)} className="text-accent-green hover:scale-110 transition-transform">
                          <Save size={16} />
                        </button>
                        <button onClick={() => setEditingUserId(null)} className="text-muted-foreground hover:scale-110 transition-transform">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <h4 className="font-bold text-white uppercase tracking-tight">{p.full_name || "Utente Senza Nome"}</h4>
                        <button 
                          onClick={() => {
                            setEditingUserId(p.id);
                            setEditingName(p.full_name || "");
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground font-black uppercase opacity-60 flex items-center gap-1">
                      <Mail size={10} /> {p.id.slice(0, 12)}...
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={cn(
                    "px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border",
                    p.role === 'osservatore' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-accent-orange/10 text-accent-orange border-accent-orange/20"
                  )}>
                    {p.role}
                  </div>
                  {saveStatus[p.id] === 'saved' && (
                    <div className="flex items-center gap-1 text-[9px] font-black text-primary uppercase animate-in fade-in zoom-in duration-300">
                      <CheckCircle2 size={10} /> Salvato
                    </div>
                  )}
                  {p.id !== useAuthStore.getState().user?.id && (
                    <button 
                      onClick={() => handleDeleteUser(p.id, p.full_name)}
                      className="p-2 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      title="Elimina Utente"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
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
                    <option value="osservatore">Osservatore</option>
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
