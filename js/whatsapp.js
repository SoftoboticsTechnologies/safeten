/* ==========================================================================
   WhatsApp ordering
   Change WHATSAPP_NUMBER once and every button on the site follows.
   Format: country code + number, digits only (e.g. "919876543210").
   ========================================================================== */

const WHATSAPP_NUMBER = "919456045257";

/* Phone / email shown in the header, CTA and footer. */
const CONTACT = {
  phoneDisplay: "+91 9456045257",
  phoneLink: "+919456045257",
  email: "safeten.service@gmail.com",
  address: "Gala No.06 Nirmal CHS, Narsi Pada, Akurli Road, Hanuman Nagar, Kandivali East, Mumbai, Maharashtra - 400101"
};

const DEFAULT_WHATSAPP_MESSAGE =
  "Hello Safeten, I would like to know more about your fire & safety products and services.";

const QUOTE_WHATSAPP_MESSAGE =
  "Hello Safeten, I would like to request a quote.\n\n" +
  "Requirement:\nLocation:\nProperty type (home / office / industrial):\n\n" +
  "Please get in touch with the details.";

function getWhatsAppDigits() {
  const digits = String(WHATSAPP_NUMBER).replace(/\D/g, "");
  // A placeholder number (still containing X) would only produce a broken chat.
  // wa.me without a number opens WhatsApp and lets the visitor pick the contact.
  if (digits.length < 10 || /x/i.test(WHATSAPP_NUMBER)) {
    if (!getWhatsAppDigits.warned) {
      console.warn("[Safeten] Set WHATSAPP_NUMBER in js/whatsapp.js to enable direct WhatsApp orders.");
      getWhatsAppDigits.warned = true;
    }
    return "";
  }
  return digits;
}

/** Build a wa.me link for any message. */
function createWhatsAppLink(message = DEFAULT_WHATSAPP_MESSAGE) {
  return `https://wa.me/${getWhatsAppDigits()}?text=${encodeURIComponent(message)}`;
}

/**
 * Order message for a product.
 * @param {{name:string, priceText?:string, quantity?:number, option?:string, sku?:string, url?:string}} order
 */
function buildOrderMessage({ name, priceText, quantity = 1, option, sku, url }) {
  const lines = ["Hello, I would like to order:", "", `Product: ${name}`];
  if (option) lines.push(`Option: ${option}`);
  if (sku) lines.push(`SKU: ${sku}`);
  lines.push(`Price: ${priceText || "Please share the price"}`);
  lines.push(`Quantity: ${quantity}`);
  if (url) lines.push(`Link: ${url}`);
  lines.push("", "Please provide availability and delivery details.");
  return lines.join("\n");
}

function createProductWhatsAppLink(order) {
  return createWhatsAppLink(buildOrderMessage(order));
}

/* Wire up static elements:
   [data-whatsapp]          -> general enquiry
   [data-whatsapp="quote"]  -> quote request
   [data-contact="phone|email|address"] -> filled from CONTACT */
function initContactLinks(root = document) {
  root.querySelectorAll("[data-whatsapp]").forEach((el) => {
    const message = el.dataset.whatsapp === "quote" ? QUOTE_WHATSAPP_MESSAGE : DEFAULT_WHATSAPP_MESSAGE;
    el.href = createWhatsAppLink(message);
    el.target = "_blank";
    el.rel = "noopener";
  });

  root.querySelectorAll("[data-contact]").forEach((el) => {
    const type = el.dataset.contact;
    const label = el.querySelector("[data-contact-label]") || el;
    if (type === "phone") {
      if (el.tagName === "A") el.href = `tel:${CONTACT.phoneLink}`;
      if (label !== el || !el.children.length) label.textContent = CONTACT.phoneDisplay;
    } else if (type === "email") {
      if (el.tagName === "A") el.href = `mailto:${CONTACT.email}`;
      if (label !== el || !el.children.length) label.textContent = CONTACT.email;
    } else if (type === "address") {
      label.textContent = CONTACT.address;
    }
  });
}
