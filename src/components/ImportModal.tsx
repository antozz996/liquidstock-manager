import React, { useState } from "react";
import * as XLSX from "xlsx";
import { X, Upload, Check, AlertCircle } from "lucide-react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { useProductStore } from "../store/useProductStore";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { bulkAddProducts } = useProductStore();
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        if (json.length === 0) {
          setError("Il file sembra vuoto.");
          return;
        }

        // Mapping intelligente
        const mapped = json.map((row: any) => {
          const findKey = (keys: string[]) => {
            const rowKeys = Object.keys(row);
            return rowKeys.find(rk => keys.some(k => rk.toLowerCase().includes(k.toLowerCase())));
          };

          return {
            name: row[findKey(['nome', 'prodotto', 'articolo', 'name'])] || 'Senza Nome',
            category: row[findKey(['categoria', 'category', 'tipo', 'area'])] || 'Generale',
            unit: 'bt',
            cost_price: parseFloat(row[findKey(['costo', 'acquisto', 'cost'])] || 0),
            min_threshold: parseInt(row[findKey(['soglia', 'min', 'threshold', 'riordino'])] || 0),
          };
        });

        setFileData(mapped);
      } catch (err) {
        setError("Errore durante il caricamento del file. Assicurati che sia un file Excel valido.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nome", "Categoria", "Costo", "Soglia"],
      ["Gin Mare", "Gin", "25.50", "12"],
      ["Tonica Superfine", "Soft Drinks", "1.20", "48"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Prodotti_LiquidStock.xlsx");
  };

  const handleConfirm = async () => {
    if (!fileData) return;
    setLoading(true);
    try {
      await bulkAddProducts(fileData);
      onClose();
      setFileData(null);
    } catch (err) {
      setError("Errore durante l'inserimento dei prodotti nel database.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-card border-muted/30 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-muted/20 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Importa da Excel</h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={loading}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {!fileData ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-muted/30 rounded-xl p-10 flex flex-col items-center justify-center gap-4 hover:border-primary/50 transition-colors bg-muted/5">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-white font-medium">Seleziona un file Excel</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx o .xls supportati</p>
                </div>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  id="file-upload"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                <label 
                  htmlFor="file-upload" 
                  className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium h-9 px-3 bg-card text-white border border-muted hover:bg-muted transition-colors"
                >
                  Sfoglia Documenti
                </label>
                
                <button 
                  type="button"
                  onClick={downloadTemplate}
                  className="text-[10px] text-primary hover:underline mt-2 font-medium"
                >
                  Scarica il template d'esempio (.xlsx)
                </button>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-bold text-primary/80 uppercase">Istruzioni:</p>
                <p>Usa colonne con nomi chiari come "Nome", "Categoria", "Costo", "Soglia".</p>
                <p>Non preoccuparti se l'ordine è diverso, cercherò di trovarle io.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-accent-green/10 p-3 rounded-lg border border-accent-green/20">
                <p className="text-sm font-medium text-accent-green flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {fileData.length} prodotti trovati pronti per l'importazione.
                </p>
                <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setFileData(null)}>Cambia file</Button>
              </div>

              <div className="border border-muted/20 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/10 text-muted-foreground border-b border-muted/20 sticky top-0">
                    <tr>
                      <th className="p-2">Prodotto</th>
                      <th className="p-2">Cat</th>
                      <th className="p-2">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/10">
                    {fileData.slice(0, 20).map((p, i) => (
                      <tr key={i} className="text-white">
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2 opacity-60">{p.category}</td>
                        <td className="p-2 font-mono">{p.cost_price}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fileData.length > 20 && (
                  <p className="p-2 text-center text-[10px] text-muted-foreground bg-muted/5">
                    ... e altri {fileData.length - 20} prodotti
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-center gap-2 text-sm text-accent-red">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-muted/20 bg-muted/5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={loading}>Annulla</Button>
          <Button 
            className="flex-1" 
            disabled={!fileData || loading} 
            onClick={handleConfirm}
          >
            {loading ? "Caricamento..." : "Conferma Importazione"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
