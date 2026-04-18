import React, { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input } from "./ui/Input";
import { useProductStore } from "../store/useProductStore";
import type { Product } from "../types";

interface EditProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditProductModal({ product, isOpen, onClose }: EditProductModalProps) {
  const { updateProduct, isLoading } = useProductStore();
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    cost_price: 0,
    min_threshold: 0
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        category: product.category,
        cost_price: product.cost_price,
        min_threshold: product.min_threshold
      });
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProduct(product.id, formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-md bg-card border-muted/30">
        <div className="p-4 border-b border-muted/20 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Modifica {product.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Nome Prodotto</label>
            <Input 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Categoria</label>
            <Input 
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Prezzo Costo (€)</label>
              <Input 
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Soglia Riordino</label>
              <Input 
                type="number"
                value={formData.min_threshold}
                onChange={e => setFormData({...formData, min_threshold: parseInt(e.target.value)})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              <Save className="w-4 h-4 mr-2" />
              Salva Modifiche
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
