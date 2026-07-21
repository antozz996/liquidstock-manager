import { AlertCircle, X } from "lucide-react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportModal({ isOpen, onClose }: ImportModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-card border-muted/30 overflow-hidden">
        <div className="p-4 border-b border-muted/20 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Importazione prodotti</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-8 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-accent-orange/10 flex items-center justify-center text-accent-orange">
            <AlertCircle className="h-8 w-8" />
          </div>
          <p className="text-white font-semibold">
            Importazione Excel temporaneamente non disponibile
          </p>
          <p className="text-sm text-muted-foreground">
            I prodotti possono essere inseriti manualmente. La funzione di importazione sarà ripristinata dopo l’aggiornamento del parser.
          </p>
        </div>

        <div className="p-4 border-t border-muted/20 bg-muted/5">
          <Button className="w-full" onClick={onClose}>Chiudi</Button>
        </div>
      </Card>
    </div>
  );
}
