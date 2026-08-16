import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

interface PostForChart {
  id: string;
  created_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
}

const chartConfig = {
  views_count: { label: 'Views', color: 'hsl(var(--primary))' },
  likes_count: { label: 'Likes', color: 'hsl(var(--accent))' },
} satisfies ChartConfig;

// Views + likes per post, oldest to newest, so a vendor can see at a glance
// whether recent posts are landing better than older ones. Deliberately
// simple — per-post bars rather than a daily time series, since that's what
// the data we already store actually supports without a new aggregation job.
export default function PostsPerformanceChart({ posts }: { posts: PostForChart[] | undefined }) {
  if (!posts || posts.length < 2) return null;

  const data = [...posts]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-15)
    .map((p, i) => ({
      name: `#${i + 1}`,
      date: new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      views_count: p.views_count,
      likes_count: p.likes_count,
    }));

  return (
    <div className="bg-card rounded-lg card-shadow p-4">
      <h3 className="font-heading font-semibold text-sm mb-1">Post performance</h3>
      <p className="text-xs text-muted-foreground mb-3">Views and likes for your last {data.length} posts</p>
      <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
              />
            }
          />
          <Bar dataKey="views_count" fill="var(--color-views_count)" radius={2} />
          <Bar dataKey="likes_count" fill="var(--color-likes_count)" radius={2} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
