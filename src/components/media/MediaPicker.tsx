import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Images, Film, Layers, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  MAX_IMAGES_PER_POST,
  fileKey,
  validateMediaFile,
  videoPosterFromFile,
} from '@/lib/mediaProcessing';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface PickedMedia {
  id: string;
  file: File;
  kind: 'image' | 'video';
  preview: string;
}

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (media: PickedMedia[]) => void;
}

type Filter = 'all' | 'image' | 'video';

// An in-app, gallery-style media picker. The browser sandbox does not allow
// a web app to enumerate the device gallery on its own, so media is imported
// through the platform's own secure picker and then curated here: a thumbnail
// grid with numbered multi-select, previews, and reordering — the flow people
// expect from a social app, in Market Hub's own styling.
export default function MediaPicker({ open, onOpenChange, onConfirm }: MediaPickerProps) {
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const openedOnce = useRef(false);

  const importFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const added: PickedMedia[] = [];

    for (const file of incoming) {
      const problem = validateMediaFile(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      const id = fileKey(file);
      const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
      const preview = kind === 'image' ? URL.createObjectURL(file) : (await videoPosterFromFile(file)) ?? '';
      added.push({ id, file, kind, preview });
    }

    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const deduped = added.filter((a) => !seen.has(a.id));
      if (deduped.length < added.length) toast.info('Some items were already added');
      return [...prev, ...deduped];
    });
  }, []);

  // Open the device chooser as soon as the picker appears so it feels like
  // one continuous flow rather than two separate steps.
  useEffect(() => {
    if (open && !openedOnce.current && items.length === 0) {
      openedOnce.current = true;
      inputRef.current?.click();
    }
    if (!open) openedOnce.current = false;
  }, [open, items.length]);

  useEffect(() => () => items.forEach((i) => i.kind === 'image' && URL.revokeObjectURL(i.preview)), [items]);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  );

  const selectedMedia = useMemo(
    () => selected.map((id) => items.find((i) => i.id === id)).filter(Boolean) as PickedMedia[],
    [selected, items]
  );

  const toggle = (item: PickedMedia) => {
    setSelected((prev) => {
      if (prev.includes(item.id)) return prev.filter((id) => id !== item.id);

      const alreadyVideo = prev.some((id) => items.find((i) => i.id === id)?.kind === 'video');
      // Videos and image carousels are separate post types, so a selection
      // is either one video or up to MAX_IMAGES_PER_POST images.
      if (item.kind === 'video') {
        if (prev.length) toast.info('A video is posted on its own');
        return [item.id];
      }
      if (alreadyVideo) {
        toast.info('A video is posted on its own');
        return [item.id];
      }
      if (prev.length >= MAX_IMAGES_PER_POST) {
        toast.error(`Up to ${MAX_IMAGES_PER_POST} images per post`);
        return prev;
      }
      return [...prev, item.id];
    });
  };

  const confirm = () => {
    if (!selectedMedia.length) return;
    onConfirm(selectedMedia);
    setSelected([]);
    setItems([]);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col gap-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
          <h2 className="font-heading font-semibold">Select media</h2>
          <Button size="sm" onClick={confirm} disabled={!selectedMedia.length}>
            Next{selectedMedia.length > 1 ? ` (${selectedMedia.length})` : ''}
          </Button>
        </header>

        <div className="flex items-center gap-2 px-4 py-3">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} icon={<Layers className="w-3.5 h-3.5" />} label="All" />
          <FilterChip active={filter === 'image'} onClick={() => setFilter('image')} icon={<Images className="w-3.5 h-3.5" />} label="Photos" />
          <FilterChip active={filter === 'video'} onClick={() => setFilter('video')} icon={<Film className="w-3.5 h-3.5" />} label="Videos" />
          <button
            onClick={() => inputRef.current?.click()}
            className="ml-auto flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            <ImagePlus className="w-4 h-4" /> Add
          </button>
        </div>

        {selectedMedia.length > 0 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {selectedMedia.map((m, i) => (
              <div key={m.id} className="relative h-16 w-16 shrink-0 rounded-md overflow-hidden bg-muted">
                {m.preview ? (
                  <img src={m.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Film className="w-5 h-5 m-auto mt-5 text-muted-foreground" />
                )}
                <button
                  onClick={() => setSelected((prev) => prev.filter((id) => id !== m.id))}
                  aria-label="Remove"
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
                <span className="absolute bottom-0.5 left-0.5 text-[10px] font-semibold text-primary-foreground bg-primary rounded px-1">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-1 pb-6">
          {visible.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8 text-muted-foreground">
              <ImagePlus className="w-8 h-8" />
              <p className="text-sm">No media yet — bring in photos or videos from your device to get started.</p>
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Browse device
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-0.5">
              {visible.map((item) => {
                const order = selected.indexOf(item.id);
                const isSelected = order >= 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => toggle(item)}
                    className="relative aspect-square bg-muted overflow-hidden"
                  >
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={cn('h-full w-full object-cover transition-transform', isSelected && 'scale-95')}
                      />
                    ) : (
                      <Film className="w-6 h-6 absolute inset-0 m-auto text-muted-foreground" />
                    )}
                    {item.kind === 'video' && (
                      <Film className="absolute bottom-1 left-1 w-3.5 h-3.5 text-white drop-shadow" />
                    )}
                    <span
                      className={cn(
                        'absolute top-1.5 right-1.5 h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold',
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-white/90 bg-black/20'
                      )}
                    >
                      {isSelected ? (item.kind === 'video' ? <Check className="w-3 h-3" /> : order + 1) : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterChip({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
