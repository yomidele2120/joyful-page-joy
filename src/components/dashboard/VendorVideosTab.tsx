import { useRef, useState } from 'react';
import { Film, Trash2, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useVendorPosts } from '@/hooks/usePosts';
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
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${vendorId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('post-videos').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('post-videos').getPublicUrl(path);

      const { error: insertError } = await supabase.from('posts').insert({
        vendor_id: vendorId,
        video_url: publicUrlData.publicUrl,
        caption: caption.trim() || null,
        product_id: productId || null,
      });
      if (insertError) throw insertError;

      toast.success('Video posted to the feed');
      setFile(null);
      setCaption('');
      setProductId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['vendor-posts', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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
      <div className="bg-card rounded-lg card-shadow p-4 space-y-3">
        <h3 className="font-heading font-semibold text-sm">Post a video</h3>
        <p className="text-xs text-muted-foreground">
          Short vertical videos (under {MAX_VIDEO_MB}MB) perform best — compress before uploading so it loads instantly for buyers.
        </p>

        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="text-sm" />

        <Textarea
          placeholder="Caption (optional)"
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
              <video src={post.video_url} className="h-full w-full object-cover" muted preload="metadata" />
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
