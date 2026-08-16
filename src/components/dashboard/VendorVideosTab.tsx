import { useState, useEffect } from 'react';
import {
  Film, Trash2, Upload, Loader2, Eye, Heart, MessageCircle, Users,
  ImagePlus, X, ArrowLeft, ArrowRight, AlertCircle, Images, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import MediaPicker, { type PickedMedia } from '@/components/media/MediaPicker';
import PostsPerformanceChart from '@/components/dashboard/PostsPerformanceChart';
import { supabase } from '@/integrations/supabase/client';
import { captureVideoThumbnail } from '@/lib/videoThumbnail';
import { compressImage, MAX_VIDEO_MB } from '@/lib/mediaProcessing';
import { uploadToCloudflareStream, StreamNotConfiguredError } from '@/lib/cloudflareStream';
import { useVendorPosts, useVendorFollowerCount } from '@/hooks/usePosts';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VendorVideosTabProps {
  vendorId: string;
  products: { id: string; name: string }[];
  autoOpenComposer?: boolean;
}

export default function VendorVideosTab({ vendorId, products, autoOpenComposer }: VendorVideosTabProps) {
  const queryClient = useQueryClient();
  const { data: posts, isLoading } = useVendorPosts(vendorId);
  const { data: followerCount } = useVendorFollowerCount(vendorId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Opened via the site-wide "+" button deep link (?tab=videos&compose=1)
  useEffect(() => {
    if (autoOpenComposer) setComposerOpen(true);
  }, [autoOpenComposer]);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [productId, setProductId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  const isVideoPost = media[0]?.kind === 'video';

  const move = (index: number, direction: -1 | 1) => {
    setMedia((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeAt = (id: string) => setMedia((prev) => prev.filter((m) => m.id !== id));

  const resetForm = () => {
    setMedia([]);
    setFailedIds([]);
    setCaption('');
    setProductId('');
    setProgress(0);
    setStatusText('');
    setComposerOpen(false);
    queryClient.invalidateQueries({ queryKey: ['vendor-posts', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
  };

  const publishVideo = async (item: PickedMedia) => {
    const file = item.file;
    setStatusText('Uploading video...');
    setProgress(20);

    // Cloudflare Stream first (adaptive HLS off a CDN), falling back to a
    // direct storage upload when Stream isn't configured.
    try {
      const result = await uploadToCloudflareStream(file);
      setProgress(80);
      const { error } = await supabase.from('posts').insert({
        vendor_id: vendorId,
        media_type: 'video',
        video_url: result.hlsUrl,
        hls_url: result.hlsUrl,
        stream_uid: result.uid,
        thumbnail_url: result.thumbnailUrl,
        caption: caption.trim() || null,
        product_id: productId || null,
      });
      if (error) throw error;
      return;
    } catch (streamErr) {
      if (!(streamErr instanceof StreamNotConfiguredError)) throw streamErr;
    }

    const ext = file.name.split('.').pop() || 'mp4';
    const path = `${vendorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('post-videos').upload(path, file);
    if (uploadError) throw uploadError;
    setProgress(70);

    const { data: publicUrlData } = supabase.storage.from('post-videos').getPublicUrl(path);

    // Best-effort poster frame — a failure here never blocks the post.
    let thumbnailUrl: string | null = null;
    try {
      const thumbBlob = await captureVideoThumbnail(file);
      if (thumbBlob) {
        const thumbPath = `${vendorId}/${Date.now()}-thumb.jpg`;
        const { error: thumbError } = await supabase.storage
          .from('post-videos')
          .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
        if (!thumbError) {
          thumbnailUrl = supabase.storage.from('post-videos').getPublicUrl(thumbPath).data.publicUrl;
        }
      }
    } catch {
      // non-fatal
    }

    setProgress(90);
    const { error: insertError } = await supabase.from('posts').insert({
      vendor_id: vendorId,
      media_type: 'video',
      video_url: publicUrlData.publicUrl,
      thumbnail_url: thumbnailUrl,
      caption: caption.trim() || null,
      product_id: productId || null,
    });
    if (insertError) throw insertError;
  };

  const publishImages = async (items: PickedMedia[]) => {
    const urls: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setStatusText(`Uploading image ${i + 1} of ${items.length}...`);
      setProgress(Math.round((i / items.length) * 85));
      try {
        const blob = await compressImage(item.file);
        const path = `${vendorId}/images/${Date.now()}-${i}.jpg`;
        const { error } = await supabase.storage
          .from('post-videos')
          .upload(path, blob, { contentType: blob.type || 'image/jpeg' });
        if (error) throw error;
        urls.push(supabase.storage.from('post-videos').getPublicUrl(path).data.publicUrl);
      } catch {
        // One bad file shouldn't cost the vendor the whole post.
        failed.push(item.id);
      }
    }

    setFailedIds(failed);
    if (!urls.length) throw new Error('None of the images could be uploaded. Please try again.');

    setStatusText('Publishing...');
    setProgress(95);
    const { error } = await supabase.from('posts').insert({
      vendor_id: vendorId,
      media_type: 'images',
      video_url: null,
      image_urls: urls,
      thumbnail_url: urls[0],
      caption: caption.trim() || null,
      product_id: productId || null,
    });
    if (error) throw error;

    if (failed.length) {
      toast.warning(`Posted with ${urls.length} image(s). ${failed.length} failed to upload.`);
    }
  };

  const handlePublish = async () => {
    if (!media.length) {
      toast.error('Select photos or a video first');
      return;
    }
    setUploading(true);
    setFailedIds([]);
    try {
      if (isVideoPost) await publishVideo(media[0]);
      else await publishImages(media);

      setProgress(100);
      toast.success('Posted to the feed');
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      setStatusText('');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={<Eye className="w-4 h-4" />} label="Views" value={sumField(posts, 'views_count')} />
        <MiniStat icon={<Heart className="w-4 h-4" />} label="Likes" value={sumField(posts, 'likes_count')} />
        <MiniStat icon={<MessageCircle className="w-4 h-4" />} label="Comments" value={sumField(posts, 'comments_count')} />
        <MiniStat icon={<Users className="w-4 h-4" />} label="Followers" value={followerCount ?? 0} />
      </div>

      <PostsPerformanceChart posts={posts} />

      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm">My posts</h3>
        <Button size="sm" onClick={() => setComposerOpen(true)} className="gap-1.5 rounded-full h-8">
          <Plus className="w-4 h-4" /> New post
        </Button>
      </div>

      <div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && posts?.length === 0 && (
          <button
            onClick={() => setComposerOpen(true)}
            className="w-full flex flex-col items-center justify-center py-10 text-muted-foreground gap-2 bg-card rounded-lg card-shadow active:scale-[0.99] transition-transform"
          >
            <Film className="w-8 h-8" />
            <p className="text-sm">No posts yet — tap to create your first one</p>
          </button>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {posts?.map((post) => (
            <div key={post.id} className="relative rounded-lg overflow-hidden bg-card card-shadow aspect-[9/16]">
              {post.thumbnail_url ? (
                <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : post.video_url ? (
                <video src={post.video_url} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <Images className="w-6 h-6 absolute inset-0 m-auto text-muted-foreground" />
              )}
              {post.media_type === 'images' && (post.image_urls?.length ?? 0) > 1 && (
                <span className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  1/{post.image_urls.length}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-2 flex justify-between items-center">
                <span>{post.likes_count} likes</span>
                <button onClick={() => handleDeletePost(post.id, queryClient, vendorId)} className="text-white/80 hover:text-white">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Drawer open={composerOpen} onOpenChange={setComposerOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>Create a post</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Share up to 10 photos as a swipeable carousel, or one short vertical video (under {MAX_VIDEO_MB}MB).
            </p>

            {media.length === 0 ? (
              <button
                onClick={() => setPickerOpen(true)}
                className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-2 text-muted-foreground active:scale-[0.99] transition-transform"
              >
                <ImagePlus className="w-7 h-7" />
                <span className="text-sm font-medium">Select photos or video</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    {isVideoPost ? <Film className="w-3.5 h-3.5" /> : <Images className="w-3.5 h-3.5" />}
                    {isVideoPost ? 'Video post' : `${media.length} image${media.length > 1 ? 's' : ''} · carousel`}
                  </span>
                  <button onClick={() => setPickerOpen(true)} className="text-xs font-medium text-primary" disabled={uploading}>
                    Change
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {media.map((m, i) => (
                    <div
                      key={m.id}
                      className={cn(
                        'relative h-24 w-20 shrink-0 rounded-md overflow-hidden bg-muted',
                        failedIds.includes(m.id) && 'ring-2 ring-destructive'
                      )}
                    >
                      {m.preview ? (
                        <img src={m.preview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Film className="w-5 h-5 absolute inset-0 m-auto text-muted-foreground" />
                      )}
                      {failedIds.includes(m.id) && (
                        <AlertCircle className="absolute inset-0 m-auto w-5 h-5 text-destructive" />
                      )}
                      {!uploading && (
                        <>
                          <button
                            onClick={() => removeAt(m.id)}
                            aria-label="Remove media"
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/90 flex items-center justify-center"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          {!isVideoPost && media.length > 1 && (
                            <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/50">
                              <button onClick={() => move(i, -1)} aria-label="Move left" className="p-1 text-white disabled:opacity-30" disabled={i === 0}>
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                              <span className="text-[10px] text-white self-center">{i + 1}</span>
                              <button onClick={() => move(i, 1)} aria-label="Move right" className="p-1 text-white disabled:opacity-30" disabled={i === media.length - 1}>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              placeholder="Caption (optional) — add #hashtags so buyers can discover this post"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
            />

            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Link a product (optional)" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {uploading && (
              <div className="space-y-1">
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">{statusText}</p>
              </div>
            )}

            <Button onClick={handlePublish} disabled={!media.length || uploading} className="w-full">
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {uploading ? 'Publishing...' : 'Publish post'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={(picked) => {
          setMedia(picked);
          setFailedIds([]);
        }}
      />
    </div>
  );
}

async function handleDeletePost(
  postId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  vendorId: string
) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    toast.error('Could not delete post');
    return;
  }
  queryClient.invalidateQueries({ queryKey: ['vendor-posts', vendorId] });
  queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
}

function sumField(posts: { [key: string]: unknown }[] | undefined, field: 'views_count' | 'likes_count' | 'comments_count'): number {
  if (!posts?.length) return 0;
  return posts.reduce((total, p) => total + (Number(p[field]) || 0), 0);
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg card-shadow p-3 flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-heading font-bold leading-tight">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}
