import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ApiClient } from '../api/client';
import { SceneThumbnail, VideoPlanEditor } from '../components/VideoPlanEditor';
import { DEFAULT_VIDEO_REQUEST } from '../video';
import { deleteScene, duplicateScene, moveScene, retime } from '../videoV2';
import type { ProjectPlan } from '../videoV2';
import fixture from './fixtures/video-v2.json';
const project = fixture as ProjectPlan;
const total = (p: ProjectPlan) => p.scenes.reduce((sum,s) => sum+s.duration_frames-s.transition.frames,0);
afterEach(() => vi.unstubAllGlobals());

describe('V2 planning', () => {
  it('retimes edits to exactly the requested integer frame budget', () => {
    for (let i=0;i<4;i++) {
      const copy = structuredClone(project);
      copy.scenes[i].duration_frames += 37;
      const result = retime(copy,copy.scenes);
      expect(total(result)).toBe(project.request.duration*project.request.fps);
      expect(result.scenes.every(s => Number.isInteger(s.duration_frames))).toBe(true);
    }
  });
  it('moves scenes and removes a final overlap without mutating input', () => {
    const copy = structuredClone(project);
    copy.scenes[2].transition = { kind: 'crossfade', frames: 12, rationale: 'Same environment' };
    const old = JSON.stringify(copy);
    const result = moveScene(copy,2,1);
    expect(result.scenes[3].id).toBe(copy.scenes[2].id);
    expect(result.scenes[3].transition.kind).toBe('cut');
    expect(JSON.stringify(copy)).toBe(old);
    expect(total(result)).toBe(360);
  });
  it('duplicates with a new identity and guards the scene count', () => {
    const result = duplicateScene(project,0,'new-scene');
    expect(result.scenes).toHaveLength(5);
    expect(result.scenes[1].id).toBe('new-scene');
    expect(total(result)).toBe(360);
    expect(() => duplicateScene(project,0,project.scenes[0].id)).toThrow();
  });
  it('deletes and retains exact duration, with at least two scenes', () => {
    const result = deleteScene(project,1);
    expect(result.scenes).toHaveLength(3);
    expect(total(result)).toBe(360);
    expect(() => deleteScene(deleteScene(result,0),0)).toThrow();
  });
  it('protects boundaries and late entrances', () => {
    expect(moveScene(project,0,-1)).toBe(project);
    const copy = structuredClone(project);
    copy.scenes[0].layers[0].motion.delay_frames=89;
    const result = retime(copy,copy.scenes);
    expect(result.scenes[0].duration_frames).toBeGreaterThan(89);
  });
  it('sends authenticated planning/revision/validation without hitting render', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({render_ready:false}));
    vi.stubGlobal('fetch',fetchMock);
    const client = new ApiClient('https://example.test','test-key');
    await client.videoPlan(project.request);
    await client.reviseVideoPlan(project,'motion','Use a gentle drift','beat-0');
    await client.validateVideoPlan(project);
    expect(fetchMock.mock.calls.map(c=>c[0])).toEqual([
      'https://example.test/v1/video/v2/plan','https://example.test/v1/video/v2/revise','https://example.test/v1/video/v2/validate']);
    expect(fetchMock.mock.calls.every(c=>c[1].headers.get('Authorization')==='Bearer test-key')).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).scene_id).toBe('beat-0');
  });
  it('renders accessible planning controls without claiming export support', () => {
    const html=renderToString(<VideoPlanEditor available client={new ApiClient('https://example.test')} form={DEFAULT_VIDEO_REQUEST}/>);
    expect(html).toContain('does not export video');
    expect(html).toContain('Plan storyboard');
    expect(html).toContain('aria-live="polite"');
  });
  it('escapes model-authored text in composition sketches', () => {
    const scene=structuredClone(project.scenes[0]);
    scene.layers[0].kind='text';scene.layers[0].text='<script>bad()</script>';
    const html=renderToString(<SceneThumbnail project={project} scene={scene}/>);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Composition sketch:');
  });
});
