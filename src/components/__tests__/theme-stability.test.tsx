import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HeroSection from '../HeroSection';
import Footer from '../layout/Footer';

vi.mock('@/hooks/useProducts', () => ({
  useMarketplaceStats: () => ({
    data: {
      vendorCount: 120,
      productCount: 4200,
    },
  }),
}));

describe('theme-stable marketing sections', () => {
  it('keeps the hero text in the fixed light palette', () => {
    render(<HeroSection />);

    expect(screen.getByRole('heading', { name: /Buy, Sell & Grow/i })).toHaveClass('text-white');
    expect(screen.getByText(/Nigeria's Online Marketplace/i)).toHaveClass('text-primary-foreground');
  });

  it('keeps the footer and quick links in the fixed dark palette', () => {
    render(<Footer />);

    expect(screen.getByRole('contentinfo')).toHaveClass('bg-[#0b1220]');
    expect(screen.getByText('Quick Links')).toHaveClass('text-white');
    expect(screen.getByText('All Products')).toHaveClass('text-white/80');
  });
});
