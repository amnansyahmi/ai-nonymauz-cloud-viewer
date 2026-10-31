import type { VideoAudioSelection } from '../types';

export function AudioSelection({ selection }: { selection?: VideoAudioSelection }) {
  if (!selection) return null;
  const { music, effects, generated_effects } = selection;
  if (music.source === 'off' && effects.length === 0 && generated_effects === 0) return null;
  return <details className="film-editorial">
    <summary>Selected audio</summary>
    {music.source === 'catalog' && <p>Music: {music.title} — {music.artist}. {music.license}.
      {music.source_url?.startsWith('https://') && <> <a href={music.source_url} target="_blank" rel="noreferrer">Source</a></>}
    </p>}
    {music.source === 'generated' && <p>Music: generated fallback. No usable catalog track is available.</p>}
    {effects.length > 0 && <ul>{effects.map(effect => <li key={`${effect.event}-${effect.id}`}>
      {effect.event}: {effect.title} — {effect.artist}. {effect.license}.
      {effect.source_url.startsWith('https://') && <> <a href={effect.source_url} target="_blank" rel="noreferrer">Source</a></>}
    </li>)}</ul>}
    {generated_effects > 0 && <p>{generated_effects} generated sound cues used where catalog effects were unavailable.</p>}
  </details>;
}
