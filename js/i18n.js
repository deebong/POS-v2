// Extensible POS language registry. UI modules can migrate strings to t() incrementally without changing stored settings.
// Supported installation languages: Tamil, English, Tamil + English, Hindi. Add future locales here.
export const LANGUAGE_OPTIONS = [
  { id: "en", label: "English", native: "English" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "ta-en", label: "Tamil + English", native: "தமிழ் + English" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
];

const DICTIONARY = {
  en: {
    dashboard: "Dashboard", pos: "POS / Billing", inventory: "Inventory", sales: "Invoices",
    customers: "Customers", settings: "Settings", staff: "Staff & Users", signIn: "Sign in",
    installationComplete: "Installation Complete",
  },
  ta: {
    dashboard: "டாஷ்போர்டு", pos: "விற்பனை / பில்லிங்", inventory: "சரக்கு", sales: "விற்பனைப்பட்டியல்",
    customers: "வாடிக்கையாளர்கள்", settings: "அமைப்புகள்", staff: "பணியாளர்கள்", signIn: "உள்நுழைக",
    installationComplete: "நிறுவல் முடிந்தது",
  },
  "ta-en": {
    dashboard: "Dashboard", pos: "POS / Billing", inventory: "Inventory", sales: "Invoices",
    customers: "Customers", settings: "Settings", staff: "Staff & Users", signIn: "Sign in",
    installationComplete: "Installation Complete",
  },
  hi: {
    dashboard: "डैशबोर्ड", pos: "POS / बिलिंग", inventory: "इन्वेंटरी", sales: "बिक्री बिल",
    customers: "ग्राहक", settings: "सेटिंग्स", staff: "स्टाफ", signIn: "साइन इन",
    installationComplete: "इंस्टॉलेशन पूरा हुआ",
  },
};

export function languageInfo(id) {
  return LANGUAGE_OPTIONS.find((x) => x.id === id) || LANGUAGE_OPTIONS[0];
}
export function t(key, locale = "en") {
  const base = locale === "ta-en" ? "en" : locale;
  return DICTIONARY[base]?.[key] || DICTIONARY.en[key] || key;
}
export function supportedLanguages() {
  return LANGUAGE_OPTIONS.map((x) => ({ ...x }));
}
