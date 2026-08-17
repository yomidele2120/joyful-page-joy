<<<<<<< HEAD
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
=======
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

/** Icon-only toggle, used in the desktop navbar. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
<<<<<<< HEAD
      className="w-8 h-8"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
      title="Toggle theme"
=======
      className={className}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

<<<<<<< HEAD
// Labeled row + switch, for menus/sheets where a bare icon button reads
// less clearly than an icon-button toggle does.
export function ThemeSwitchRow() {
=======
/** Labelled row with a switch, used inside menus/sheets. */
export function ThemeToggleRow() {
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
<<<<<<< HEAD
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        Dark Mode
=======
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <span className="flex items-center gap-2 text-sm font-medium">
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        Dark mode
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
      </span>
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label="Toggle dark mode"
      />
    </div>
  );
}
<<<<<<< HEAD
=======

export default ThemeToggle;
>>>>>>> 2febcb3d7aad58cf1d3d1f6567ff79008232febd
