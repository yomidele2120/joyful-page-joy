import logoHorizontal from '@/assets/brand/logo-horizontal.png';
import logoWelcome from '@/assets/brand/logo-welcome.png';
import { cn } from '@/lib/utils';

// IT Hub Africa logos. Both files are black artwork on a white background, so
// on themed surfaces they are blended: multiply drops the white in light mode,
// and invert + screen turns them into white-on-transparent in dark mode.
// On surfaces that are always white (the sign-in card) use `onWhite`.

export const BRAND_NAME = 'IT Hub Africa';

export function BrandLogo({ className, onWhite = false }: { className?: string; onWhite?: boolean }) {
  return (
    <img
      src={logoHorizontal}
      alt={BRAND_NAME}
      className={cn(
        'w-auto object-contain',
        !onWhite && 'mix-blend-multiply dark:invert dark:mix-blend-screen',
        className ?? 'h-9',
      )}
    />
  );
}

/** The "Welcome To IT Hub Africa" lock-up shown at the top of sign-in and sign-up pages. */
export function WelcomeLogo({ className }: { className?: string }) {
  return <img src={logoWelcome} alt={`Welcome to ${BRAND_NAME}`} className={cn('mx-auto w-auto object-contain', className ?? 'h-20')} />;
}

/** The horizontal logo inside a white pill, for dark backgrounds (footer, sidebars, auth pages). */
export function BrandLogoPill({ className, logoClassName }: { className?: string; logoClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-lg bg-white px-3 py-1.5 shadow-sm', className)}>
      <BrandLogo onWhite className={logoClassName ?? 'h-8'} />
    </span>
  );
}
