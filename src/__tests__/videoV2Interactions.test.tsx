// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { VideoPlanEditor } from '../components/VideoPlanEditor';
import { DEFAULT_VIDEO_REQUEST } from '../video';
import fixture from './fixtures/video-v2.json';

const containers: HTMLDivElement[]=[];
afterEach(() => { containers.forEach(c=>c.remove()); containers.length=0; vi.unstubAllGlobals(); });
function button(container: HTMLElement, text: string) {
  const found = Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}

describe('Planning editor interactions (DOM, not browser layout)', () => {
  it('plans, reorders, duplicates, deletes and validates the edited payload', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    let validated: typeof fixture | undefined;
    const mock=vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/validate')) {
        validated=JSON.parse(init.body as string);
        return Response.json({render_ready:false,metrics:{},diagnostics:[]});
      }
      return Response.json({project:fixture,render_ready:false,metrics:{unique_compositions:4,scene_count:4},diagnostics:[],telemetry:{}});
    });
    vi.stubGlobal('fetch',mock);
    const container=document.createElement('div'); document.body.append(container); containers.push(container);
    const root=createRoot(container);
    try {
      await act(async()=>root.render(<VideoPlanEditor available client={new ApiClient('https://example.test','offline')} form={DEFAULT_VIDEO_REQUEST}/>));
      await act(async()=>button(container,'Plan storyboard').click());
      expect(container.querySelectorAll('article')).toHaveLength(4);
      await act(async()=>button(container,'Later').click());
      expect(container.querySelector('article')?.id).toBe('v2-beat-1');
      await act(async()=>button(container,'Duplicate').click());
      expect(container.querySelectorAll('article')).toHaveLength(5);
      await act(async()=>button(container,'Delete').click());
      expect(container.querySelectorAll('article')).toHaveLength(4);
      await act(async()=>button(container,'Validate edits').click());
      expect(validated?.scenes.reduce((sum,s)=>sum+s.duration_frames-s.transition.frames,0)).toBe(360);
      expect(new Set(validated?.scenes.map(s=>s.id)).size).toBe(4);
      expect(container.textContent).toContain('Schema and timing validated');
    } finally { await act(async()=>root.unmount()); }
  });

  it('exports only after an explicit action and returns the created job', async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const onExport=vi.fn();
    const fetchMock=vi.fn().mockImplementation(async(url:string)=>{
      if(url.endsWith('/render')) return Response.json({job_id:'vid_export',status:'queued',renderer:'v2-pillow-1'});
      if(url.endsWith('/validate')) return Response.json({render_ready:true,metrics:{},diagnostics:[]});
      return Response.json({project:fixture,render_ready:false,metrics:{},diagnostics:[],telemetry:{}});
    });
    vi.stubGlobal('fetch',fetchMock);
    const container=document.createElement('div');document.body.append(container);containers.push(container);
    const root=createRoot(container);
    try {
      await act(async()=>root.render(<VideoPlanEditor available renderAvailable onExport={onExport} client={new ApiClient('https://example.test','offline')} form={DEFAULT_VIDEO_REQUEST}/>));
      await act(async()=>button(container,'Plan storyboard').click());
      expect(fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/render'))).toBe(false);
      await act(async()=>button(container,'Render preview').click());
      expect(onExport).toHaveBeenCalledWith(expect.objectContaining({job_id:'vid_export'}));
      const request=fetchMock.mock.calls.find(call=>String(call[0]).endsWith('/render'));
      expect(request).toBeDefined();
    } finally {await act(async()=>root.unmount());}
  });

  it('shows provider errors without losing the page', async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Provider unavailable'}),{status:503})));
    const container=document.createElement('div');document.body.append(container);containers.push(container);
    const root=createRoot(container);
    try {
      await act(async()=>root.render(<VideoPlanEditor available client={new ApiClient('https://example.test')} form={DEFAULT_VIDEO_REQUEST}/>));
      await act(async()=>button(container,'Plan storyboard').click());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Provider unavailable');
      expect(button(container,'Plan storyboard').disabled).toBe(false);
    } finally { await act(async()=>root.unmount()); }
  });
});
