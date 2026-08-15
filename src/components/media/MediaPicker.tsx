import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Images, Film, Layers, X, Loader2, Lock } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  MAX_IMAGES_PER_POST,
  fileKey,
  validateMediaFile,
  videoMetaFromFile,
} from '@/lib/mediaProcessing';
import {
  detectMode,
  formatDuration,
  loadDeviceLibrary,
  pickFromSystemGallery,
  type DeviceMedia,
  type GalleryMode,
} from '@/lib/nativeGallery';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface PickedMedia {
  id: string;
  file: File;
  kind: 'image' | 'video';
  preview: string;
  duration?: number;
}

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (media: PickedMedia[]) => void;
  /** Maximum images per selection — configurable per upload flow. */
  maxImages?: number;
}

type Filter = 'all' | 'image' | 'video';

interface GridItem {
  id: string;
  kind: 'image' | 'video';
  preview: string;
  duration?: number;
  load: () => Promise<File>;
}

// A WhatsApp-style in-app gallery. On iOS the device camera roll is listed
// directly in this grid; on Android the OS photo picker (a gallery, not the
// Files app) supplies the media, which is then curated here; on the web a
// file input stands in, since browsers cannot enumerate a camera roll.
export default function MediaPicker({
  open,
  onOpenChange,
  onConfirm,
  maxImages = MAX_IMAGES_PER_POST,
}: MediaPickerProps) {
  const [mode, setMode] = useState<GalleryMode | null>(null);
  const [items, setItems] = useState<GridItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedOnce = useRef(false);

  const toGridItems = (media: DeviceMedia[]): GridItem[] => media.map((m) => ({ ...m }));

  /** iOS: enumerate the camera roll straight into our grid. */
  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const media = await loadDeviceLibrary();
      setItems(toGridItems(media));
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Android: system photo picker → our curation grid. */
  const openSystemGallery = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const media = await pickFromSystemGallery(maxImages);
      if (media.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...media.filter((m) => !seen.has(m.id))];
        });
        setSelected((prev) => (prev.length ? prev : media.slice(0, 1).map((m) => m.id)));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('permission') || message.includes('denied')) setDenied(true);
    } finally {
      setLoading(false);
    }
  }, [maxImages]);

  /** Web fallback: files chosen from a file input. */
  const importFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const added: GridItem[] = [];

    for (const file of Array.from(fileList)) {
      const problem = validateMediaFile(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
      let preview = '';
      let duration: number | undefined;
      if (kind === 'image') {
        preview = URL.createObjectURL(file);
      } else {
        const meta = await videoMetaFromFile(file);
        preview = meta.poster ?? '';
        duration = meta.duration;
      }
      added.push({ id: fileKey(file), kind, preview, duration, load: async () => file });
    }

    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const deduped = added.filter((a) => !seen.has(a.id));
      if (deduped.length < added.length) toast.info('Some items were already added');
      return [...prev, ...deduped];
    });
  }, []);

  // Open straight into the device's media as soon as the sheet appears.
  useEffect(() => {
    if (!open) {
      startedOnce.current = false;
      return;
    }
    if (startedOnce.current) return;
    startedOnce.current = true;

    void (async () => {
      const detected = await detectMode();
      setMode(detected);
      if (detected === 'library') await loadLibrary();
      else if (detected === 'system-gallery') await openSystemGallery();
      else inputRef.current?.click();
    })();
  }, [open, loadLibrary, openSystemGallery]);

  useEffect(
    () => () => items.forEach((i) => i.preview.startsWith('blob:') && URL.revokeObjectURL(i.preview)),
    [items]
  );

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  );

  const selectedItems = useMemo(
    () => selected.map((id) => items.find((i) => i.id === id)).filter(Boolean) as GridItem[],
    [selected, items]
  );

  const toggle = (item: GridItem) => {
    setSelected((prev) => {
      if (prev.includes(item.id)) return prev.filter((id) => id !== item.id);

      const alreadyVideo = prev.some((id) => items.find((i) => i.id === id)?.kind === 'video');
      // Videos and image carousels are separate post types, so a selection
      // is either one video or up to maxImages images.
      if (item.kind === 'video') {
        if (prev.length) toast.info('A video is posted on its own');
        return [item.id];
      }
      if (alreadyVideo) {
        toast.info('A video is posted on its own');
        return [item.id];
      }
      if (prev.length >= maxImages) {
        toast.error(`Up to ${maxImages} images per post`);
        return prev;
      }
      return [...prev, item.id];
    });
  };

  const addMore = () => {
    if (mode === 'system-gallery') void openSystemGallery();
    else if (mode === 'library') void loadLibrary();
    else inputRef.current?.click();
  };

  const confirm = async () => {
    if (!selectedItems.length) return;
    setConfirming(true);
    try {
      const picked: PickedMedia[] = [];
      for (const item of selectedItems) {
        const file = await item.load();
        const problem = validateMediaFile(file);
        if (problem) {
          toast.error(`${file.name}: ${problem}`);
          continue;
        }
        picked.push({
          id: item.id,
          file,
          kind: item.kind,
          preview: item.preview || (item.kind === 'image' ? URL.createObjectURL(file) : ''),
          duration: item.duration,
        });
      }
      if (!picked.length) return;
      onConfirm(picked);
      setSelected([]);
      setItems([]);
      onOpenChange(false);
    } catch {
      toast.error('Could not read the selected media');
    } finally {
      setConfirming(false);
    }
  };

  const showEmptyState = !loading && !denied && items.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col gap-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,image/heic,image/heif,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <header className="flex items-center gap-3 px-4 pt-4 pb-3 border-b">
          <button onClick={() => onOpenChange(false)} aria-label="Close" className="-ml-1 p-1">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-heading font-semibold leading-tight">Select media</h2>
            <p className="text-[11px] text-muted-foreground">Recents</p>
          </div>
          <Button size="sm" className="ml-auto" onClick={confirm} disabled={!selectedItems.length || confirming}>
            {confirming && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Next{selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
          </Button>
        </header>

        <div className="flex items-center gap-2 px-4 py-3">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} icon={<Layers className="w-3.5 h-3.5" />} label="All" />
          <FilterChip active={filter === 'image'} onClick={() => setFilter('image')} icon={<Images className="w-3.5 h-3.5" />} label="Photos" />
          <FilterChip active={filter === 'video'} onClick={() => setFilter('video')} icon={<Film className="w-3.5 h-3.5" />} label="Videos" />
          <button onClick={addMore} className="ml-auto flex items-center gap-1.5 text-sm font-medium text-primary">
            <ImagePlus className="w-4 h-4" /> Add
          </button>
        </div>

        {selectedItems.length > 0 && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {selectedItems.map((m, i) => (
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
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Loading your gallery…</p>
            </div>
          )}

          {denied && !loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8 text-muted-foreground">
              <Lock className="w-8 h-8" />
              <p className="text-sm">
                Market Hub needs access to your photos and videos so you can post them to your shop.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={addMore}>Allow access</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.info('Open your phone Settings › Apps › Market Hub › Permissions to allow photos and videos.')}
                >
                  Open settings
                </Button>
              </div>
            </div>
          )}

          {showEmptyState && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8 text-muted-foreground">
              <ImagePlus className="w-8 h-8" />
              <p className="text-sm">No photos or videos found on this device yet.</p>
              <Button variant="outline" size="sm" onClick={addMore}>
                Browse gallery
              </Button>
            </div>
          )}

          {!loading && !denied && visible.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-0.5">
              {visible.map((item) => {
                const order = selected.indexOf(item.id);
                const isSelected = order >= 0;
                const duration = formatDuration(item.duration);
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
                      <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                        <Film className="w-3 h-3" />
                        {duration ?? ''}
                      </span>
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
