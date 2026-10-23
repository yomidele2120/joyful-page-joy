# Flyers added

Hero slider (built-in slides, shown whole and never cropped, in this order):
1. Elevate your life (existing)  2. Buy now, pay later -> /pay-later  3. Clothing collection -> /category/fashion
4. Preorder kitchen utensils -> /preorders  5. Tech flatlay (existing)  6. Black Friday (existing)

Small "Make Money, be your own boss" badge:
- the "Sell to buyers across Nigeria" tile beside the hero slider
- the first step of the supplier sign-up page

Notes
- Built-in slides show only while fewer than 3 hero slides are uploaded in Admin > Flyers. Uploaded slides always come first.
- The clothing slide links to the category with the address "fashion". If your category uses another address, change `href` for
  `clothing` in `src/lib/brandFlyers.ts`.
- Images are in `src/assets/brand/` as WebP (about 110-160 KB each, down from about 1.9 MB).

Mobile agreement panel (Supplier dashboard): icon and text use the full width with the button underneath on phones; one row on
desktop. The warning text is now readable in dark mode, and the terms dialog fits the screen.

## Update: pinned slides and home-page badge
- The Pay later, clothing and preorder flyers are now **pinned** in the hero slider. Before, they were hidden as soon as 3 or more
  hero flyers were uploaded in Admin > Flyers, which is why they could be missing on a live site that already had uploads.
  Uploaded flyers still come first; the pinned three follow. Mark any other built-in flyer as pinned with `pinned: true` in `src/lib/brandFlyers.ts`.
- The "Make Money, be your own boss" badge also sits on the home page "Sell on IT Hub Africa" tile, which uploaded flyers cannot replace.
  (On the hero side tile it is still replaced when "Hero side tile" flyers are uploaded.)

## Update: hero side banners
The two tiles beside the hero slider ("Sell to buyers across Nigeria" and "Price drops on bulk favourites") are now designed
banners instead of plain colour blocks: `src/assets/brand/flyer-side-sell.webp` and `flyer-side-deals.webp` (1200 x 900, 4:3, about
40-50 KB each). Headline, subline and button are drawn into the picture, so edit the picture (not code) to change the wording.
- They link to `/supplier-signup` and `/products`. Change `href` for `sellSide` / `dealsSide` in `src/lib/brandFlyers.ts`.
- The "Make Money, be your own boss" badge is part of the sell banner. Uploading "Hero side tile" flyers in Admin > Flyers still replaces them.
- Everything important sits well inside the edges, so it is not cut off on phones (2 tiles side by side) or desktop (stacked column).
- The deals banner shows no percentage or price, because the tile only promises what the page shows: prices the seller has reduced.
