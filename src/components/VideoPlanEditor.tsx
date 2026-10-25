import { useEffect, useRef, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { VideoGenerateRequest } from '../types';
import type { Direction, PlanResponse, PlanValidation, ProjectPlan, ScenePlan } from '../videoV2';
import { deleteScene, duplicateScene, moveScene, retime } from '../videoV2';
import '../video-v2.css';

const directions: Direction[] = ['premium_product', 'cinematic_brand', 'kinetic_editorial', 'illustrated_explainer', 'parallax_story', 'stylized_3d', 'minimal_corporate', 'dynamic_infographic', 'social_promo', 'documentary', 'futuristic_technology', 'playful_story'];

export function SceneThumbnail({ scene, project }: { scene: ScenePlan; project: ProjectPlan }) {
  return <div className="v2-thumbnail" role="img" aria-label={`Composition sketch: ${scene.visual_description}`}
    style={{ background: project.style.background, aspectRatio: project.request.aspect_ratio.replace(':', '/') }}>
    {scene.layers.map(layer => <span key={layer.id} style={{ position: 'absolute', left: `${layer.x*100}%`, top: `${layer.y*100}%`,
      width: `${layer.width*100}%`, height: `${layer.height*100}%`, color: project.style[layer.color_role],
      background: layer.kind === 'text' ? 'transparent' : project.style[layer.color_role],
      borderRadius: layer.kind === 'circle' ? '50%' : 2, opacity: layer.depth === 'background' ? .45 : 1,
      fontFamily: project.style.typography === 'mono' ? 'monospace' : project.style.typography === 'serif' ? 'serif' : 'sans-serif',
      zIndex: layer.depth === 'foreground' ? 3 : layer.depth === 'middle' ? 2 : 1 }}>
      {layer.kind === 'text' ? layer.text : layer.kind === 'image' ? 'Image' : ''}
    </span>)}
  </div>;
}

export function VideoPlanEditor({ client, form, available = false }: { client: ApiClient; form: VideoGenerateRequest; available?: boolean }) {
  const [project, setProject] = useState<ProjectPlan>();
  const [report, setReport] = useState<PlanValidation>();
  const [direction, setDirection] = useState<Direction | ''>('');
  const [diversity, setDiversity] = useState<'conservative' | 'balanced' | 'experimental'>('balanced');
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [instruction, setInstruction] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function perform(operation: (signal: AbortSignal) => Promise<PlanResponse | PlanValidation>) {
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await operation(next.signal);
      if (next.signal.aborted) return;
      setReport(response);
      if ('project' in response) {
        setProject(response.project);
        setNotice(response.invalidated_stages?.length ? `Updated. Stages requiring regeneration: ${response.invalidated_stages.join(', ')}.` : 'Plan ready for review.');
      } else setNotice('Schema and timing validated. Review the diagnostics below.');
    } catch (reason) {
      if (!next.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (!next.signal.aborted) setBusy(false); }
  }
  function edit(change: (value: ProjectPlan) => ProjectPlan) {
    if (!project) return;
    try { setProject(change(project)); setReport(undefined); setNotice('Edits need validation.'); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function patchScene(index: number, patch: Partial<ScenePlan>) {
    edit(p => ({ ...p, scenes: p.scenes.map((scene,i) => i === index ? { ...scene, ...patch } : scene) }));
  }
  function exportPlan() {
    if (!project) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'video-project-v2.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="panel v2-editor">
    <summary>Creative storyboard · V2 planning preview</summary>
    <p>Explore a new storyboard using the brief below. Sketches show composition only; this preview does not export video.</p>
    <div className="v2-controls">
      <label>Direction<select value={direction} onChange={e => setDirection(e.target.value as Direction | '')} disabled={busy}>
        <option value="">Automatic</option>{directions.map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}
      </select></label>
      <label>Variation<select value={diversity} onChange={e => setDiversity(e.target.value as typeof diversity)} disabled={busy}>
        <option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="experimental">Experimental</option>
      </select></label>
      <label>Seed<input type="number" min={0} max={4294967295} step={1} value={seed} onChange={e => setSeed(Number(e.target.value))} disabled={busy} /></label>
    </div>
    <div className="v2-actions">
      <button type="button" disabled={!available || busy || form.prompt.trim().length < 3 || !Number.isInteger(seed) || seed < 0 || seed > 4294967295}
        onClick={() => void perform(signal => client.videoPlan({ prompt: form.prompt, duration: form.duration, fps: 30,
          aspect_ratio: form.aspect_ratio, language: form.language.startsWith('ms') ? 'ms' : 'en', direction: direction || null,
          diversity, seed, asset_ids: [] }, signal))}>{busy ? 'Working…' : 'Plan storyboard'}</button>
      {busy && <button type="button" className="secondary" onClick={() => { controller.current?.abort(); setBusy(false); setNotice('Stopped waiting. The server may finish an in-flight planning call.'); }}>Stop waiting</button>}
    </div>
    {!available && <p className="field-help">Connect to a backend with V2 planning enabled to create a storyboard.</p>}
    <p className="field-help">Planning uses your configured AI provider. Uploaded images remain in the existing video flow; this planning preview receives the written brief only.</p>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <p role="status" aria-live="polite">{notice}</p>
    {project && <>
      <h2>{project.brief.visual_concept}</h2><p>{project.brief.narrative_strategy}</p>
      <div className="v2-timeline" aria-label="Storyboard timeline">{project.scenes.map((scene,index) => <a key={scene.id} href={`#v2-${scene.id}`} style={{ flexGrow: scene.duration_frames }}>
        {index+1} · {((scene.duration_frames-scene.transition.frames)/project.request.fps).toFixed(1)}s
      </a>)}</div>
      <div className="v2-actions"><button type="button" disabled={busy} onClick={() => void perform(signal => client.validateVideoPlan(project, signal))}>Validate edits</button>
        <button type="button" className="secondary" onClick={exportPlan}>Download plan JSON</button></div>
      <label className="v2-instruction">Revision instruction<textarea value={instruction} maxLength={1000} onChange={e => setInstruction(e.target.value)} placeholder="What should change?" disabled={busy} /></label>
      <button type="button" className="secondary" disabled={busy || instruction.trim().length < 3} onClick={() => void perform(signal => client.reviseVideoPlan(project, 'storyboard', instruction, undefined, signal))}>Regenerate storyboard</button>
      <div className="v2-scenes">{project.scenes.map((scene,index) => <article id={`v2-${scene.id}`} key={scene.id} className="v2-scene">
        <SceneThumbnail scene={scene} project={project} />
        <div className="v2-scene-content"><h3>Scene {index+1} · {scene.composition.replaceAll('_',' ')}</h3><p>{scene.objective}</p>
          <label>Scene headline<input value={scene.headline} maxLength={72} disabled={busy} onChange={e => patchScene(index,{ headline: e.target.value })} /></label>
          <label>Narration<textarea value={scene.narration} maxLength={250} disabled={busy} onChange={e => patchScene(index,{ narration: e.target.value })} /></label>
          <details><summary>Timing and motion</summary>
            <label>Duration in frames<input type="number" min={24} max={900} step={1} disabled={busy} value={scene.duration_frames} onChange={e => patchScene(index,{ duration_frames: Number(e.target.value) })} /></label>
            <button type="button" disabled={busy} className="secondary" onClick={() => edit(p => retime(p,p.scenes))}>Fit timing to video duration</button>
            <label>Camera<select value={scene.camera} disabled={busy} onChange={e => patchScene(index,{ camera: e.target.value as ScenePlan['camera'] })}>
              {['locked','push','pull','pan_left','pan_right','orbit','parallax'].map(value => <option key={value}>{value}</option>)}
            </select></label>
            <p>{scene.transition.kind.replaceAll('_',' ')} · {scene.transition.rationale}</p>
            {scene.layers.filter(layer => layer.kind === 'text').map(layer => <label key={layer.id}>On-screen text · {layer.id}<input value={layer.text} disabled={busy} maxLength={120}
              onChange={e => patchScene(index,{ layers: scene.layers.map(l => l.id === layer.id ? {...l,text:e.target.value} : l) })} /></label>)}
          </details>
          <div className="v2-actions">
            <button type="button" className="secondary" aria-label={`Move scene ${index+1} earlier`} disabled={busy || index===0} onClick={() => edit(p => moveScene(p,index,-1))}>Earlier</button>
            <button type="button" className="secondary" aria-label={`Move scene ${index+1} later`} disabled={busy || index===project.scenes.length-1} onClick={() => edit(p => moveScene(p,index,1))}>Later</button>
            <button type="button" className="secondary" disabled={busy || project.scenes.length>=10} onClick={() => edit(p => duplicateScene(p,index,`scene-${crypto.randomUUID()}`))}>Duplicate</button>
            <button type="button" className="secondary" disabled={busy || project.scenes.length<=2} onClick={() => edit(p => deleteScene(p,index))}>Delete</button>
          </div>
          <div className="v2-actions">{(['scene','motion'] as const).map(stage => <button key={stage} type="button" className="secondary" disabled={busy || instruction.trim().length<3}
            onClick={() => void perform(signal => client.reviseVideoPlan(project,stage,instruction,scene.id,signal))}>Regenerate {stage}</button>)}</div>
        </div>
      </article>)}</div>
      {report && <details><summary>Planning diagnostics · {report.diagnostics.length}</summary>
        <p>{report.metrics.unique_compositions} compositions · {report.metrics.scene_count} scenes. These are metadata checks, not rendered-video quality measurements.</p>
        <ul>{report.diagnostics.map((issue,i) => <li key={i}>{issue.scene_id && `${issue.scene_id}: `}{issue.detail}</li>)}</ul>
      </details>}
    </>}
  </details>;
}
