import type { OrderStatus } from "@/types";

// Central Albanian UI strings. Product NAMES stay English (in data/products.ts).
export const t = {
  appName: "NFC Reseller",
  tagline: "Katalogu i produkteve NFC dhe ndërtuesi i paketave",

  // dashboard (private route only — never referenced from the public site)
  ownerMode: "Paneli i Pronarit",
  back: "Kthehu",

  // catalog
  businessType: "Lloji i biznesit",
  businessTypeHelp: "Zgjidhni biznesin tuaj për të ngarkuar paketën e rekomanduar.",
  presetLoaded: "Paketa e rekomanduar u ngarkua",
  catalogTitle: "Produktet dhe çmimet",
  catalogTitleClient: "Produktet",
  catalogSubtitleOwner:
    "Shkruani koston tuaj — motori i çmimeve cakton çmimin e shitjes dhe e shpjegon atë.",
  catalogSubtitleClient: "Zgjidhni produktet për të ndërtuar paketën.",
  myCost: "Kostoja ime",
  myPrice: "Çmimi im",
  recommendedPrice: "E rekomanduar",
  useRecommended: "Rikthe te e rekomanduara",
  customPrice: "Çmim i yti",
  sellAt: "Çmimi i shitjes",
  profit: "Fitimi",
  margin: "Marzhi",
  included: "Përfshirë",
  add: "Shto",
  core: "bazë",
  addon: "shtesë",

  // quote panel
  quoteFor: "Oferta për",
  customBundle: "Paketë e personalizuar",
  totalUnits: "Numri i produkteve",
  yourCost: "Kostoja juaj",
  ifSeparately: "Nëse blihen veçmas",
  bundlePrice: "Çmimi i paketës",
  bundleDiscount: "Zbritja e paketës",
  yourProfit: "Fitimi juaj",
  customerSaves: "Klienti kursen",
  eachSuffix: "/copë",
  recommendedKit: "Paketa e rekomanduar",
  customised: "E personalizuar nga paketa e rekomanduar",
  resetTo: "Rivendos te",
  discountCapped: "Zbritja u ul për të mbrojtur marzhin minimal",
  emptyBundle: "Asnjë produkt i zgjedhur. Shtoni produkte ose zgjidhni një lloj biznesi më lart.",

  // settings
  settings: "Cilësimet",
  currency: "Monedha",
  minMargin: "Marzhi minimal (%)",
  minProfit: "Fitimi minimal",
  bundleDiscountPct: "Zbritja e paketës (%)",
  settingsSaved: "Cilësimet dhe kostot ruhen në këtë shfletues (localStorage).",
  close: "Mbyll",

  // orders
  orders: "Porositë",
  builder: "Ndërtuesi",
  closeOrder: "Mbyll porosinë",
  sendingOrder: "Duke dërguar porosinë...",
  orderSavedSuccess: "Porosia u ruajt me sukses.",
  saveError: "Ruajtja dështoi. Provoni përsëri.",
  loadError: "Ngarkimi i porosive dështoi.",
  orderNumber: "Numri i porosisë",
  businessName: "Emri i biznesit",
  customerName: "Emri i klientit",
  phone: "Numri i telefonit",
  address: "Adresa",
  deliveryAddress: "Adresa e dërgesës",
  notes: "Shënime",
  optional: "opsionale",
  required: "e detyrueshme",
  confirm: "Konfirmo",
  cancel: "Anulo",
  date: "Data",
  status: "Statusi",
  customerTotal: "Totali i klientit",
  internalCost: "Kostoja e brendshme",
  search: "Kërko",
  filterStatus: "Filtro sipas statusit",
  all: "Të gjitha",
  openClientView: "Hap pamjen e klientit",
  duplicate: "Dyfisho",
  delete: "Fshi",
  deleteConfirm: "Të fshihet kjo porosi? Ky veprim nuk kthehet.",
  ownerNotes: "Shënime private (vetëm pronari)",
  customerNotesLabel: "Shënime për klientin",
  products: "Produktet",
  quantity: "Sasia",
  unitPrice: "Çmimi/copë",
  privateInfo: "Informacion i brendshëm (privat)",
  customerInfo: "Informacion i klientit",
  noOrders: "Ende nuk ka porosi.",
  saveChanges: "Ruaj ndryshimet në porosi",
  saveAsNew: "Ruaje si porosi të re",
  editingOrder: "Duke edituar porosinë",
  cancelEdit: "Anulo editimin",
  editOrder: "Vazhdo editimin",
  buildAnother: "Porosi e Re",

  // customer confirmation page
  savedShort: "Kursyer",
  contactTitle: "Keni pyetje?",
  contactPhone: "+355 xx xxx xxxx",
  contactEmail: "info@nfcreseller.al",
  closingContact: "Do t'ju kontaktojmë së shpejti për të konfirmuar porosinë.",
  closingThanks: "Faleminderit që zgjodhët NFC Reseller!",

  // authentication (owner login — private route)
  loginTitle: "Hyni në panel",
  loginSubtitle: "Vetëm për pronarin. Përdorni llogarinë tuaj për të vazhduar.",
  emailLabel: "Email",
  passwordLabel: "Fjalëkalimi",
  loginButton: "Hyr",
  loginLoading: "Duke hyrë...",
  loginInvalid: "Email ose fjalëkalim i pasaktë.",
  loginGenericError: "Hyrja dështoi. Provoni përsëri.",
  logout: "Dil",

  // export / import
  exportData: "Eksporto të dhënat",
  importData: "Importo të dhënat",
  importConfirm:
    "Importimi do të zëvendësojë të dhënat aktuale (cilësimet, kostot dhe porositë). Të vazhdohet?",
  importInvalid: "Skedari nuk është i vlefshëm.",
  importSuccess: "Të dhënat u importuan me sukses.",
} as const;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Porosi e re",
  ready: "Gati për dërgim",
  delivered: "Dërguar",
};

// Same statuses, worded for the customer receipt (unchanged wording).
export const CLIENT_ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Dërguar",
  ready: "Gati",
  delivered: "Dorëzuar",
};

/** Workflow order — also drives the status tracker and the advance button. */
export const ORDER_STATUSES: OrderStatus[] = ["new", "ready", "delivered"];

/** The single step the owner can advance to, or undefined at the end. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  new: "ready",
  ready: "delivered",
};
