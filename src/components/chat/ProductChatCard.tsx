import { Link } from 'react-router-dom';
import { formatNaira } from '@/lib/format';
import { formatMoq } from '@/lib/pricing';

export interface ChatProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
  moq: number;
  unit: string;
}

// The product an inquiry or chat is about, shown inside the thread.
export default function ProductChatCard({ product, dark = false }: { product: ChatProduct; dark?: boolean }) {
  return (
    <Link
      to={`/product/${product.slug}`}
      className={`mb-2 flex w-60 max-w-full items-center gap-2 rounded-lg border p-2 ${
        dark ? 'border-primary-foreground/30 bg-primary-foreground/10' : 'border-border bg-background'
      }`}
    >
      <img src={product.image_url || '/placeholder.svg'} alt="" className="h-12 w-12 shrink-0 rounded-md bg-white object-contain" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{product.name}</span>
        <span className="block text-xs">{formatNaira(product.price)}</span>
        <span className={`block text-[10px] ${dark ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatMoq(product)}</span>
      </span>
    </Link>
  );
}
