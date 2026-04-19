import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Building2, Plus, Copy, Trash2, Globe, ShieldCheck } from "lucide-react";
import { formatDateTime } from "../lib/formatters";

interface Venue {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
}

export default function AdminVenues() {
  const { role } = useAuthStore();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchVenues = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('venues')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setVenues(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchVenues();
  }, []);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setIsCreating(true);

    try {
      // 1. Crea il locale
      const { data: venue, error: vError } = await supabase
        .from('venues')
        .insert([{ name: newName, address: newAddress }])
        .select()
        .single();

      if (vError) throw vError;

      // 2. Crea il codice di registrazione predefinito per questo locale
      const defaultCode = `INVITO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      await supabase
        .from('configs')
        .insert([{ 
          key: 'registration_code', 
          value: defaultCode, 
          venue_id: venue.id 
        }]);

      alert(`✅ Struttura "${newName}" creata con successo!`);
      setNewName("");
      setNewAddress("");
      fetchVenues();
    } catch (err) {
      alert("Errore durante la creazione della struttura.");
    } finally {
      setIsCreating(false);
    }
  };

  const copyInviteLink = async (venueId: string) => {
    const link = `${window.location.origin}/register?v=${venueId}`;
    await navigator.clipboard.writeText(link);
    alert("✅ Link d'invito segreto copiato negli appunti!");
  };

  if (role !== 'super_admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato all'Amministratore Globale.</div>;
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-accent-orange w-5 h-5" />
        <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Console SaaS</h1>
      </div>

      <Card className="p-5 border-white/10 bg-white/5 backdrop-blur-md">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <Plus size={14} /> Nuova Struttura
        </h3>
        <form onSubmit={handleCreateVenue} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <Input 
              placeholder="NOME LOCALE (Es. Beach Club)" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-12 bg-black/40 border-white/10 text-white"
              required
            />
            <Input 
              placeholder="INDIRIZZO (Opzionale)" 
              value={newAddress}
              onChange={e => setNewAddress(e.target.value)}
              className="h-12 bg-black/40 border-white/10 text-white"
            />
          </div>
          <Button disabled={isCreating} className="w-full h-12 font-bold uppercase tracking-widest">
            {isCreating ? "Creazione in corso..." : "Attiva Nuova Licenza"}
          </Button>
        </form>
      </Card>

      <div className="space-y-4 pt-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Locali Attivi ({venues.length})</h3>
        <div className="grid grid-cols-1 gap-3">
          {venues.map((v) => (
            <Card key={v.id} className="p-4 border-white/5 bg-white/5 hover:border-accent-orange/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent-orange/10 flex items-center justify-center text-accent-orange border border-accent-orange/20">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-lg leading-tight uppercase tracking-tight">{v.name}</h4>
                    <p className="text-[10px] text-muted-foreground uppercase font-black opacity-60">ID: {v.id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 border-white/10"
                    onClick={() => copyInviteLink(v.id)}
                    title="Copia Link Invito"
                  >
                    <Copy size={16} />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Attivo dal {formatDateTime(v.created_at)}</span>
                </div>
                <div className="px-2 py-1 rounded bg-green-500/10 text-green-500 text-[9px] font-black uppercase tracking-widest border border-green-500/20">
                  Operativo
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
