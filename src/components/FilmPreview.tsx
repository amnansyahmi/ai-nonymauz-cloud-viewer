import { useEffect, useRef, useState } from 'react';

interface FilmPreviewProps {
  html: string;
  width: number;
  height: number;
  /** Media sent by reference, by key: filled in here, never re-uploaded. */
  media?: Record<string, string>;
}

/** Put the local media map in front of the composition's own fill script. */
export function withMedia(html: string, media?: Record<string, string>): string {
  if (!media || !Object.keys(media).length) return html;
  const script = `<script>window.__hfMedia=${JSON.stringify(media).replace(/</g, '\\u003c')};</script>`;
  return html.includes('<head>') ? html.replace('<head>', `<head>${script}`) : script + html;
}

type PlayerState = 'loading' | 'ready' | 'error';

/**
 * Plays a HyperFrames composition in the browser before any render is paid for.
 *
 * The player is imported on demand so Chat and other views never load it, and
 * the element is created imperatively: it is a custom element with its own
 * attribute API, which avoids JSX typing workarounds. `sandbox-origin="opaque"`
 * keeps composition scripts from reaching this page's DOM or storage.
 */
export function FilmPreview({ html, width, height, media }: FilmPreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PlayerState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = host.current;
    if (!container) return;
    setState('loading');
    setMessage('');

    let player: HTMLElement | null = null;
    const onReady = () => { if (!cancelled) setState('ready'); };
    const onError = (event: Event) => {
      if (cancelled) return;
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setState('error');
      setMessage(detail?.message ?? 'The preview could not load.');
    };

    import('@hyperframes/player')
      .then(() => {
        if (cancelled) return;
        player = document.createElement('hyperframes-player');
        player.setAttribute('controls', '');
        player.setAttribute('sandbox-origin', 'opaque');
        player.setAttribute('width', String(width));
        player.setAttribute('height', String(height));
        player.setAttribute('srcdoc', withMedia(html, media));
        player.addEventListener('ready', onReady);
        player.addEventListener('error', onError);
        container.replaceChildren(player);
      })
      .catch(() => {
        if (!cancelled) {
          setState('error');
          setMessage('The preview player could not be loaded.');
        }
      });

    return () => {
      cancelled = true;
      player?.removeEventListener('ready', onReady);
      player?.removeEventListener('error', onError);
      container.replaceChildren();
    };
  }, [html, width, height, media]);

  return (
    <div className="film-preview" data-orientation={height > width ? 'portrait' : width > height ? 'landscape' : 'square'}>
      <div className="film-preview-frame" style={{ aspectRatio: `${width} / ${height}` }}>
        <div className="film-preview-player" ref={host} />
        {state === 'loading' && <div className="film-preview-overlay" role="status">Loading preview…</div>}
        {state === 'error' && <div className="film-preview-overlay is-error" role="alert">{message}</div>}
      </div>
    </div>
  );
}
