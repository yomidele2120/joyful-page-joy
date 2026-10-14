import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Json } from '@/integrations/supabase/types';
import { getMoq, unitPriceFor } from '@/lib/pricing';

export interface CartItem {
  id: string;
  name: string;
  /** Base unit price. The price actually charged depends on quantity - use unitPrice(item). */
  price: number;
  image_url: string | null;
  quantity: number;
  slug: string;
  moq: number;
  unit: string;
  price_tiers: Json;
}

export type NewCartItem = Pick<CartItem, 'id' | 'name' | 'price' | 'image_url' | 'slug'> &
  Partial<Pick<CartItem, 'moq' | 'unit' | 'price_tiers'>>;

interface CartContextType {
  items: CartItem[];
  addItem: (item: NewCartItem, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/** Unit price for the quantity currently in the cart (tier pricing applied). */
export function unitPrice(item: CartItem): number {
  return unitPriceFor(item, item.quantity);
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: NewCartItem, quantity?: number) => {
    const moq = getMoq({ price: item.price, moq: item.moq });
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + Math.max(1, quantity ?? 1) } : i);
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        slug: item.slug,
        moq,
        unit: item.unit || 'Piece',
        price_tiers: item.price_tiers ?? [],
        // A new line always starts at (at least) the minimum order quantity.
        quantity: Math.max(quantity ?? moq, moq),
      }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      // Never let a line drop below its MOQ - the remove button is for that.
      setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(quantity, i.moq) } : i));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + unitPrice(i) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
