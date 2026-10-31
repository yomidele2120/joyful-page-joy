# Sharing a video, and linking a product to a video

## Sharing
- Every video has a Share button (in the feed, and on each post in the supplier's "My posts" grid).
- On a phone it opens the normal share sheet (WhatsApp, Telegram, ...). Where that is not available the link is copied.
- The link is `https://YOUR-SITE/feed?post=<video id>`. Anyone can open it, signed in or not: the feed starts on that exact
  video and the viewer can keep swiping to more. If the shop has removed the video the page says so.
- Link previews: when the link is pasted into WhatsApp, Facebook, Telegram, X, LinkedIn, Slack and similar apps, those apps
  fetch a small page from `api/share.ts` (vercel.json sends only their robots there) so the chat shows the shop name, the
  caption and the video's thumbnail. People never see that page.

### To check after deploying
1. Deploy to Vercel (the function needs the project's existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
   environment variables, which are already set for the website).
2. Open `https://YOUR-SITE/api/share?id=<a real video id>` in a browser: you should see a plain link, and "View source" shows the og: tags.
3. Paste a shared video link into WhatsApp. WhatsApp keeps previews for a while, so use a video you have not shared before.
   Facebook's "Sharing Debugger" can re-check a link and clear its saved copy.
Previews only work on the deployed site (not on localhost), and only for videos that are live.

## Linking a product to a video
- In "Create a post" the product box is now a search: type part of the product's name (or SKU) and pick it. With nothing typed it
  lists the newest products. It searches the supplier's whole shop (the old list stopped at their newest 100 products).
- Only products that are live in the shop can be linked, so a shopper tapping the product card always lands on a real page.
- The chosen product shows with its picture and price, can be changed or removed, and is kept in the saved draft.
