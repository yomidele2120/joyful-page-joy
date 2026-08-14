import { useRef, useState } from 'react';
import { Film, Trash2, Upload, Loader2, Eye, Heart, MessageCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { captureVideoThumbnail } from '@/lib/videoThumbnail';
import { uploadToCloudflareStream, StreamNotConfiguredError } from '@/lib/cloudflareStream';
import { useVendorPosts, useVendorFollowerCount } from '@/hooks/usePosts';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const MAX_VIDEO_MB = 60;

interface VendorVideosTabProps {
  vendorId: string;
  products: { id: string; name: string }[];
}

export default function VendorVideosTab({ vendorId, products }: VendorVideosTabProps) {
  const queryClient = useQueryClient();
  const { data: posts, isLoading } = useVendorPosts(vendorId);
  const { data: followerCount } = useVendorFollowerCount(vendorId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [productId, setProductId] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      toast.error('Please choose a video file');
      return;
    }
    if (selected.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`Video must be under ${MAX_VIDEO_MB}MB. Compress it first for faster loading.`);
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose a video first');
      return;
    }
    setUploading(true);
    try {
      // Try Cloudflare Stream first — gives us transcoded adaptive HLS
      // served off a CDN, which is what actually makes playback fast on a
      // weak connection. Falls back to a direct Supabase Storage upload
      // (works, just not adaptive) if Stream isn't configured yet.
      try {
        const result = await uploadToCloudflareStream(file);
        const { error: insertError } = await supabase.from('posts').insert({
          vendor_id: vendorId,
          video_url: result.hlsUrl,
          hls_url: result.hlsUrl,
          stream_uid: result.uid,
          thumbnail_url: result.thumbnailUrl,
          caption: caption.trim() || null,
          product_id: productId || null,
        });
        if (insertError) throw insertError;

        toast.success('Video posted to the feed');
        resetForm();
        return;
      } catch (streamErr) {
        if (!(streamErr instanceof StreamNotConfiguredError)) {
          throw streamErr;
        }
        // fall through to direct storage upload below
      }

      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${vendorId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('post-videos').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('post-videos').getPublicUrl(path);

      // Best-effort thumbnail capture — if it fails for any reason (unusual
      // codec, browser quirk) we still post the video, just without a
      // poster frame, rather than blocking the upload on it.
      let thumbnailUrl: string | null = null;
      try {
        const thumbBlob = await captureVideoThumbnail(file);
        if (thumbBlob) {
          const thumbPath = `${vendorId}/${Date.now()}-thumb.jpg`;
          const { error: thumbError } = await supabase.storage.from('post-videos').upload(thumbPath, thumbBlob, {
            contentType: 'image/jpeg',
          });
          if (!thumbError) {
            thumbnailUrl = supabase.storage.from('post-videos').getPublicUrl(thumbPath).data.publicUrl;
          }
        }
      } catch {
        // non-fatal, see comment above
      }

      const { error: insertError } = await supabase.from('posts').insert({
        vendor_id: vendorId,
        video_url: publicUrlData.publicUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption.trim() || null,
        product_id: productId || null,
      });
      if (insertError) throw insertError;

      toast.success('Video posted to the feed');
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setCaption('');
    setProductId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    queryClient.invalidateQueries({ queryKey: ['vendor-posts', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
  };

  const handleDelete = async (postId: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      toast.error('Could not delete video');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['vendor-posts', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={<Eye className="w-4 h-4" />} label="Views" value={sumField(posts, 'views_count')} />
        <MiniStat icon={<Heart className="w-4 h-4" />} label="Likes" value={sumField(posts, 'likes_count')} />
        <MiniStat icon={<MessageCircle className="w-4 h-4" />} label="Comments" value={sumField(posts, 'comments_count')} />
        <MiniStat icon={<Users className="w-4 h-4" />} label="Followers" value={followerCount ?? 0} />
      </div>

      <div className="bg-card rounded-lg card-shadow p-4 space-y-3">
        <h3 className="font-heading font-semibold text-sm">Post a video</h3>
        <p className="text-xs text-muted-foreground">
          Short vertical videos (under {MAX_VIDEO_MB}MB) perform best — compress before uploading so it loads instantly for buyers.
        </p>

        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="text-sm" />

        <Textarea
          placeholder="Caption (optional) — add #hashtags so buyers can discover this video"
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

        <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {uploading ? 'Uploading...' : 'Post video'}
        </Button>
      </div>

      <div>
        <h3 className="font-heading font-semibold text-sm mb-3">My videos</h3>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && posts?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2 bg-card rounded-lg card-shadow">
            <Film className="w-8 h-8" />
            <p className="text-sm">No videos posted yet</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {posts?.map((post) => (
            <div key={post.id} className="relative rounded-lg overflow-hidden bg-card card-shadow aspect-[9/16]">
              {post.thumbnail_url ? (
                <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <video src={post.video_url} className="h-full w-full object-cover" muted preload="metadata" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-2 flex justify-between items-center">
                <span>{post.likes_count} likes</span>
                <button onClick={() => handleDelete(post.id)} className="text-white/80 hover:text-white">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
