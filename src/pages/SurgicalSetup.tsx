import React, { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { ShieldAlert, Mail, Lock, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SurgicalSetup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { signUp, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Pulsante cliccato! Avvio inizializzazione...");
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("La password deve essere di almeno 6 caratteri.");
      return;
    }

    try {
      const { error } = await signUp(email, password, 'admin');
      if (error) {
        console.error("Errore ricevuto dal setup:", error);
        setErrorMsg("Errore durante il setup: " + (error.message || "Riprova."));
      } else {
        console.log("Successo! Admin creato.");
        alert("✅ Admin Registrato con Successo! Ora verrai reindirizzato.");
        navigate("/");
      }
    } catch (err) {
      console.error("Crash durante il setup:", err);
      setErrorMsg("Errore critico durante la registrazione.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0a]">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5"></div>
      
      <div className="w-full max-w-sm space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-accent-orange/10 rounded-full flex items-center justify-center text-accent-orange mb-4 border border-accent-orange/20">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Surgical Setup</h1>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Registrazione Primo Amministratore</p>
        </div>

        <Card className="p-6 border-muted/20 bg-card/40 backdrop-blur-md shadow-2xl">
          <form onSubmit={handleSetup} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Master</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input 
                  type="email"
                  placeholder="admin@liquidstock.it"
                  className="pl-10 h-12 bg-black/40 border-muted/20"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Password Sicura</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input 
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 h-12 bg-black/40 border-muted/20"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-center gap-2 text-xs text-accent-red">
                <AlertCircle size={14} />
                {errorMsg}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-sm font-bold uppercase tracking-tight bg-accent-orange hover:bg-accent-orange/90 text-black shadow-lg shadow-accent-orange/20"
              disabled={isLoading}
            >
              {isLoading ? "Creazione in corso..." : "Inizializza Sistema"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-medium uppercase leading-relaxed px-4">
          Questa pagina è ad uso esclusivo del proprietario. <br/>Una volta registrato l'admin, questa rotta diventerà inattiva.
        </p>
      </div>
    </div>
  );
}
