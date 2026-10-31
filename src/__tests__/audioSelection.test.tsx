import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AudioSelection } from '../components/AudioSelection';

describe('audio selection report', () => {
  it('supports older responses and disabled audio without a misleading panel', () => {
    expect(renderToString(<AudioSelection />)).toBe('');
    expect(renderToString(<AudioSelection selection={{ music: { source: 'off' }, effects: [], generated_effects: 0 }} />)).toBe('');
  });
  it('stays quiet while the backend has no audio library', () => {
    expect(renderToString(<AudioSelection selection={{ music: { source: 'generated' }, effects: [], generated_effects: 3,
      catalog_tracks: 0 }} />)).toBe('');
  });
  it('reports generated fallback explicitly', () => {
    const html = renderToString(<AudioSelection selection={{ music: { source: 'generated' }, effects: [], generated_effects: 3 }} />);
    expect(html).toContain('generated fallback');
    expect(html).toContain('3');
    expect(html).toContain('generated sound cues');
  });
  it('shows track credits while refusing executable source links', () => {
    const html = renderToString(<AudioSelection selection={{
      music: { source: 'catalog', title: 'Piano', artist: 'Composer', license: 'Licensed', source_url: 'https://example.com/track' },
      effects: [{ id: 'tap', event: 'tap', title: '<script>', artist: 'Artist', license: 'CC0', source_url: 'javascript:alert(1)' }],
      generated_effects: 0
    }} />);
    expect(html).toContain('Piano');
    expect(html).toContain('https://example.com/track');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('generated fallback');
  });
});
