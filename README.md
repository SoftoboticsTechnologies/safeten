# Safeten — static website

Plain HTML/CSS/JS. No build step, no backend.

## Run locally
Browsers block `fetch('products.json')` from `file://`, so use any static server:

    npx serve .            # or
    python -m http.server

Then open the printed address (e.g. http://localhost:3000).

## Settings you will want to change
| What | Where |
|---|---|
| WhatsApp number | `js/whatsapp.js` → `WHATSAPP_NUMBER` (digits only, e.g. `919876543210`) |
| Phone, email, address | `js/whatsapp.js` → `CONTACT` |
| Homepage featured products & order | `js/products.js` → `FEATURED_PRODUCT_IDS` |
| Brand colours | `css/style.css` → `:root` variables |

## Updating products
Replace `products.json` with a new WooCommerce export (same columns). Variations are
attached to their parent automatically by name ("Parent name - 1 KG"), and categories,
filters and price ranges are rebuilt from the file.

## Images
- Product images load from the URLs in `products.json` (currently safeten.co.in).
  If the WordPress site goes offline, download them into `assets/images/products/`
  and update the `Images` column.
- Certifications: the homepage cards use `msme.jpeg`, `iso-9001.jpeg`, `govt-of-india.jpeg`,
  `iso-45001.jpeg` and `gem.jpeg` in `assets/certifications/` (shown uncropped; click to enlarge).
- Client logos (`assets/clients/`) and hero banners (`assets/banners/`) were taken from the
  reference screenshots; replace them with original high-resolution files when available.
