# Happy Roof — Tampa Bay Roofing Contractor

Marketing website for Happy Roof LLC, a Tampa Bay roofing contractor.

## Tech Stack

- **[Astro](https://astro.build/)** — Static site generator
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first CSS
- **Vanilla JS** — Chat widget, form handling, analytics

## Development

```bash
npm install
npm run dev      # Start dev server at localhost:4321
npm run build    # Build to dist/
npm run preview  # Preview production build
```

## Project Structure

```
src/
  layouts/
    BaseLayout.astro     # Shared HTML shell (head, nav, footer, scripts)
  components/
    Nav.astro            # Site navigation
    Footer.astro         # Site footer
    GiveBackBanner.astro # Top banner
    MobileCTA.astro      # Sticky mobile call/estimate bar
    ExitPopup.astro      # Exit-intent popup
    Analytics.astro      # GTM event tracking
  pages/
    index.astro          # Homepage
    about.astro          # About page
    blog/                # Blog index + posts
    lp/                  # Landing pages
    [city]-roofing.astro # Location pages
    ...                  # All other pages
  styles/
    global.css           # Shared styles (buttons, cards, nav, etc.)
public/
  Brand Assets/          # Logos, photos
  chat.js                # Chat widget
  robots.txt
  sitemap.xml
```

## Deployment (Vercel)

Vercel should auto-detect the Astro framework. If not, set:
- **Framework Preset:** Astro
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

## Key Files

- `astro.config.mjs` — Astro configuration
- `tailwind.config.mjs` — Tailwind theme (brand colors, fonts)
- `src/layouts/BaseLayout.astro` — The single layout all pages share
- `src/styles/global.css` — All shared CSS classes
