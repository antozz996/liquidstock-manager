import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Users, Key, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { formatDateTime } from "../lib/formatters";

export default function Settings() {
  const { role, venueId } = useAuthStore();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [regCode, setRegCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!venueId) return;
    setIsLoading(true);
    
    // 1. Fetch Profiles per il locale corrente
    const { data: pData } = await supabase
      .from('profiles')
      .select('*')
      .eq('venue_id', venueId)
      .order('role', { ascending: true });
    if (pData) setProfiles(pData);

    // 2. Fetch Registration Code per il locale corrente
    const { data: cData } = await supabase
      .from('configs')
      .select('value')
      .eq('key', 'registration_code')
      .eq('venue_id', venueId)
      .single();
    
    if (cData) {
      setRegCode(cData.value);
    } else {
      setRegCode("NON CONFIGURATO");
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [venueId]);

  const handleUpdateCode = async () => {
    if (!venueId) return;
    if (!newCode || newCode.length < 4) {
      alert("Il codice deve essere di almeno 4 caratteri.");
      return;
    }
    const { error } = await supabase
      .from('configs')
      .upsert({ 
        key: 'registration_code', 
        value: newCode, 
        venue_id: venueId 
      }, { onConflict: 'key,venue_id' });
    
    if (!error) {
      setRegCode(newCode);
      setNewCode("");
      alert("✅ Codice di registrazione salvato correttamente!");
    } else {
      console.error(error);
      alert("Errore durante il salvataggio.");
    }
  };

  const handleDeleteProfile = async (id: string, pRole: string) => {
    if (pRole === 'admin') {
      alert("Non puoi eliminare un amministratore.");
      return;
    }
    if (!confirm("Sei sicuro di voler eliminare questo profilo? L'utente non potrà più accedere.")) return;
    
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) fetchData();
  };

  if (role !== 'admin' && role !== 'super_admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato agli amministratori.</div>;
  }

  if (!venueId && role === 'super_admin') {
    return (
      <div className="pt-24 text-center space-y-4 px-6">
        <div className="w-16 h-16 bg-accent-orange/10 rounded-full flex items-center justify-center text-accent-orange mx-auto">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-bold text-white uppercase italic tracking-tighter">Seleziona una struttura</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Per gestire il team o il codice di registrazione, seleziona prima una struttura dal menu in alto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Users className="text-primary w-5 h-5" />
        <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Gestione Team</h1>
      </div>

      <Card className="p-5 border-white/10 bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Key size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg leading-tight uppercase tracking-tight">Staff Code</h3>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none mt-1">Usato dallo Staff per registrarsi</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div className="flex gap-2">
            <div className="flex-1 bg-black/40 rounded-lg border border-white/10 px-4 flex items-center h-12">
              <span className="text-xl font-mono font-black tracking-widest text-primary italic">{regCode}</span>
            </div>
            <Button variant="outline" size="icon" className="h-12 w-12 border-white/10" onClick={fetchData}>
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
          
          <Button 
            variant="secondary" 
            className="w-full text-[10px] font-black uppercase tracking-widest h-10 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            onClick={() => {
              const link = `${window.location.origin}/register?v=${venueId}`;
              navigator.clipboard.writeText(`Ciao! Registrati su LiquidStock usando questo link: ${link} e il codice segreto: ${regCode}`);
              alert("✅ Link e codice d'invito copiati!");
            }}
          >
            Copia Messaggio Invito Staff
          </Button>
        </div>

        <div className="space-y-2 pt-3 border-t border-white/5">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Rigenera Codice</label>
          <div className="flex gap-2">
            <Input 
              placeholder="NUOVO CODICE..." 
              className="h-10 flex-1 bg-black/40 border-white/10"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
            />
            <Button size="sm" className="font-bold uppercase tracking-widest text-[10px]" onClick={handleUpdateCode}>Aggiorna</Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Membri del Team ({profiles.length})</h3>
        <div className="grid grid-cols-1 gap-2">
          {profiles.map(p => (
            <Card key={p.id} className="p-4 flex items-center justify-between border-white/5 bg-white/5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center",
                  p.role === 'admin' ? "bg-accent-orange/10 text-accent-orange" : "bg-white/10 text-muted-foreground"
                )}>
                  {p.role === 'admin' ? <ShieldCheck size={20} /> : <Users size={20} />}
                </div>
                <div>
                  <p className="font-bold text-white text-sm uppercase leading-tight">Utente {p.id.slice(0, 5)}</p>
                  <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest leading-none mt-1">{p.role} &bull; {formatDateTime(p.updated_at)}</p>
                </div>
              </div>
              
              {p.role !== 'admin' && p.role !== 'super_admin' && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-accent-red h-9 w-9"
                  onClick={() => handleDeleteProfile(p.id, p.role)}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}


function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
