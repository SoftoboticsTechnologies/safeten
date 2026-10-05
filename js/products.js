/* ==========================================================================
   Products — data loading, normalisation and rendering
   Source: products.json (WooCommerce CSV export converted to JSON)

   Fields present in the export:
     ID, Type (simple | variable | variation), SKU, Name, Published,
     Description (HTML + escaped line breaks), Stock, Sale price,
     Regular price, Categories ("Parent > Child, ..."), Images (comma list),
     Attribute 1..3 name / value(s) / visible / global / default
   The export has no "Parent" or "Short description" column, so variations
   are linked to their parent by name ("<Parent name> - <value>") and the
   short description is derived from the description.
   ========================================================================== */

const PRODUCTS_URL = "./products.json";

/* Order of the homepage "Featured" grid. IDs only — product data still comes
   from products.json. Unknown IDs are skipped; if none match, the first
   published products are used instead. */
const FEATURED_PRODUCT_IDS = [
  "2076", "2097", "2095", "2092", "1138", "2088",
  "2168", "2165", "2162", "2159", "2156", "2080"
];
const FEATURED_LIMIT = 12;

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <rect width="400" height="400" fill="#F5F7FA"/>
      <path d="M200 120l60 24v46c0 40-26 74-60 86-34-12-60-46-60-86v-46z" fill="none" stroke="#C7CFDA" stroke-width="8" stroke-linejoin="round"/>
      <path d="M176 196l18 18 32-36" fill="none" stroke="#ED1C24" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="200" y="316" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#8A95A5">Image coming soon</text>
    </svg>`
  );

/* ---------- Small helpers ---------- */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function field(raw, ...keys) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function splitList(value) {
  // WooCommerce escapes literal commas inside values as "\,"
  return String(value || "")
    .split(/(?<!\\),/)
    .map((item) => item.replace(/\\,/g, ",").trim())
    .filter(Boolean);
}

function toPrice(value) {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const rupee = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatPrice(amount) {
  return amount == null ? "" : `₹${rupee.format(amount)}`;
}

function slugify(text) {
  return String(text).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Fall back to the placeholder instead of a broken-image icon. */
function handleImageError(img) {
  if (img.dataset.fallback) return;
  img.dataset.fallback = "1";
  img.src = PLACEHOLDER_IMAGE;
}
window.handleImageError = handleImageError;

/* ---------- Description cleanup ---------- */

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H3", "H4", "H5", "SPAN"]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON"]);

function normaliseLineBreaks(text) {
  return String(text || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n") // escaped sequences left by the CSV export
    .replace(/\r\n?/g, "\n")
    .trim();
}

function sanitizeHTML(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node) => {
    [...node.children].forEach((el) => {
      if (DROP_TAGS.has(el.tagName)) { el.remove(); return; }
      walk(el);
      if (!ALLOWED_TAGS.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function descriptionToHTML(text) {
  if (!text) return "";
  const html = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (/^<(p|ul|ol|h\d)[\s>]/i.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`))
    .join("");
  return sanitizeHTML(html);
}

function htmlToText(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return (tpl.content.textContent || "").replace(/\s+/g, " ").trim();
}

function truncate(text, max = 150) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = cut.lastIndexOf(". ");
  if (sentenceEnd > max * 0.55) return cut.slice(0, sentenceEnd + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\-–]$/, "") + "…";
}

function deriveShortDescription(rawShort, descriptionText, name) {
  if (rawShort) return truncate(htmlToText(descriptionToHTML(normaliseLineBreaks(rawShort))), 160);
  const blocks = descriptionText.split(/\n{2,}/).map((b) => htmlToText(b)).filter(Boolean);
  const first = blocks.find((b) => b.length > 30 && b.toLowerCase() !== name.toLowerCase()) || blocks[0] || "";
  return truncate(first, 150);
}

/* ---------- Normalisation ---------- */

function parseCategories(value) {
  return splitList(value).map((path) => path.split(">").map((part) => part.trim()).filter(Boolean)).filter((p) => p.length);
}

function parseAttributes(raw) {
  const attributes = [];
  for (let i = 1; i <= 6; i += 1) {
    const name = field(raw, `Attribute ${i} name`);
    const values = splitList(field(raw, `Attribute ${i} value(s)`));
    if (!name || !values.length) continue;
    attributes.push({
      name,
      values,
      default: field(raw, `Attribute ${i} default`),
      visible: field(raw, `Attribute ${i} visible`) !== "0"
    });
  }
  return attributes;
}

function parseStock(raw) {
  const flag = field(raw, "In stock?", "Stock status");
  const qty = field(raw, "Stock");
  const quantity = qty !== "" && Number.isFinite(Number(qty)) ? Number(qty) : null;
  let inStock = null; // null = not tracked in the export
  if (flag !== "") inStock = flag === "1" || /^instock$|^yes$/i.test(flag);
  else if (quantity !== null) inStock = quantity > 0;
  return { inStock, quantity };
}

function normalizeProduct(raw) {
  const name = field(raw, "Name", "name", "Title") || "Untitled product";
  const descriptionText = normaliseLineBreaks(field(raw, "Description", "description"));
  const descriptionHTML = descriptionToHTML(descriptionText);
  const categoryPaths = parseCategories(field(raw, "Categories", "categories"));
  const firstPath = categoryPaths[0] || [];
  const regular = toPrice(field(raw, "Regular price", "regular_price", "Price"));
  let sale = toPrice(field(raw, "Sale price", "sale_price"));
  if (sale !== null && regular !== null && sale >= regular) sale = null;

  return {
    id: field(raw, "ID", "id"),
    type: (field(raw, "Type") || "simple").toLowerCase(),
    name,
    slug: slugify(name),
    sku: field(raw, "SKU", "sku"),
    price: regular,
    salePrice: sale,
    description: descriptionHTML,
    descriptionText: htmlToText(descriptionHTML),
    shortDescription: deriveShortDescription(field(raw, "Short description", "short_description"), descriptionText, name),
    images: splitList(field(raw, "Images", "images")),
    get image() { return this.images[0] || ""; },
    categoryPaths,
    categories: [...new Set(categoryPaths.flat())],
    primaryCategory: firstPath[0] || "",
    subCategory: firstPath.length > 1 ? firstPath[firstPath.length - 1] : "",
    attributes: parseAttributes(raw),
    stock: parseStock(raw),
    parentRef: field(raw, "Parent", "parent_id"),
    variations: []
  };
}

/** Attach variations to their variable parent and roll up price ranges. */
function linkVariations(products, variationsRaw) {
  const variable = products.filter((p) => p.type === "variable");
  const byId = new Map(products.map((p) => [p.id, p]));
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku, p]));

  variationsRaw.forEach((raw) => {
    const v = normalizeProduct(raw);
    let parent = null;
    if (v.parentRef) {
      const ref = v.parentRef.replace(/^id:/i, "");
      parent = byId.get(ref) || bySku.get(ref) || null;
    }
    if (!parent) {
      // Longest parent name that prefixes "<parent> - <option>"
      parent = variable
        .filter((p) => v.name.toLowerCase().startsWith(`${p.name.toLowerCase()} - `))
        .sort((a, b) => b.name.length - a.name.length)[0] || null;
    }
    if (!parent) return;

    const label = v.attributes.map((a) => a.values[0]).join(" / ") || v.name.slice(parent.name.length + 3);
    const options = {};
    v.attributes.forEach((a, i) => {
      const parentAttr = parent.attributes.find((pa) => pa.name === a.name) || parent.attributes[i];
      options[parentAttr ? parentAttr.name : a.name] = a.values[0];
    });
    parent.variations.push({
      id: v.id,
      sku: v.sku || parent.sku,
      label,
      options,
      price: v.price,
      salePrice: v.salePrice,
      image: v.image || parent.image,
      stock: v.stock
    });
  });

  variable.forEach((p) => {
    // Keep variations in the same order as the parent's attribute values
    const attr = p.attributes[0];
    if (attr) {
      p.variations.sort((a, b) => attr.values.indexOf(a.options[attr.name]) - attr.values.indexOf(b.options[attr.name]));
    }
    const effective = p.variations.map((v) => v.salePrice ?? v.price).filter((n) => n != null);
    p.priceMin = effective.length ? Math.min(...effective) : null;
    p.priceMax = effective.length ? Math.max(...effective) : null;
    p.onSale = p.variations.some((v) => v.salePrice != null);
  });
}

function buildCatalog(rawList) {
  const rows = (Array.isArray(rawList) ? rawList : rawList?.products || []).filter((r) => {
    const published = field(r, "Published");
    return published === "" || published === "1";
  });
  const isVariation = (r) => field(r, "Type").toLowerCase() === "variation";
  const products = rows.filter((r) => !isVariation(r)).map(normalizeProduct);
  linkVariations(products, rows.filter(isVariation));
  products.forEach((p) => {
    if (p.type !== "variable") p.onSale = p.salePrice != null;
  });
  return products;
}

let catalogPromise = null;
/** Fetch + normalise once per page; every caller shares the same promise. */
function loadProducts() {
  if (!catalogPromise) {
    catalogPromise = fetch(PRODUCTS_URL, { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(buildCatalog)
      .catch((err) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

/* ---------- Price helpers ---------- */

function getPriceText(product, variation) {
  if (variation) return formatPrice(variation.salePrice ?? variation.price);
  if (product.type === "variable") {
    if (product.priceMin == null) return "";
    return product.priceMin === product.priceMax
      ? formatPrice(product.priceMin)
      : `${formatPrice(product.priceMin)} – ${formatPrice(product.priceMax)}`;
  }
  return formatPrice(product.salePrice ?? product.price);
}

function discountPercent(regular, sale) {
  if (regular == null || sale == null) return 0;
  return Math.round(((regular - sale) / regular) * 100);
}

function renderPrice(product, variation) {
  const source = variation || (product.type === "variable" ? null : product);
  if (!source) {
    const text = getPriceText(product);
    return text
      ? `<div class="price"><span class="price__current">${text}</span></div>`
      : `<div class="price"><span class="price__request">Price on request</span></div>`;
  }
  if (source.price == null && source.salePrice == null) {
    return `<div class="price"><span class="price__request">Price on request</span></div>`;
  }
  if (source.salePrice != null && source.price != null) {
    const pct = discountPercent(source.price, source.salePrice);
    return `<div class="price">
        <span class="price__current">${formatPrice(source.salePrice)}</span>
        <del class="price__old"><span class="sr-only">Original price </span>${formatPrice(source.price)}</del>
        ${pct > 0 ? `<span class="price__save">-${pct}%</span>` : ""}
      </div>`;
  }
  return `<div class="price"><span class="price__current">${formatPrice(source.salePrice ?? source.price)}</span></div>`;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function absoluteUrl(path) {
  try { return new URL(path, window.location.href).href; } catch { return path; }
}

/* ---------- Card ---------- */

function renderProductCard(product) {
  const url = productUrl(product);
  const name = escapeHTML(product.name);
  const label = product.subCategory || product.primaryCategory;
  const optionAttr = product.type === "variable" ? product.attributes[0] : null;
  const waLink = createProductWhatsAppLink({
    name: product.name,
    priceText: getPriceText(product),
    option: optionAttr ? `${optionAttr.name} — please advise (${optionAttr.values.join(", ")})` : "",
    sku: product.sku,
    url: absoluteUrl(url)
  });

  return `
    <article class="product-card">
      <a class="product-card__media" href="${url}" tabindex="-1" aria-hidden="true">
        ${product.onSale ? '<span class="badge">Sale!</span>' : ""}
        <img src="${escapeHTML(product.image || PLACEHOLDER_IMAGE)}" alt="${name}" loading="lazy" decoding="async"
             width="400" height="400" onerror="handleImageError(this)">
      </a>
      <div class="product-card__body">
        ${label ? `<span class="product-card__cat">${escapeHTML(label)}</span>` : ""}
        <h3 class="product-card__title"><a href="${url}">${name}</a></h3>
        ${product.shortDescription ? `<p class="product-card__desc">${escapeHTML(product.shortDescription)}</p>` : ""}
        <div class="product-card__footer">
          ${renderPrice(product)}
          <a class="btn btn--wa btn--block btn--sm" href="${waLink}" target="_blank" rel="noopener"
             aria-label="Buy ${name} on WhatsApp">
            <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Buy on WhatsApp
          </a>
        </div>
      </div>
    </article>`;
}

function renderSkeletons(container, count = 6) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="product-skeleton" aria-hidden="true">
      <div class="product-skeleton__img"></div>
      <div class="product-skeleton__line"></div>
      <div class="product-skeleton__line"></div>
    </div>`).join("");
}

function renderLoadError(container, err) {
  const local = window.location.protocol === "file:";
  container.innerHTML = `
    <div class="notice" role="alert">
      <strong>Products could not be loaded.</strong>
      ${local
        ? "Browsers block reading <code>products.json</code> from a file opened directly. Run a static server in this folder (for example <code>npx serve</code> or <code>python -m http.server</code>) and open the address it prints."
        : `Check that <code>products.json</code> sits next to this page. (${escapeHTML(err.message)})`}
    </div>`;
}

/* ---------- Homepage: featured ---------- */

async function renderFeaturedProducts(selector = "#featured-products") {
  const grid = document.querySelector(selector);
  if (!grid) return;
  renderSkeletons(grid, 6);
  try {
    const catalog = await loadProducts();
    const byId = new Map(catalog.map((p) => [p.id, p]));
    let featured = FEATURED_PRODUCT_IDS.map((id) => byId.get(id)).filter(Boolean);
    if (!featured.length) featured = catalog;
    featured = featured.slice(0, FEATURED_LIMIT);
    grid.innerHTML = featured.map(renderProductCard).join("");
  } catch (err) {
    renderLoadError(grid, err);
  }
}

/* ---------- Listing: categories, filter, search ---------- */

function getCategoryTree(catalog) {
  const tree = new Map();
  catalog.forEach((p) => {
    p.categoryPaths.forEach(([top, ...rest]) => {
      if (!top) return;
      if (!tree.has(top)) tree.set(top, { name: top, count: 0, children: new Map() });
      const node = tree.get(top);
      node.count += 1;
      const leaf = rest[rest.length - 1];
      if (leaf) node.children.set(leaf, (node.children.get(leaf) || 0) + 1);
    });
  });
  return [...tree.values()];
}

function filterProducts(products, category, subCategory) {
  if (!category || category === "all") return products;
  const key = category.toLowerCase();
  return products.filter((p) => {
    const inCategory = p.categories.some((c) => c.toLowerCase() === key || slugify(c) === key);
    if (!inCategory) return false;
    if (!subCategory) return true;
    const sub = subCategory.toLowerCase();
    return p.categories.some((c) => c.toLowerCase() === sub || slugify(c) === sub);
  });
}

function searchProducts(products, query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return products;
  return products.filter((p) => {
    if (!p._haystack) {
      p._haystack = [
        p.name, p.sku, ...p.variations.map((v) => `${v.sku} ${v.label}`),
        ...p.categories, p.descriptionText
      ].join(" ").toLowerCase();
    }
    return terms.every((t) => p._haystack.includes(t));
  });
}

function sortProducts(products, sort) {
  const price = (p) => (p.type === "variable" ? p.priceMin : p.salePrice ?? p.price);
  const list = [...products];
  const priced = (fn) => (a, b) => {
    const pa = price(a), pb = price(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return fn(pa, pb);
  };
  if (sort === "price-asc") list.sort(priced((a, b) => a - b));
  if (sort === "price-desc") list.sort(priced((a, b) => b - a));
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function renderCategories(tree, state, total, onChange) {
  const topEl = document.querySelector("#category-filter");
  const subEl = document.querySelector("#subcategory-filter");
  if (!topEl) return;
  const active = (state.category || "all").toLowerCase();

  topEl.innerHTML = [
    `<button type="button" class="chip ${active === "all" ? "is-active" : ""}" data-category="all" aria-pressed="${active === "all"}">All <span>${total}</span></button>`,
    ...tree.map((node) => {
      const on = node.name.toLowerCase() === active || slugify(node.name) === active;
      return `<button type="button" class="chip ${on ? "is-active" : ""}" data-category="${escapeHTML(node.name)}" aria-pressed="${on}">${escapeHTML(node.name)} <span>${node.count}</span></button>`;
    })
  ].join("");

  const node = tree.find((n) => n.name.toLowerCase() === active || slugify(n.name) === active);
  if (subEl) {
    const subActive = (state.sub || "").toLowerCase();
    subEl.innerHTML = node && node.children.size > 1
      ? [`<button type="button" class="chip chip--sub ${!subActive ? "is-active" : ""}" data-sub="">All ${escapeHTML(node.name)}</button>`,
         ...[...node.children.keys()].map((name) => {
           const on = name.toLowerCase() === subActive;
           return `<button type="button" class="chip chip--sub ${on ? "is-active" : ""}" data-sub="${escapeHTML(name)}" aria-pressed="${on}">${escapeHTML(name)}</button>`;
         })].join("")
      : "";
  }

  topEl.onclick = (e) => {
    const btn = e.target.closest("[data-category]");
    if (btn) onChange({ category: btn.dataset.category, sub: "" });
  };
  if (subEl) {
    subEl.onclick = (e) => {
      const btn = e.target.closest("[data-sub]");
      if (btn) onChange({ sub: btn.dataset.sub });
    };
  }
}

async function initProductListing() {
  const grid = document.querySelector("#product-list");
  if (!grid) return;
  const params = new URLSearchParams(window.location.search);
  const state = {
    q: params.get("q") || "",
    category: params.get("category") || "all",
    sub: params.get("sub") || "",
    sort: params.get("sort") || "default"
  };
  const searchInput = document.querySelector("#shop-search");
  const sortSelect = document.querySelector("#shop-sort");
  const countEl = document.querySelector("#result-count");
  if (searchInput) searchInput.value = state.q;
  if (sortSelect) sortSelect.value = state.sort;

  renderSkeletons(grid, 9);
  let catalog;
  try {
    catalog = await loadProducts();
  } catch (err) {
    renderLoadError(grid, err);
    return;
  }
  const tree = getCategoryTree(catalog);

  const syncUrl = () => {
    const next = new URLSearchParams();
    if (state.q) next.set("q", state.q);
    if (state.category && state.category !== "all") next.set("category", state.category);
    if (state.sub) next.set("sub", state.sub);
    if (state.sort !== "default") next.set("sort", state.sort);
    const qs = next.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const update = (changes = {}) => {
    Object.assign(state, changes);
    renderCategories(tree, state, catalog.length, update);
    const list = sortProducts(searchProducts(filterProducts(catalog, state.category, state.sub), state.q), state.sort);
    grid.innerHTML = list.length
      ? list.map(renderProductCard).join("")
      : `<div class="notice"><strong>No products match “${escapeHTML(state.q || state.sub || state.category)}”.</strong>Try a shorter search term or choose another category. You can also ask us on WhatsApp — we supply more than what is listed here.</div>`;
    if (countEl) countEl.textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
    syncUrl();
  };

  let timer;
  searchInput?.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => update({ q: searchInput.value.trim() }), 150);
  });
  searchInput?.closest("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    update({ q: searchInput.value.trim() });
  });
  sortSelect?.addEventListener("change", () => update({ sort: sortSelect.value }));

  update();
}

/* ---------- Product details ---------- */

function stockHTML(stock) {
  if (stock.inStock === true) {
    return `<span class="stock stock--in">In stock${stock.quantity ? ` (${stock.quantity} available)` : ""}</span>`;
  }
  if (stock.inStock === false) return `<span class="stock stock--out">Out of stock — ask about lead time</span>`;
  return `<span class="stock">Available to order — confirm on WhatsApp</span>`;
}

async function renderProductDetails(selector = "#product-detail") {
  const root = document.querySelector(selector);
  if (!root) return;
  const id = new URLSearchParams(window.location.search).get("id");

  const notFound = (title, text) => {
    root.innerHTML = `<div class="notice"><strong>${title}</strong>${text}<div style="margin-top:16px"><a class="btn btn--navy" href="products.html">View all products</a></div></div>`;
  };

  let catalog;
  try {
    catalog = await loadProducts();
  } catch (err) {
    renderLoadError(root, err);
    return;
  }
  if (!id) { notFound("No product selected.", "Choose a product from the catalogue."); return; }

  let product = catalog.find((p) => p.id === id);
  let preselect = null;
  if (!product) {
    // A variation ID opens its parent with that option selected
    product = catalog.find((p) => p.variations.some((v) => v.id === id));
    preselect = product?.variations.find((v) => v.id === id) || null;
  }
  if (!product) { notFound("This product is no longer listed.", "It may have been renamed or removed."); return; }

  document.title = `${product.name} | Safeten`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", product.shortDescription || product.name);
  const crumbName = document.querySelector("#crumb-product");
  if (crumbName) crumbName.textContent = product.name;
  const heroTitle = document.querySelector("#page-title");
  if (heroTitle) heroTitle.textContent = product.primaryCategory || "Product";

  const optionAttrs = product.type === "variable" ? product.attributes.filter((a) => product.variations.some((v) => a.name in v.options)) : [];
  const specAttrs = product.type === "variable" ? [] : product.attributes.filter((a) => a.visible);
  const selected = {};
  if (product.variations.length) {
    const start = preselect
      || product.variations.find((v) => optionAttrs.every((a) => !a.default || v.options[a.name] === a.default))
      || product.variations[0];
    Object.assign(selected, start.options);
  }

  const images = product.images.length ? product.images : [PLACEHOLDER_IMAGE];
  const name = escapeHTML(product.name);
  const categoryLink = product.primaryCategory
    ? `<a href="products.html?category=${encodeURIComponent(product.primaryCategory)}">${escapeHTML(product.primaryCategory)}</a>`
    : "";

  root.innerHTML = `
    <div class="pd">
      <div class="pd-gallery">
        <div class="pd-gallery__main">
          ${product.onSale ? '<span class="badge">Sale!</span>' : ""}
          <img id="pd-main-image" src="${escapeHTML(images[0])}" alt="${name}" width="600" height="600" onerror="handleImageError(this)">
        </div>
        ${images.length > 1 ? `<div class="pd-thumbs">${images.map((src, i) => `
          <button type="button" class="pd-thumb ${i === 0 ? "is-active" : ""}" data-src="${escapeHTML(src)}" aria-label="Show image ${i + 1}">
            <img src="${escapeHTML(src)}" alt="" loading="lazy" onerror="handleImageError(this)">
          </button>`).join("")}</div>` : ""}
      </div>

      <div class="pd-info">
        ${categoryLink ? `<div class="pd-info__cat">${categoryLink}${product.subCategory ? ` / ${escapeHTML(product.subCategory)}` : ""}</div>` : ""}
        <h1>${name}</h1>
        <div id="pd-price"></div>
        ${product.shortDescription ? `<p class="pd-info__short">${escapeHTML(product.shortDescription)}</p>` : ""}

        ${optionAttrs.map((attr) => `
          <div class="pd-option" data-attr="${escapeHTML(attr.name)}">
            <div class="pd-option__label">${escapeHTML(attr.name)}: <span data-selected-label></span></div>
            <div class="pd-option__values" role="group" aria-label="${escapeHTML(attr.name)}">
              ${attr.values.filter((val) => product.variations.some((v) => v.options[attr.name] === val)).map((val) =>
                `<button type="button" class="opt-btn" data-value="${escapeHTML(val)}">${escapeHTML(val)}</button>`).join("")}
            </div>
          </div>`).join("")}

        <div class="pd-buy">
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
            <input id="pd-qty" type="number" min="1" max="999" value="1" inputmode="numeric" aria-label="Quantity">
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </div>
          <a id="pd-whatsapp" class="btn btn--wa" href="#" target="_blank" rel="noopener">
            <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Buy on WhatsApp
          </a>
          <a class="btn btn--outline" data-contact="phone" href="#"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call</a>
        </div>
        <p class="pd-note"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> We confirm price, availability and delivery on WhatsApp — no online payment needed.</p>

        <dl class="pd-meta">
          <div><dt>SKU</dt><dd id="pd-sku">${escapeHTML(product.sku || "—")}</dd></div>
          ${product.categories.length ? `<div><dt>Category</dt><dd>${product.categoryPaths.map((p) => escapeHTML(p.join(" › "))).join(", ")}</dd></div>` : ""}
          <div><dt>Availability</dt><dd id="pd-stock">${stockHTML(product.stock)}</dd></div>
        </dl>
      </div>
    </div>

    ${product.description || specAttrs.length ? `
      <section class="pd-desc" aria-labelledby="pd-desc-title">
        <h2 id="pd-desc-title">Product description</h2>
        ${product.description ? `<div class="rich-text">${product.description}</div>` : ""}
        ${specAttrs.length ? `<table class="spec-table"><tbody>${specAttrs.map((a) =>
          `<tr><th scope="row">${escapeHTML(a.name)}</th><td>${escapeHTML(a.values.join(", "))}</td></tr>`).join("")}</tbody></table>` : ""}
      </section>` : ""}

    <section class="related" id="related" hidden aria-labelledby="related-title">
      <h2 id="related-title">Related products</h2>
      <div class="product-grid" id="related-grid"></div>
    </section>`;

  const qtyInput = root.querySelector("#pd-qty");
  const waBtn = root.querySelector("#pd-whatsapp");
  const priceEl = root.querySelector("#pd-price");
  const skuEl = root.querySelector("#pd-sku");
  const stockEl = root.querySelector("#pd-stock");
  const mainImg = root.querySelector("#pd-main-image");

  const currentVariation = () =>
    product.variations.find((v) => optionAttrs.every((a) => v.options[a.name] === selected[a.name])) || null;

  const refresh = () => {
    const variation = currentVariation();
    const qty = Math.min(999, Math.max(1, parseInt(qtyInput.value, 10) || 1));
    qtyInput.value = qty;

    root.querySelectorAll(".pd-option").forEach((group) => {
      const attr = group.dataset.attr;
      group.querySelector("[data-selected-label]").textContent = selected[attr] || "";
      group.querySelectorAll(".opt-btn").forEach((btn) => {
        const on = btn.dataset.value === selected[attr];
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on);
      });
    });

    priceEl.innerHTML = renderPrice(product, variation);
    if (variation) {
      skuEl.textContent = variation.sku || product.sku || "—";
      if (variation.stock.inStock !== null) stockEl.innerHTML = stockHTML(variation.stock);
    }

    const unit = variation ? variation.salePrice ?? variation.price : product.type === "variable" ? null : product.salePrice ?? product.price;
    const priceText = unit != null
      ? `${formatPrice(unit)}${qty > 1 ? ` each (total ${formatPrice(unit * qty)})` : ""}`
      : getPriceText(product);
    waBtn.href = createProductWhatsAppLink({
      name: product.name,
      option: variation ? Object.entries(variation.options).map(([k, v]) => `${k}: ${v}`).join(", ") : "",
      sku: variation?.sku || product.sku,
      priceText,
      quantity: qty,
      url: window.location.href
    });
  };

  root.addEventListener("click", (e) => {
    const opt = e.target.closest(".opt-btn");
    if (opt) {
      selected[opt.closest(".pd-option").dataset.attr] = opt.dataset.value;
      refresh();
      return;
    }
    const step = e.target.closest("[data-qty]");
    if (step) {
      qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + Number(step.dataset.qty);
      refresh();
      return;
    }
    const thumb = e.target.closest(".pd-thumb");
    if (thumb) {
      delete mainImg.dataset.fallback;
      mainImg.src = thumb.dataset.src;
      root.querySelectorAll(".pd-thumb").forEach((t) => t.classList.toggle("is-active", t === thumb));
    }
  });
  qtyInput.addEventListener("change", refresh);
  qtyInput.addEventListener("input", () => { if (qtyInput.value !== "") refresh(); });

  if (typeof initContactLinks === "function") initContactLinks(root);
  refresh();

  const related = catalog
    .filter((p) => p.id !== product.id && p.primaryCategory && p.primaryCategory === product.primaryCategory)
    .slice(0, 3);
  if (related.length) {
    root.querySelector("#related-grid").innerHTML = related.map(renderProductCard).join("");
    root.querySelector("#related").hidden = false;
  }
}
