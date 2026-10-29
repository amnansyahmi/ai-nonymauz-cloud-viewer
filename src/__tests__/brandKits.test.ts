import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND_KIT_STORAGE_KEY, brandPayload, loadBrandKits, saveBrandKits } from '../brandKits';
import { DEFAULT_VIDEO_REQUEST, FILM_BLOCK_LABELS } from '../video';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(), key: () => null, length: 0
  } as Storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('brand kits', () => {
  it('round-trips kits and drops invalid fields', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(saveBrandKits([{ id: 'k1', name: 'KretivOS', primary: '#e83e8c', ground: 'maroon', font: 'poppins',
      logo: 'data:image/png;base64,AA==' }])).toBe(true);
    const [kit] = loadBrandKits();
    expect(kit).toMatchObject({ id: 'k1', name: 'KretivOS', primary: '#e83e8c', font: 'poppins' });
    expect(kit.ground).toBeUndefined();
    // The logo travels as an image, never inside the brand payload.
    expect(brandPayload(kit)).toEqual({ name: 'KretivOS', primary: '#e83e8c', secondary: undefined, ground: undefined, font: 'poppins' });
    expect(brandPayload(null)).toBeUndefined();
  });

  it('survives storage that throws or holds junk', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(loadBrandKits()).toEqual([]);
    expect(saveBrandKits([])).toBe(false);
    const store = memoryStorage();
    store.setItem(BRAND_KIT_STORAGE_KEY, '{not json');
    vi.stubGlobal('localStorage', store);
    expect(loadBrandKits()).toEqual([]);
  });

  it('turns music on by default and labels the graphic scenes', () => {
    expect(DEFAULT_VIDEO_REQUEST.music).toBe(true);
    for (const block of ['flow', 'fan', 'chaos', 'tags', 'ui'] as const) expect(FILM_BLOCK_LABELS[block]).toBeTruthy();
  });
});
