import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  fallback?: string;
  label?: string;
  className?: string;
}

export default function BackButton({ fallback = '/', label, className }: BackButtonProps) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      aria-label="Go back"
      className={cn('gap-1 px-2 text-muted-foreground hover:text-foreground', className)}
    >
      <ArrowLeft className="w-5 h-5" />
      {label && <span className="text-sm">{label}</span>}
    </Button>
  );
}
