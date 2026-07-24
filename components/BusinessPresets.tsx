"use client";

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Car,
  Coffee,
  Dumbbell,
  Hotel,
  House,
  Scissors,
  SmilePlus,
  Sparkles,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import type { BundleDef } from "@/types";

// Preset id -> business icon. Falls back to a neutral icon for new presets.
const ICONS: Record<string, LucideIcon> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  barber: Scissors,
  salon: Sparkles,
  hotel: Hotel,
  gym: Dumbbell,
  dental: SmilePlus,
  retail: Store,
  carwash: Car,
  realestate: House,
  office: Building2,
};

export default function BusinessPresets({
  presets,
  activePreset,
  onSelect,
}: {
  presets: BundleDef[];
  activePreset: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((b) => {
        const active = activePreset === b.id;
        const Icon = ICONS[b.id] ?? Briefcase;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface hover:border-accent"
            }`}
          >
            <Icon
              aria-hidden
              strokeWidth={1.75}
              className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-accent"}`}
            />
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
