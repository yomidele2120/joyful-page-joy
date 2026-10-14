import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// "Inquiry basket": products a buyer wants to ask suppliers about before (or
// instead of) buying. Kept in this browser only; saved to localStorage when
// it is available.

export interface InquiryBasketItem {
  product_id: string;
  vendor_id: string;
  vendor_user_id: string | null;
  vendor_name: string | null;
  name: string;
  slug: string;
  image_url: string | null;
  quantity: number;
  moq: number;
}

interface InquiryBasketContextType {
  items: InquiryBasketItem[];
  add: (item: InquiryBasketItem) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  has: (productId: string) => boolean;
  count: number;
}

const STORAGE_KEY = 'markethub.inquiry-basket.v1';
const InquiryBasketContext = createContext<InquiryBasketContextType | undefined>(undefined);

function load(): InquiryBasketItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const InquiryBasketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<InquiryBasketItem[]>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can be blocked (private mode); the basket then lives in memory only.
    }
  }, [items]);

  const add = useCallback((item: InquiryBasketItem) => {
    setItems(prev => prev.some(i => i.product_id === item.product_id) ? prev : [...prev, item]);
  }, []);
  const remove = useCallback((productId: string) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  }, []);
  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: Math.max(1, Math.floor(quantity) || 1) } : i));
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((productId: string) => items.some(i => i.product_id === productId), [items]);

  return (
    <InquiryBasketContext.Provider value={{ items, add, remove, setQuantity, clear, has, count: items.length }}>
      {children}
    </InquiryBasketContext.Provider>
  );
};

export const useInquiryBasket = () => {
  const ctx = useContext(InquiryBasketContext);
  if (!ctx) throw new Error('useInquiryBasket must be used within InquiryBasketProvider');
  return ctx;
};
