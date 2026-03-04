# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## Mobile & Android WebView Testing 📱

This project has been updated with a **mobile-first responsive design** suitable for embedding inside an Android WebView. Follow the steps below when verifying the UI in a browser or the app:

1. **Run the development server**
   ```bash
   npm install
   npm run dev
   ```
   then open `http://localhost:5173` in your browser.

2. **Use your browser’s device emulator** (Chrome/Edge devtools or Safari) to switch between various phone and tablet sizes. Pay attention to:
   - Supplier shop pages (`/shop/:vendorId`) – header wraps vertically on narrow screens and the WhatsApp button is reachable.
   - Product grids – default to **1 column on small viewports**, expanding to 2/3/4/5 columns at `sm`, `md`, `lg`, `xl` breakpoints.
   - Product cards – images remain square, titles wrap/clamp to two lines, buttons stay at the bottom of each card and are tappable.
   - Navigation, search bar, menus and buttons should be comfortably tappable (minimum 44 × 44 px touch target).

3. **Scroll and rotate**: verify no horizontal scrollbars appear, text is never truncated or overlapped, and there’s no need to zoom to read content.

4. **Android WebView preview**
   - Build the web output `npm run build` and serve it locally (use `npm run preview`).
   - In your Android project or a test app, point a `WebView` to the development URL or the hosted preview. Confirm the layout matches the browser emulator exactly and that interactive components (links, buttons, forms) work as expected.
   - The WebView should render the same fonts/colors and keep the header/footer fixed.

5. **Additional checks**
   - Navigate through other pages (cart, checkout, dashboards) at small widths; ensure no broken layouts exist.
   - Ensure consistency of spacing, typography and color across the site.

Following these steps will verify that the design is fully mobile-responsive and ready for conversion into an Android application.

