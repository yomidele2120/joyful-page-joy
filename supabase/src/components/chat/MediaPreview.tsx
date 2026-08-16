import { useState } from 'react';
import { X, Play, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MediaPreviewProps {
  url: string;
  type: 'image' | 'video' | 'voice';
  isOwn: boolean;
}

export default function MediaPreview({ url, type, isOwn }: MediaPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);

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
    return (
      <>
        <div className="relative cursor-pointer group" onClick={() => setFullscreen(true)}>
          <video src={url} className="max-w-[220px] max-h-[200px] rounded-lg object-cover" preload="metadata" />
          <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center group-hover:bg-black/40 transition-colors">
            <Play className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 border-none bg-black">
            <video src={url} controls autoPlay className="w-full max-h-[85vh] rounded-lg" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
