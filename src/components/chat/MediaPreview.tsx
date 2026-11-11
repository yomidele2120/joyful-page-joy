import { useState } from 'react';
import { Play, Maximize2, Download } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useSignedMediaUrl } from '@/hooks/useSignedMedia';

interface MediaPreviewProps {
  url: string;
  type: 'image' | 'video' | 'voice';
  isOwn: boolean;
}

export default function MediaPreview({ url: storedUrl, type }: MediaPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [broken, setBroken] = useState(false);
  const url = useSignedMediaUrl(storedUrl);

  if (!url) {
    return <div className="h-24 w-40 animate-pulse rounded-lg bg-secondary" />;
  }

  if (type === 'voice') {
    return (
      <audio controls className="max-w-[220px]" preload="metadata">
        <source src={url} />
      </audio>
    );
  }

  if (type === 'image') {
    return (
      <>
        <div className="relative cursor-pointer group" onClick={() => setFullscreen(true)}>
          <img src={url} alt="Shared image" className="max-w-[220px] max-h-[200px] rounded-lg object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
            <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent shadow-none">
            <img src={url} alt="Shared image" className="w-full h-full object-contain max-h-[90vh] rounded-lg" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === 'video') {
    // #t=0.1 makes phones paint the first frame (iOS ignores preload="metadata"); playsInline stops iPhones forcing full screen.
    const shown = `${url}${url.includes('#') ? '' : '#t=0.1'}`;
    if (broken) {
      return (
        <div className="max-w-[220px] rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
          <p>This video uses a format your phone cannot play.</p>
          <a href={url} download target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary">
            <Download className="h-3.5 w-3.5" /> Download video
          </a>
        </div>
      );
    }
    return (
      <>
        <div className="relative cursor-pointer group" onClick={() => setFullscreen(true)}>
          <video src={shown} className="max-w-[220px] max-h-[200px] min-h-[100px] rounded-lg bg-black object-cover" preload="metadata" playsInline muted onError={() => setBroken(true)} />
          <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center group-hover:bg-black/40 transition-colors">
            <Play className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 border-none bg-black">
            <video src={url} controls autoPlay playsInline className="w-full max-h-[85vh] rounded-lg" onError={() => { setFullscreen(false); setBroken(true); }} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
