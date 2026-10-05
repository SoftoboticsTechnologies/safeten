/* ==========================================================================
   Contact page: enquiry form
   The site has no backend, so a valid enquiry is handed to WhatsApp
   (with an email fallback) as a pre-filled message.
   ========================================================================== */

const CONTACT_EMAIL = "safeten.service@gmail.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Accepts Indian and international numbers: 10–13 digits, optional +, spaces, dashes, brackets. */
function isValidPhone(value) {
  if (!/^\+?[\d\s\-()]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

const CONTACT_RULES = {
  firstName: (v) => (v ? "" : "Please enter your first name."),
  email: (v) => (!v ? "Please enter your email address." : EMAIL_PATTERN.test(v) ? "" : "Please enter a valid email address (e.g. name@example.com)."),
  phone: (v) => (!v ? "Please enter your phone number." : isValidPhone(v) ? "" : "Please enter a valid phone number (10–13 digits)."),
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

function initContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const errorAlert = document.getElementById("form-error");
  const successAlert = document.getElementById("form-success");
  const inputs = [...form.querySelectorAll("input, select, textarea")];

  // Validate on blur, then live once a field has been flagged.
  inputs.forEach((input) => {
    input.addEventListener("blur", () => { if (input.value.trim()) validateField(input); });
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
      if (!errorAlert.hidden && !form.querySelector("[aria-invalid='true']")) errorAlert.hidden = true;
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    successAlert.hidden = true;

    const invalid = inputs.filter((input) => !validateField(input));
    if (invalid.length) {
      errorAlert.hidden = false;
      invalid[0].focus();
      return;
    }
    errorAlert.hidden = true;

    const data = Object.fromEntries(
      [...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()])
    );
    const message = buildEnquiryMessage(data);
    const waLink = createWhatsAppLink(message);
    const subject = `Website enquiry${data.service ? ` – ${data.service}` : ""}`;
    const mailLink = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

    document.getElementById("success-wa").href = waLink;
    document.getElementById("success-mail").href = mailLink;

    window.open(waLink, "_blank", "noopener");

    form.reset();
    inputs.forEach((input) => setFieldError(input, ""));
    successAlert.hidden = false;
    successAlert.focus();
  });
}

document.addEventListener("DOMContentLoaded", initContactForm);
