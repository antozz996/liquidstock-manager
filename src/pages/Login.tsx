import React, { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { Lock, Mail, AlertCircle } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { signIn, isLoading } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    
    if (!email || !password) {
      setErrorMsg("Inserisci email e password.");
      return;
    }

    const { error } = await signIn(email, password);
    if (error) {
      setErrorMsg("Credenziali non valide. Riprova.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0a]">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-sm space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4 border border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">
            <Lock size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">LiquidStock</h1>
          <p className="text-muted-foreground text-sm font-medium">Controllo Chirurgico Inventario</p>
        </div>

        <Card className="p-6 border-muted/20 bg-card/40 backdrop-blur-md shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Aziendale</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input 
                  type="email"
                  placeholder="admin@liquidstock.it"
                  className="pl-10 h-12 bg-black/40 border-muted/20 focus:border-primary/50 transition-all font-medium"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input 
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 h-12 bg-black/40 border-muted/20 focus:border-primary/50 transition-all font-medium"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-xs text-red-400 animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={14} />
                {errorMsg}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-sm font-bold uppercase tracking-tight shadow-lg shadow-primary/20"
              disabled={isLoading}
            >
              {isLoading ? "Verifica in corso..." : "Accedi al Pannello"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em]">
          Area Protetta &bull; Sistemi di Sicurezza Attivi
        </p>
      </div>
    </div>
  );
}
