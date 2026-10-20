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
