import { useRef, useState } from 'react';
import { BRAND_FONT_LABELS, loadBrandKits, saveBrandKits, type SavedBrandKit } from '../brandKits';
import type { BrandFont } from '../types';
import { prepareVideoImage } from '../videoImages';
import { ImageIcon, TrashIcon } from './Icons';

interface Props {
  kit: SavedBrandKit | null;
  disabled?: boolean;
  /** Called with the kit to use for this film, or null for none. */
  onChange: (kit: SavedBrandKit | null) => void;
}

const NEW_KIT: Omit<SavedBrandKit, 'id'> = { name: '', primary: '#e83e8c' };

function newId(): string {
  return `kit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function BrandKitPanel({ kit, disabled, onChange }: Props) {
  const [kits, setKits] = useState<SavedBrandKit[]>(() => loadBrandKits());
  const [message, setMessage] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);
  const saved = Boolean(kit && kits.some(item => item.id === kit.id));

  function edit(change: Partial<SavedBrandKit>) {
    if (kit) onChange({ ...kit, ...change });
    setMessage('');
  }

  function choose(value: string) {
    setMessage('');
    if (value === '') onChange(null);
    else if (value === 'new') onChange({ ...NEW_KIT, id: newId() });
    else onChange(kits.find(item => item.id === value) ?? null);
  }

  function save() {
    if (!kit) return;
    const named = { ...kit, name: kit.name.trim() || 'My brand' };
    const next = [...kits.filter(item => item.id !== named.id), named];
    setKits(next);
    onChange(named);
    setMessage(saveBrandKits(next) ? 'Saved in this browser.' : 'Could not save here (private mode?). It still applies to this video.');
  }

  function remove() {
    if (!kit) return;
    const next = kits.filter(item => item.id !== kit.id);
    setKits(next);
    saveBrandKits(next);
    onChange(null);
  }

  async function addLogo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareVideoImage(file);
      edit({ logo: prepared.data_url });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not read the logo.');
    } finally {
      if (logoInput.current) logoInput.current.value = '';
    }
  }

  const swatches = kit ? [kit.primary, kit.secondary, kit.ground].filter(Boolean) as string[] : [];

  return (
    <div className="brand-kit">
      <div className="brand-kit-head">
        <label>Brand kit
          <select value={kit ? (saved ? kit.id : 'new') : ''} disabled={disabled}
            onChange={event => choose(event.target.value)}>
            <option value="">None · use the style's colours</option>
            {kits.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            <option value="new">New kit…</option>
          </select>
        </label>
        {swatches.length > 0 && <span className="brand-swatches" aria-hidden="true">
          {swatches.map(colour => <i key={colour} style={{ background: colour }} />)}
        </span>}
      </div>
      {kit && <div className="brand-kit-fields">
        <label>Name <input value={kit.name} maxLength={60} placeholder="e.g. KretivOS" disabled={disabled}
          onChange={event => edit({ name: event.target.value })} /></label>
        <div className="brand-colours">
          <label>Main colour <input type="color" value={kit.primary ?? '#e83e8c'} disabled={disabled}
            onChange={event => edit({ primary: event.target.value })} /></label>
          <label><span><input type="checkbox" checked={Boolean(kit.secondary)} disabled={disabled}
            onChange={event => edit({ secondary: event.target.checked ? '#f59e0b' : undefined })} /> Second colour</span>
            <input type="color" value={kit.secondary ?? '#f59e0b'} disabled={disabled || !kit.secondary}
              onChange={event => edit({ secondary: event.target.value })} /></label>
          <label><span><input type="checkbox" checked={Boolean(kit.ground)} disabled={disabled}
            onChange={event => edit({ ground: event.target.checked ? '#22091a' : undefined })} /> Background</span>
            <input type="color" value={kit.ground ?? '#22091a'} disabled={disabled || !kit.ground}
              onChange={event => edit({ ground: event.target.value })} /></label>
        </div>
        <label>Font <select value={kit.font ?? ''} disabled={disabled}
          onChange={event => edit({ font: (event.target.value || undefined) as BrandFont | undefined })}>
          <option value="">Style default</option>
          {(Object.keys(BRAND_FONT_LABELS) as BrandFont[]).map(font =>
            <option value={font} key={font}>{BRAND_FONT_LABELS[font]}</option>)}
        </select></label>
        <div className="brand-logo">
          {kit.logo ? <img src={kit.logo} alt={`${kit.name || 'Brand'} logo`} /> : <span className="brand-logo-empty">No logo</span>}
          <button type="button" className="secondary" disabled={disabled} onClick={() => logoInput.current?.click()}>
            <ImageIcon /> {kit.logo ? 'Replace logo' : 'Add logo'}
          </button>
          {kit.logo && <button type="button" className="secondary" disabled={disabled} onClick={() => edit({ logo: undefined })}>Remove</button>}
          <input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp"
            onChange={event => void addLogo(event.target.files)} />
        </div>
        <div className="brand-kit-actions">
          <button type="button" className="secondary" disabled={disabled} onClick={save}>{saved ? 'Save changes' : 'Save kit'}</button>
          {saved && <button type="button" className="secondary" disabled={disabled} onClick={remove} aria-label="Delete brand kit"><TrashIcon /> Delete</button>}
        </div>
        <p className="field-help">{message || 'Kits are saved in this browser. The logo joins your images when the kit is applied.'}</p>
      </div>}
    </div>
  );
}
