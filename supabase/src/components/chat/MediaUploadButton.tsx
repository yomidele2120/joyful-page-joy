import { useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MediaUploadButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function MediaUploadButton({ onFileSelected, disabled }: MediaUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button type="button" size="icon" variant="ghost" onClick={() => inputRef.current?.click()} disabled={disabled} className="h-9 w-9">
        <ImageIcon className="w-4 h-4" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileSelected(file);
            e.target.value = '';
          }
        }}
      />
    </>
  );
}
