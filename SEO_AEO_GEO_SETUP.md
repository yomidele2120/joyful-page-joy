# SEO, AEO and GEO setup

AEO = answer engine optimisation (being the answer in Google, Bing and voice assistants). GEO = generative engine optimisation (being found and cited by AI assistants such as ChatGPT, Perplexity and Claude).

## Done in the code
- `public/robots.txt`: search and AI crawlers allowed, private areas closed (admin, dashboards, cart, orders, messages, API).
- `public/llms.txt`: a plain summary of the site and its key pages for AI assistants.
- `index.html`: Organization and WebSite structured data (with a search action), canonical link. Removed the wrong "Lovable" author and Twitter handle.
- FAQ page and the /sell page publish FAQPage structured data built from the visible answers.
- Each shop page publishes Organization structured data from the shop's public details. Product pages already had Product data.
- `vercel.json`: product pages are served as ready-made HTML to Google, Bing and AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot and others).
- Sitemap now lists approved shops and /sell.

## Only you can do
1. Google Search Console: submit https://www.ithubafrica.com/sitemap.xml. Check "Pages" for errors after a few days.
2. Bing Webmaster Tools: add the site (import from Search Console) and submit the sitemap. ChatGPT search and others lean on Bing's index.
3. Google Business Profile for the Ikeja office, with the same name, address and phone as in the footer.
4. Vercel: Firewall / Bot Protection must not block the AI crawlers listed above. If "Bot Protection" or "AI Bots" blocking is on, turn it off for them.
5. After deploying, test: Google Rich Results Test on the home page, /faq, /sell, one product and one shop.
6. Content is what gets cited: complete product titles, descriptions, brand, price and stock; supplier descriptions and locations; clear answers on /faq.

## Known limits
- Shop pages and the landing page are built in the browser. Google runs that code; many AI crawlers do not, so they only see the page shell and the structured data in index.html. Giving shop pages ready-made HTML (like products have) is the next improvement.
- Nobody can guarantee being cited by an AI assistant. These steps make it possible and easier.
