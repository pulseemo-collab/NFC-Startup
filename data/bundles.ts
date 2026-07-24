import type { BundleDef } from "@/types";

// Modular business presets. `kit` maps productId -> quantity.
// `name` is the Albanian, customer-recognizable business type. Ids stay stable.
export const bundles: BundleDef[] = [
  { id: "cafe", name: "Kafe", stars: 5, kit: { stand: 1, reviewcard: 2, wifi: 1, social: 1 } },
  { id: "restaurant", name: "Restorant", stars: 5, kit: { stand: 2, reviewcard: 3, menu: 3, wifi: 1, social: 1 } },
  { id: "barber", name: "Berber", stars: 5, kit: { stand: 1, reviewcard: 2, social: 1 } },
  { id: "salon", name: "Sallon bukurie", stars: 5, kit: { stand: 1, reviewcard: 3, social: 1, bizcard: 1 } },
  { id: "hotel", name: "Hotel", stars: 4, kit: { stand: 2, wifi: 5, menu: 3, bizcard: 2 } },
  { id: "gym", name: "Palestër", stars: 4, kit: { stand: 1, reviewcard: 3, social: 2, wifi: 1 } },
  { id: "dental", name: "Klinikë dentare", stars: 4, kit: { stand: 1, reviewcard: 2, bizcard: 2 } },
  { id: "retail", name: "Dyqan", stars: 4, kit: { stand: 1, reviewcard: 2, social: 1, wifi: 1 } },
  { id: "carwash", name: "Lavazh", stars: 4, kit: { stand: 1, reviewcard: 2, social: 1 } },
  { id: "realestate", name: "Agjenci imobiliare", stars: 4, kit: { bizcard: 3, stand: 1, reviewcard: 2 } },
  { id: "office", name: "Zyrë", stars: 3, kit: { bizcard: 3, stand: 1, wifi: 1 } },
];
