/** V2 planning contract. Deliberately separate from the deployed V1 render request. */
export type Composition = 'cinematic' | 'editorial' | 'product_showcase' | 'split_screen' | 'parallax' | 'diagram' | 'isometric' | 'infographic' | 'kinetic_typography' | 'abstract' | 'ui_demo' | 'spatial';
export type Direction = 'premium_product' | 'cinematic_brand' | 'kinetic_editorial' | 'illustrated_explainer' | 'parallax_story' | 'stylized_3d' | 'minimal_corporate' | 'dynamic_infographic' | 'social_promo' | 'documentary' | 'futuristic_technology' | 'playful_story';
export interface PlanRequest {
  prompt: string; duration: number; fps: 24 | 30; aspect_ratio: '9:16' | '16:9' | '1:1';
  language: 'ms' | 'en'; direction: Direction | null; diversity: 'conservative' | 'balanced' | 'experimental';
  seed: number; asset_ids: string[];
}
export interface MotionPlan {
  entrance: 'fade' | 'rise' | 'slide' | 'scale' | 'reveal';
  behavior: 'hold' | 'drift' | 'pulse' | 'orbit' | 'trace'; exit: 'fade' | 'slide' | 'scale';
  easing: 'linear' | 'smooth' | 'cubic_out' | 'spring'; delay_frames: number; amplitude: number;
}
export interface LayerPlan {
  id: string; depth: 'background' | 'middle' | 'foreground'; kind: 'text' | 'image' | 'circle' | 'rectangle' | 'line' | 'particles';
  description: string; text: string; asset_id: string | null; x: number; y: number; width: number; height: number;
  color_role: 'foreground' | 'accent' | 'secondary'; motion: MotionPlan;
}
export interface ScenePlan {
  id: string; objective: string; narrative_beat: string; visual_description: string; composition: Composition;
  composition_options: Composition[]; duration_frames: number; camera: 'locked' | 'push' | 'pull' | 'pan_left' | 'pan_right' | 'orbit' | 'parallax';
  headline: string; narration: string; audio_cue: string; layers: LayerPlan[];
  transition: { kind: 'cut' | 'crossfade' | 'mask_wipe' | 'match_cut' | 'depth' | 'motion_match'; frames: number; rationale: string };
}
export interface ProjectPlan {
  schema_version: '2.0'; request: PlanRequest;
  brief: { schema_version: '2.0'; objective: string; audience: string; direction: Direction; emotional_tone: string;
    narrative_strategy: string; visual_concept: string; pacing: 'calm' | 'measured' | 'energetic';
    camera_language: string; audio_direction: string; supplied_facts: string[] };
  style: { background: string; foreground: string; accent: string; secondary: string; typography: 'sans' | 'serif' | 'mono';
    lighting: 'soft' | 'studio' | 'daylight' | 'neon'; texture: 'clean' | 'grain' | 'paper';
    motion_personality: 'precise' | 'organic' | 'playful'; identity_notes: string };
  assets: Array<{ id: string; kind: 'reference' | 'background' | 'foreground' | 'illustration' | 'texture' | 'audio';
    description: string; source: 'user' | 'procedural' | 'generation_required'; provenance: string; license: string; transparency_required: boolean }>;
  scenes: ScenePlan[];
}
export interface PlanValidation {
  render_ready: boolean; metrics: Record<string, number | string>;
  diagnostics: Array<{ scene_id: string; code: string; detail: string }>;
}
export interface PlanResponse extends PlanValidation {
  project: ProjectPlan; render_blocker: string; invalidated_stages?: string[];
  telemetry: { planning_seconds: number; provider_calls: number | null; reported_tokens: number | null; cost: number | null };
}
export type RevisionStage = 'brief' | 'storyboard' | 'scene' | 'motion';

/** Retiming preserves the exact total frame budget and removes a final overlap. */
export function retime(project: ProjectPlan, scenes: ScenePlan[]): ProjectPlan {
  if (scenes.length < 2 || scenes.length > 10) throw new Error('A storyboard needs 2–10 scenes.');
  if (scenes.some(scene => !Number.isInteger(scene.duration_frames) || scene.duration_frames < 24 || scene.duration_frames > 900)) {
    throw new Error('Scene durations must be whole frames between 24 and 900.');
  }
  const next = structuredClone(scenes);
  const last = next[next.length - 1];
  last.transition = { kind: 'cut', frames: 0, rationale: 'End of film' };
  const total = project.request.duration * project.request.fps;
  const minimums = next.map(scene => Math.max(24, scene.transition.frames + 1,
    ...scene.layers.map(layer => layer.motion.delay_frames + 1 - scene.transition.frames)));
  const spare = total - minimums.reduce((a,b) => a+b, 0);
  if (spare < 0) throw new Error('Too many scenes for this duration and motion timing.');
  const weights = next.map(scene => Math.max(1, scene.duration_frames - scene.transition.frames));
  const sum = weights.reduce((a,b) => a+b,0);
  const exact = weights.map(weight => spare * weight / sum);
  const frames = exact.map((v,i) => Math.floor(v) + minimums[i]);
  const order = exact.map((v,i) => ({ i, remainder: v % 1 })).sort((a,b) => b.remainder-a.remainder || a.i-b.i);
  const difference = total - frames.reduce((a,b) => a+b,0);
  for (let i=0; i<difference; i++) frames[order[i].i]++;
  next.forEach((scene,i) => { scene.duration_frames = frames[i] + scene.transition.frames; });
  return { ...project, scenes: next };
}

export function moveScene(project: ProjectPlan, index: number, offset: -1 | 1): ProjectPlan {
  const target = index + offset;
  if (index < 0 || index >= project.scenes.length || target < 0 || target >= project.scenes.length) return project;
  const scenes = [...project.scenes];
  [scenes[index],scenes[target]] = [scenes[target],scenes[index]];
  return retime(project, scenes);
}
export function duplicateScene(project: ProjectPlan, index: number, id: string): ProjectPlan {
  if (project.scenes.some(scene => scene.id === id)) throw new Error('Scene ID already exists.');
  const scenes = [...project.scenes];
  scenes.splice(index+1, 0, { ...structuredClone(scenes[index]), id });
  return retime(project, scenes);
}
export function deleteScene(project: ProjectPlan, index: number): ProjectPlan {
  return retime(project, project.scenes.filter((_,i) => i !== index));
}
