import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HeroSection from '../HeroSection';
import Footer from '../layout/Footer';

vi.mock('@/hooks/useProducts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>();
  return {
    ...actual,
    useCategories: () => ({ data: [] }),
    useMarketplaceStats: () => ({
      data: {
        vendorCount: 120,
        productCount: 4200,
      },
    }),
  };
});

vi.mock('@/contexts/ConsentContext', () => ({
  useConsent: () => ({ openPreferences: vi.fn() }),
}));

vi.mock('@/hooks/useMarketplace', () => ({
  useMarketplaceSettings: () => ({ data: { bnpl_section_visible: true, preorder_enabled: true } }),
  usePayLaterAvailable: () => false,
}));

describe('theme-stable marketing sections', () => {
  const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it('keeps the hero text in the fixed light palette', () => {
    renderWithRouter(<HeroSection />);

    expect(screen.getByRole('heading', { name: /Buy, Sell & Grow/i })).toHaveClass('text-white');
    expect(screen.getByText(/Nigeria's Online Marketplace/i)).toHaveClass('text-primary-foreground');
  });

  it('keeps the footer and quick links in the fixed dark palette', () => {
    renderWithRouter(<Footer />);

    expect(screen.getByRole('contentinfo')).toHaveClass('bg-[#0b1220]');
    expect(screen.getByText('Quick Links')).toHaveClass('text-white');
    expect(screen.getByText('All Products')).toHaveClass('text-white/80');
  });
});
