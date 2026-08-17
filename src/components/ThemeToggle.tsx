import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

// A plain icon-button toggle for the desktop navbar. Reads/writes via
// next-themes so it stays in sync with the mobile menu's switch and
// persists across visits (next-themes handles localStorage + the
// prefers-color-scheme default on first load).
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the real theme after mount (it reads
  // localStorage/media-query client-side), so render a neutral icon
  // until then to avoid a hydration/flicker mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="w-8 h-8"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
      title="Toggle theme"
    >
      <span className="inline-flex" key={isDark ? 'sun' : 'moon'}>
        {isDark ? <Sun className="w-4 h-4 animate-icon-pop" /> : <Moon className="w-4 h-4 animate-icon-pop" />}
      </span>
    </Button>
  );
}

// Labeled row + switch, for menus/sheets where a bare icon button reads
// less clearly than an icon-button toggle does.
export function ThemeSwitchRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        <span className="inline-flex" key={isDark ? 'moon' : 'sun'}>
          {isDark ? <Moon className="w-4 h-4 animate-icon-pop" /> : <Sun className="w-4 h-4 animate-icon-pop" />}
        </span>
        Dark Mode
      </span>
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label="Toggle dark mode"
      />
    </div>
  );
}
