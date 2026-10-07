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


const TEXT = {
  ta: {
    "Dashboard":"டாஷ்போர்டு","POS / Billing":"POS / பில்லிங்","Inventory":"சரக்கு","Product Labels":"தயாரிப்பு லேபிள்கள்","Invoices":"விலைப்பட்டியல்கள்","Customers":"வாடிக்கையாளர்கள்","Purchases":"கொள்முதல்கள்","Returns":"திருப்பி / மாற்று","Cash Drawer":"பணப் பெட்டி","Day Close":"நாள் முடிவு","Audit Log":"தணிக்கை பதிவு","Low Stock":"குறைந்த இருப்பு","Reports":"அறிக்கைகள்","Loyalty":"வாடிக்கையாளர் நன்மைகள்","Staff & Users":"பணியாளர்கள் & பயனர்கள்","Settings":"அமைப்புகள்",
    "Good morning":"காலை வணக்கம்","Good afternoon":"மதிய வணக்கம்","Good evening":"மாலை வணக்கம்","New sale":"புதிய விற்பனை","Add product":"தயாரிப்பைச் சேர்","Current order":"தற்போதைய ஆர்டர்","All items":"அனைத்து பொருட்கள்","Most Popular":"அதிகம் வாங்கப்பட்டவை","Search products, or scan a barcode / QR…  (F2)":"பொருட்களைத் தேடவும் அல்லது பார்கோடு / QR ஸ்கேன் செய்யவும்… (F2)","Customer name (optional)":"வாடிக்கையாளர் பெயர் (விருப்பம்)","Phone":"தொலைபேசி","Customer address (optional, for GST bills)":"வாடிக்கையாளர் முகவரி (GST பில்களுக்கு விருப்பம்)","Cart is empty":"கார்ட் காலியாக உள்ளது","Subtotal":"மொத்த இடைத்தொகை","Discount":"தள்ளுபடி","Total":"மொத்தம்","Charge":"கட்டணம் வசூலிக்கவும்","Take payment":"கட்டணம் பெறுக","Amount due":"செலுத்த வேண்டிய தொகை","Amount received":"பெற்ற தொகை","Change due":"மீதி தொகை","Complete payment":"கட்டணத்தை முடிக்கவும்","Cancel":"ரத்து","Cash":"பணம்","Card":"அட்டை","UPI / QR":"UPI / QR","Print receipt":"ரசீதை அச்சிடுக","WhatsApp":"WhatsApp","New sale":"புதிய விற்பனை",
    "Settings":"அமைப்புகள்","Store profile":"கடை விவரம்","Store name":"கடை பெயர்","Brand tagline / description":"பிராண்ட் வாசகம் / விளக்கம்","Address":"முகவரி","Phone numbers":"தொலைபேசி எண்கள்","Language":"மொழி","Primary phone":"முதன்மை தொலைபேசி","Currency symbol":"நாணய குறியீடு","Tax label":"வரி பெயர்","Store logo":"கடை லோகோ","Branding style":"பிராண்ட் தோற்றம்","Default icon + brand name + tagline":"இயல்புநிலை ஐகான் + பிராண்ட் பெயர் + வாசகம்","Custom uploaded logo":"பதிவேற்றிய தனிப்பயன் லோகோ","UPI payment IDs":"UPI கட்டண ID-கள்","Add another UPI ID":"மற்றொரு UPI ID-ஐச் சேர்","Default":"இயல்புநிலை","Privacy on bill / receipt":"பில் / ரசீது தனியுரிமை","Include customer name":"வாடிக்கையாளர் பெயரைச் சேர்க்கவும்","Include customer phone":"வாடிக்கையாளர் தொலைபேசியைச் சேர்க்கவும்","Receipt footer message":"ரசீது கீழ்க்குறிப்பு","Appearance":"தோற்றம்","Overall appearance":"முழு தோற்றம்","Light":"வெளிர்","Dark":"இருள்","System":"சிஸ்டம்","Side menu style":"பக்க மெனு தோற்றம்","Brand colour":"பிராண்ட் நிறம்","Invoice / receipt logo":"இன்வாய்ஸ் / ரசீது லோகோ","Favicon":"Favicon","Product pictures":"தயாரிப்பு படங்கள்","Emoji":"Emoji","Photos":"படங்கள்","Save store details":"கடை விவரங்களைச் சேமிக்கவும்","Receipt preview":"ரசீது முன்னோட்டம்","Updates as you type":"தட்டச்சு செய்யும் போது புதுப்பிக்கப்படும்",
    "Data storage & sync":"தரவு சேமிப்பு & ஒத்திசைவு","Backup & Recovery":"காப்புப்பிரதி & மீட்பு","Google Drive disaster recovery":"Google Drive பேரிடர் மீட்பு","Drive backups are not configured":"Drive காப்புப்பிரதிகள் அமைக்கப்படவில்லை","Backup verification":"காப்புப்பிரதி சரிபார்ப்பு","The most recent cloud backup was verified.":"சமீபத்திய மேகக் காப்புப்பிரதி சரிபார்க்கப்பட்டது.","Run verification after setup or any manual backup.":"அமைத்த பிறகு அல்லது கைமுறையாக காப்புப்பிரதி எடுத்த பிறகு சரிபார்க்கவும்.","Back up now":"இப்போது காப்புப்பிரதி எடுக்கவும்","Verify":"சரிபார்க்கவும்","Admin restore from Drive backup":"Drive காப்புப்பிரதியிலிருந்து நிர்வாகி மீட்பு","Paste Drive backup file ID":"Drive காப்புப்பிரதி கோப்பு ID-ஐ ஒட்டவும்","Restore":"மீட்டமை","Restoring always creates a pre-restore snapshot first and invalidates active server sessions.":"மீட்டமைப்பதற்கு முன் ஒரு பாதுகாப்பு நகல் உருவாக்கப்படும்; செயலில் உள்ள சர்வர் அமர்வுகள் செல்லாததாக மாற்றப்படும்.","Backup & Recovery":"காப்புப்பிரதி & மீட்பு","Local disaster recovery plus Google Drive snapshots and validation.":"உள்ளூர் பேரிடர் மீட்பு, Google Drive காப்புப்பிரதிகள் மற்றும் சரிபார்ப்பு.","Local backup validation":"உள்ளூர் காப்புப்பிரதி சரிபார்ப்பு","Every automatic local backup now has a SHA-256 manifest. Verification checks that the latest file is readable and untampered.":"ஒவ்வொரு தானியங்கி உள்ளூர் காப்புப்பிரதிக்கும் SHA-256 சரிபார்ப்பு பதிவு உள்ளது. சமீபத்திய கோப்பு படிக்கக்கூடியதா மற்றும் மாற்றப்படவில்லையா என்பதைச் சரிபார்க்கிறது.","Verify backup":"காப்புப்பிரதியைச் சரிபார்க்கவும்","Local retention: 30 daily, 12 weekly and 12 monthly snapshots. Browser scheduling runs while the POS is active; Google Drive triggers run independently of the browser.":"உள்ளூர் சேமிப்பு: தினசரி 30, வாராந்திர 12 மற்றும் மாதாந்திர 12 காப்புப்பிரதிகள். POS இயங்கும் போது உலாவி திட்டமிடல் செயல்படும்; Google Drive திட்டமிடல்கள் உலாவியிலிருந்து தனியாக இயங்கும்.","Google Drive disaster recovery":"Google Drive பேரிடர் மீட்பு","Authoritative Google Sheets snapshots stored in Drive with automatic retention.":"முக்கிய Google Sheets தரவின் காப்புப்பிரதிகள் Drive-ல் தானாக சேமிக்கப்பட்டு பராமரிக்கப்படும்.","Automatic Drive backups are enabled":"தானியங்கி Drive காப்புப்பிரதிகள் இயக்கப்பட்டுள்ளன","Daily: 30 · Weekly: 12 · Monthly: 12. Last backup:":"தினசரி: 30 · வாராந்திர: 12 · மாதாந்திர: 12. கடைசி காப்புப்பிரதி:","not yet":"இன்னும் இல்லை","The POS will create a private FreshMart POS Backups folder and install daily, weekly and monthly Apps Script triggers.":"POS தனிப்பட்ட FreshMart POS Backups கோப்புறையை உருவாக்கி, தினசரி, வாராந்திர மற்றும் மாதாந்திர Apps Script திட்டமிடல்களை அமைக்கும்.","Drive backups are not configured":"Drive காப்புப்பிரதிகள் அமைக்கப்படவில்லை","The POS will create a private FreshMart POS Backups folder and install daily, weekly and monthly Apps Script triggers.":"POS தனிப்பட்ட FreshMart POS Backups கோப்புறையை உருவாக்கி, தினசரி, வாராந்திர மற்றும் மாதாந்திர Apps Script திட்டமிடல்களை அமைக்கும்.","Backup verification":"காப்புப்பிரதி சரிபார்ப்பு","The most recent cloud backup was verified.":"சமீபத்திய மேகக் காப்புப்பிரதி சரிபார்க்கப்பட்டது.","Run verification after setup or any manual backup.":"அமைத்த பிறகு அல்லது கைமுறையாக காப்புப்பிரதி எடுத்த பிறகு சரிபார்க்கவும்.","Back up now":"இப்போது காப்புப்பிரதி எடுக்கவும்","Verify":"சரிபார்க்கவும்","Admin restore from Drive backup":"Drive காப்புப்பிரதியிலிருந்து நிர்வாகி மீட்பு","Paste Drive backup file ID":"Drive காப்புப்பிரதி கோப்பு ID-ஐ ஒட்டவும்","Restore":"மீட்டமை","Restoring always creates a pre-restore snapshot first and invalidates active server sessions.":"மீட்டமைப்பதற்கு முன் ஒரு பாதுகாப்பு நகல் உருவாக்கப்படும்; செயலில் உள்ள சர்வர் அமர்வுகள் செல்லாததாக மாற்றப்படும்.","Download backup file":"காப்புப்பிரதி கோப்பைப் பதிவிறக்கவும்","Restore from file…":"கோப்பிலிருந்து மீட்டெடுக்கவும்…",
    "English":"ஆங்கிலம்","Tamil":"தமிழ்","Tamil + English":"தமிழ் + ஆங்கிலம்","Hindi":"இந்தி",
    "Sales overview":"விற்பனை கண்ணோட்டம்","Payment methods":"கட்டண முறைகள்","Top products":"முக்கிய தயாரிப்புகள்","Low stock alerts":"குறைந்த இருப்பு எச்சரிக்கைகள்","Recent transactions":"சமீபத்திய பரிவர்த்தனைகள்","Today's revenue":"இன்றைய வருவாய்","Orders":"ஆர்டர்கள்","Items sold":"விற்ற பொருட்கள்","Avg. order value":"சராசரி ஆர்டர் மதிப்பு","Gross profit":"மொத்த லாபம்","Last 7 days":"கடந்த 7 நாட்கள்","Last 30 days":"கடந்த 30 நாட்கள்","Detailed reports":"விரிவான அறிக்கைகள்",
    "GST filing & archive":"GST தாக்கல் & காப்பகம்","Export GST CSV":"GST CSV ஏற்றுமதி","GST Bill":"GST பில்","Word":"Word","Print / Save PDF":"அச்சிடு / PDF ஆக சேமி","Sales by day":"நாள் வாரியான விற்பனை","Sales summary":"விற்பனை சுருக்கம்","Net sales":"நிகர விற்பனை","Refunds":"திருப்பிச் செலுத்தல்கள்","Tax":"வரி","Completed sales":"முடிந்த விற்பனைகள்",
    "Return / exchange":"திரும்ப / மாற்று","Return":"திரும்ப","Exchange":"மாற்று","Reason":"காரணம்","Settlement method":"தீர்வு முறை","Complete return":"திருப்பை முடிக்கவும்",
    "Suppliers & Purchases":"சப்ளையர்கள் & கொள்முதல்கள்","Add supplier":"சப்ளையரைச் சேர்","Receive purchase":"கொள்முதலைப் பெறுக","Purchase history":"கொள்முதல் வரலாறு","Store details saved":"கடை விவரங்கள் சேமிக்கப்பட்டன","Payment successful":"கட்டணம் வெற்றிகரமாக முடிந்தது","Completed":"முடிந்தது","Voided":"ரத்து செய்யப்பட்டது","Close":"மூடு","Save":"சேமி","Save changes":"மாற்றங்களைச் சேமி","Edit":"திருத்து","Delete":"நீக்கு","Search":"தேடுக","Export CSV":"CSV ஏற்றுமதி","Import CSV":"CSV இறக்குமதி","Refresh":"புதுப்பி","Restock":"மீண்டும் சரக்கு நிரப்பு","No products found":"தயாரிப்புகள் எதுவும் கிடைக்கவில்லை","No staff accounts found":"பணியாளர் கணக்குகள் எதுவும் இல்லை","Active":"செயலில்","Inactive":"செயலில் இல்லை","Role":"பங்கு","Status":"நிலை","Date":"தேதி","Quantity":"அளவு","Price":"விலை","Cost price":"கொள்முதல் விலை","Selling price":"விற்பனை விலை"
  },
  hi: {
    "Dashboard":"डैशबोर्ड","POS / Billing":"POS / बिलिंग","Inventory":"इन्वेंटरी","Product Labels":"उत्पाद लेबल","Invoices":"चालान","Customers":"ग्राहक","Purchases":"खरीद","Returns":"वापसी / एक्सचेंज","Cash Drawer":"कैश ड्रॉअर","Day Close":"दिन बंद","Audit Log":"ऑडिट लॉग","Low Stock":"कम स्टॉक","Reports":"रिपोर्ट","Loyalty":"लॉयल्टी","Staff & Users":"स्टाफ और उपयोगकर्ता","Settings":"सेटिंग्स",
    "Good morning":"सुप्रभात","Good afternoon":"शुभ दोपहर","Good evening":"शुभ संध्या","New sale":"नई बिक्री","Add product":"उत्पाद जोड़ें","Current order":"वर्तमान ऑर्डर","All items":"सभी आइटम","Most Popular":"सबसे लोकप्रिय","Customer name (optional)":"ग्राहक का नाम (वैकल्पिक)","Phone":"फोन","Cart is empty":"कार्ट खाली है","Subtotal":"उप-योग","Discount":"छूट","Total":"कुल","Charge":"भुगतान लें","Take payment":"भुगतान लें","Amount due":"देय राशि","Amount received":"प्राप्त राशि","Change due":"वापसी राशि","Complete payment":"भुगतान पूरा करें","Cancel":"रद्द करें","Cash":"नकद","Card":"कार्ड","UPI / QR":"UPI / QR","Print receipt":"रसीद प्रिंट करें","WhatsApp":"WhatsApp",
    "Store profile":"दुकान विवरण","Store name":"दुकान का नाम","Brand tagline / description":"ब्रांड टैगलाइन / विवरण","Address":"पता","Phone numbers":"फोन नंबर","Language":"भाषा","Primary phone":"मुख्य फोन","Currency symbol":"मुद्रा चिन्ह","Tax label":"कर लेबल","Store logo":"दुकान लोगो","Branding style":"ब्रांड शैली","Default icon + brand name + tagline":"डिफ़ॉल्ट आइकन + ब्रांड नाम + टैगलाइन","Custom uploaded logo":"कस्टम अपलोडेड लोगो","UPI payment IDs":"UPI भुगतान ID","Add another UPI ID":"एक और UPI ID जोड़ें","Default":"डिफ़ॉल्ट","Privacy on bill / receipt":"बिल / रसीद गोपनीयता","Include customer name":"ग्राहक का नाम शामिल करें","Include customer phone":"ग्राहक का फोन शामिल करें","Receipt footer message":"रसीद का संदेश","Appearance":"दिखावट","Overall appearance":"समग्र दिखावट","Light":"लाइट","Dark":"डार्क","System":"सिस्टम","Side menu style":"साइड मेनू शैली","Brand colour":"ब्रांड रंग","Invoice / receipt logo":"इनवॉइस / रसीद लोगो","Favicon":"फेविकॉन","Product pictures":"उत्पाद चित्र","Emoji":"इमोजी","Photos":"फोटो","Save store details":"दुकान विवरण सहेजें","Receipt preview":"रसीद पूर्वावलोकन","Updates as you type":"टाइप करते ही अपडेट",
    "Data storage & sync":"डेटा स्टोरेज और सिंक","Backup & Recovery":"बैकअप और रिकवरी","Google Drive disaster recovery":"Google Drive आपदा रिकवरी","Drive backups are not configured":"Drive बैकअप कॉन्फ़िगर नहीं है","Backup verification":"बैकअप सत्यापन","Back up now":"अभी बैकअप लें","Verify":"सत्यापित करें","Download backup file":"बैकअप फ़ाइल डाउनलोड करें","Restore from file…":"फ़ाइल से पुनर्स्थापित करें…",
    "English":"अंग्रेज़ी","Tamil":"तमिल","Tamil + English":"तमिल + अंग्रेज़ी","Hindi":"हिंदी",
    "Sales overview":"बिक्री अवलोकन","Payment methods":"भुगतान विधियाँ","Top products":"शीर्ष उत्पाद","Low stock alerts":"कम स्टॉक चेतावनी","Recent transactions":"हाल की लेनदेन","Today's revenue":"आज का राजस्व","Orders":"ऑर्डर","Items sold":"बेची गई वस्तुएँ","Avg. order value":"औसत ऑर्डर मूल्य","Gross profit":"सकल लाभ","Last 7 days":"पिछले 7 दिन","Last 30 days":"पिछले 30 दिन","Detailed reports":"विस्तृत रिपोर्ट",
    "GST filing & archive":"GST फाइलिंग और संग्रह","Export GST CSV":"GST CSV निर्यात","GST Bill":"GST बिल","Word":"Word","Print / Save PDF":"प्रिंट / PDF के रूप में सहेजें","Sales by day":"दिनवार बिक्री","Sales summary":"बिक्री सारांश","Net sales":"शुद्ध बिक्री","Refunds":"रिफंड","Tax":"कर","Completed sales":"पूर्ण बिक्री",
    "Return / exchange":"वापसी / एक्सचेंज","Return":"वापसी","Exchange":"एक्सचेंज","Reason":"कारण","Settlement method":"निपटान विधि","Complete return":"वापसी पूरी करें",
    "Suppliers & Purchases":"सप्लायर और खरीद","Add supplier":"सप्लायर जोड़ें","Receive purchase":"खरीद प्राप्त करें","Purchase history":"खरीद इतिहास","Store details saved":"दुकान विवरण सहेजे गए","Payment successful":"भुगतान सफल","Completed":"पूर्ण","Voided":"रद्द","Close":"बंद करें","Save":"सहेजें","Save changes":"परिवर्तन सहेजें","Edit":"संपादित करें","Delete":"हटाएं","Search":"खोजें","Export CSV":"CSV निर्यात","Import CSV":"CSV आयात","Refresh":"रिफ्रेश","Restock":"स्टॉक भरें","No products found":"कोई उत्पाद नहीं मिला","No staff accounts found":"कोई स्टाफ खाता नहीं मिला","Active":"सक्रिय","Inactive":"निष्क्रिय","Role":"भूमिका","Status":"स्थिति","Date":"तारीख","Quantity":"मात्रा","Price":"मूल्य","Cost price":"लागत मूल्य","Selling price":"बिक्री मूल्य"
  }
};

let languageObserver = null;
let activeLocale = "en";
function installLanguageObserver() {
  if (languageObserver || !document.body) return;
  languageObserver = new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) applyLanguage(n, activeLocale); })));
  languageObserver.observe(document.body, { childList: true, subtree: true });
}
export function applyLanguage(root = document, locale = "en") {
  const lang = locale === "ta" || locale === "hi" ? locale : "en";
  activeLocale = lang;
  installLanguageObserver();
  const dict = TEXT[lang] || {};
  document.documentElement.lang = lang === "ta" ? "ta-IN" : lang === "hi" ? "hi-IN" : "en";
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const node of nodes) {
    const raw = node.nodeValue;
    if (node.__i18nSource === undefined) node.__i18nSource = raw;
    const source = node.__i18nSource;
    const trimmed = source.trim();
    if (!trimmed) continue;
    const translated = dict[trimmed] || trimmed;
    node.nodeValue = source.replace(trimmed, translated);
  }
  root.querySelectorAll?.("input[placeholder],textarea[placeholder],button[title],a[title],[aria-label]").forEach(el => {
    for (const attr of ["placeholder","title","aria-label"]) {
      const key = "data-i18n-original-" + attr;
      const current = el.getAttribute(attr);
      if (el.getAttribute(key) === null && current !== null) el.setAttribute(key, current);
      const source = el.getAttribute(key);
      if (source !== null) el.setAttribute(attr, dict[source] || source);
    }
  });
}
