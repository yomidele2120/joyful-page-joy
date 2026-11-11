import { useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { needsVideoConversion, toPlayableVideo } from '@/lib/chatVideo';
import { Button } from '@/components/ui/button';

interface MediaUploadButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function MediaUploadButton({ onFileSelected, disabled }: MediaUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState<number | null>(null);

  const pick = async (picked: File) => {
    if (!(await needsVideoConversion(picked))) { onFileSelected(picked); return; }
    // Convert to a format every phone can play before sending.
    setConverting(0);
    const id = toast.loading('Preparing video so it plays on every phone...');
    const ready = await toPlayableVideo(picked, r => setConverting(Math.round(r * 100)));
    toast.dismiss(id);
    setConverting(null);
    onFileSelected(ready);
  };

  return (
    <>
      <Button type="button" size="icon" variant="ghost" onClick={() => inputRef.current?.click()} disabled={disabled || converting !== null} className="h-9 w-9" aria-label="Send photo or video">
        {converting !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void pick(file);
            e.target.value = '';
          }
        }}
      />
    </>
  );
}
