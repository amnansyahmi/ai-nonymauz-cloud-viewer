import type { BrandFont, BrandKit } from './types';

/** Saved per browser: a kit is a convenience, not shared or synced data. */
export const BRAND_KIT_STORAGE_KEY = 'ai-nonymauz-brand-kits';

export interface SavedBrandKit extends BrandKit {
  id: string;
  /** Prepared logo image as a data URL; added to the uploads when applied. */
  logo?: string;
}

export const BRAND_FONT_LABELS: Record<BrandFont, string> = {
  inter: 'Inter', grotesk: 'Archivo Black', editorial: 'Playfair Display', condensed: 'League Gothic',
  mono: 'Space Mono', montserrat: 'Montserrat', poppins: 'Poppins', outfit: 'Outfit', nunito: 'Nunito',
  oswald: 'Oswald'
};

const HEX = /^#[0-9a-f]{6}$/i;

function clean(kit: SavedBrandKit): SavedBrandKit | null {
  if (!kit || typeof kit.id !== 'string' || typeof kit.name !== 'string') return null;
  return {
    id: kit.id,
    name: kit.name.slice(0, 60),
    primary: kit.primary && HEX.test(kit.primary) ? kit.primary : undefined,
    secondary: kit.secondary && HEX.test(kit.secondary) ? kit.secondary : undefined,
    ground: kit.ground && HEX.test(kit.ground) ? kit.ground : undefined,
    font: kit.font && kit.font in BRAND_FONT_LABELS ? kit.font : undefined,
    logo: typeof kit.logo === 'string' && kit.logo.startsWith('data:image/') ? kit.logo : undefined
  };
}

export function loadBrandKits(): SavedBrandKit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BRAND_KIT_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(clean).filter((kit): kit is SavedBrandKit => kit !== null) : [];
  } catch {
    return [];
  }
}

export function saveBrandKits(kits: SavedBrandKit[]): boolean {
  try {
    localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(kits));
    return true;
  } catch {
    // Private mode or a full quota: the kit still applies to this session.
    return false;
  }
}

/** The part of a kit the backend takes; the logo travels as an image. */
export function brandPayload(kit: SavedBrandKit | null): BrandKit | undefined {
  if (!kit) return undefined;
  const { name, primary, secondary, ground, font } = kit;
  return { name, primary, secondary, ground, font };
}
