/* ==========================================================================
   Contact page: enquiry form
   Valid enquiries are POSTed as JSON to the contact-form API, which emails
   the SAFETEN team (replies go to the visitor's "email"). The API only
   accepts registered domains, so submissions fail from localhost.
   ========================================================================== */

const CONTACT_API_ENDPOINT = "https://k5iewetbri.execute-api.ap-south-1.amazonaws.com/prod/contact";
const CONTACT_API_TIMEOUT_MS = 20000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IS_DEV_HOST = ["localhost", "127.0.0.1", ""].includes(location.hostname);

/* Accepts Indian and international numbers: 7–15 digits (E.164 maximum),
   optional +, spaces, dashes, dots, brackets. */
function isValidPhone(value) {
  if (!/^\+?[\d\s\-().]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

const CONTACT_RULES = {
  firstName: (v) => (v ? "" : "Please enter your first name."),
  email: (v) => (!v ? "Please enter your email address." : EMAIL_PATTERN.test(v) ? "" : "Please enter a valid email address (e.g. name@example.com)."),
  phone: (v) => (!v ? "Please enter your phone number." : isValidPhone(v) ? "" : "Please enter a valid phone number."),
  message: (v) => (v.length >= 5 ? "" : v ? "Please add a little more detail about your requirement." : "Please tell us about your requirement.")
};

function setFieldError(input, message) {
  const field = input.closest(".form-field");
  const errorEl = document.getElementById(`${input.id}-err`);
  field.classList.toggle("has-error", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (errorEl) errorEl.textContent = message;
}

function validateField(input) {
  const rule = CONTACT_RULES[input.name];
  if (!rule) return true;
  const message = rule(input.value.trim());
  setFieldError(input, message);
  return !message;
}

/* Form field names -> API JSON properties. "email" must stay "email" so
   replies to the notification go to the visitor. Empty optional fields are
   left out. */
const API_FIELD_MAP = {
  firstName: "firstName",
  lastName: "lastName",
  email: "email",
  phone: "phoneNumber",
  company: "companyName",
  service: "serviceRequired",
  message: "message"
};

function buildApiPayload(data) {
  const payload = {};
  Object.entries(API_FIELD_MAP).forEach(([field, key]) => {
    if (data[field]) payload[key] = data[field];
  });
  return payload;
}

/* Pre-filled WhatsApp text, offered as a fallback when the API fails. */
function buildEnquiryMessage(data) {
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
  const lines = [
    "Hello SAFETEN, I would like to make an enquiry.",
    "",
    `Name: ${name}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone}`
  ];
  if (data.company) lines.push(`Company: ${data.company}`);
  if (data.service) lines.push(`Service required: ${data.service}`);
  lines.push("", "Message:", data.message);
  return lines.join("\n");
}

/**
 * POST the enquiry. Resolves only when the API confirms success
 * ({ success: true }); otherwise throws. Error details are for the console,
 * never shown to visitors.
 */
async function sendEnquiry(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTACT_API_TIMEOUT_MS);
  try {
    const response = await fetch(CONTACT_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    let result = null;
    try { result = await response.json(); } catch { /* non-JSON body */ }
    if (!response.ok || !result || result.success !== true) {
      const error = new Error("Contact API rejected the enquiry");
      error.status = response.status;
      error.apiErrors = result && Array.isArray(result.errors) ? result.errors : ["Malformed or empty response"];
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function initContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const errorAlert = document.getElementById("form-error");
  const errorText = document.getElementById("form-error-text");
  const successAlert = document.getElementById("form-success");
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitLabel = submitBtn.innerHTML;
  const inputs = [...form.querySelectorAll("input, select, textarea")];
  let sending = false;

  const showError = (html) => {
    errorText.innerHTML = html;
    errorAlert.hidden = false;
  };
  const setSending = (on) => {
    sending = on;
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
    submitBtn.innerHTML = on ? 'Sending... <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>' : submitLabel;
  };

  // Validate on blur, then live once a field has been flagged.
  inputs.forEach((input) => {
    input.addEventListener("blur", () => { if (input.value.trim()) validateField(input); });
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
      if (!errorAlert.hidden && !form.querySelector("[aria-invalid='true']")) errorAlert.hidden = true;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    successAlert.hidden = true;

    const invalid = inputs.filter((input) => !validateField(input));
    if (invalid.length) {
      showError("Please correct the highlighted fields and try again.");
      invalid[0].focus();
      return;
    }
    errorAlert.hidden = true;

    const data = Object.fromEntries(
      [...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()])
    );

    setSending(true);
    try {
      await sendEnquiry(buildApiPayload(data));
      form.reset();
      inputs.forEach((input) => setFieldError(input, ""));
      successAlert.hidden = false;
      successAlert.focus();
    } catch (error) {
      if (IS_DEV_HOST) {
        console.warn("[Safeten] Contact form submission failed:",
          error.name === "AbortError" ? "request timed out" : (error.apiErrors || error.message), error.status || "");
      }
      const waLink = createWhatsAppLink(buildEnquiryMessage(data));
      showError(
        "Sorry, we couldn't send your enquiry right now. Please try again or contact us directly on " +
        `<a href="${waLink}" target="_blank" rel="noopener">WhatsApp</a> or ` +
        `<a href="tel:${CONTACT.phoneLink}">${CONTACT.phoneDisplay}</a>.`
      );
    } finally {
      setSending(false);
      // Disabling the button drops keyboard focus; hand it back after an error.
      if (document.activeElement === document.body) submitBtn.focus();
    }
  });
}

document.addEventListener("DOMContentLoaded", initContactForm);
