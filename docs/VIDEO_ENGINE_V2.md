# Video Engine V2 — audit and implementation plan

Audit date: 2026-10-26. Backend base: 6dc279fbbfdec0cfa1cc9d3ec852beb9db7bb63f.
Viewer base: d54c59a9e35d7854cb9cdd95c4954c89862ee898. Branch: feat/video-engine-v2 in both repositories.

## Current architecture
FastAPI app.py authenticates video mutations with require_diagnostics_auth.
motion_video/service.py plans synchronously through LiteLLM, optionally generates one Canvas
program and Gemini narration, then creates a Vercel Sandbox and uploads request/status/worker.
motion_video/storyboard.py validates and repairs model JSON. worker.py builds HTML/CSS scenes,
downloads motion-video-skill, installs Chromium/FFmpeg, and invokes its check/render CLI.
MP4 downloads proxy Sandbox files. Job history is a Sandbox listing; filesystem snapshots
expire after 24 hours. The React/Vite/TypeScript viewer retains its existing chat and video flows.

## Root causes of visual repetition
- StoryScene has five kinds and five visuals; validation mandates hero, screen, outro.
- Repair normalizes unrecognized visuals to dashboard or product and adds required UI content.
- Most non-image scenes share film-stage and the same visual DOM constructors.
- Generated Canvas drawing is restricted to ONE eligible middle scene; images disable it.
- Invalid generated drawings are replaced with preset scenes, including render-time fallback.
- No seed, numerical diversity objective, benchmark baseline or repeat penalty exists.
- Model temperature is 0.25; instructions encourage variation but do not measure it.
- Fixed scene counts, narrowly weighted timing and limited camera choices reinforce sameness.

## Existing strengths to preserve
Bounded image validation, authenticated rendering, provider failover with total planning timeout,
physical-product grounding, image index checks, explicit voice timing rejection, atomic status
updates, preview/standard dimensions, readable palette corrections, async Sandbox execution,
snapshot retention limits, download/delete/history routes and video regression tests.

## Reliability, performance and cost gaps
Planning precedes job creation, so failures have no durable checkpoint or job ID.
Sandbox persistence is temporary, not a durable job database. Processes do not survive resume.
No scene-level content-addressed cache, resume route, cancellation marker or concurrency lease.
Cold renders clone an unpinned upstream repository and install dependencies. Timeout budgets
are per command and can exceed the session budget. Failed custom visuals rerender the full film.
Success relies on upstream check/render output and file existence, without local stream/decode
validation. SFX may be omitted after sync failure. Voice generation is serial and trims phrases.
No measured production cost, CPU/memory profile or abandoned-job reconciliation is available.
No evidence yet of account-specific available Sandbox quota.

## Technology decision
Keep the working HTML/Chromium renderer for legacy jobs. Add an opt-in, typed V2 planning
contract first. Deterministic declarative scene data is preferable to model-authored executable
JavaScript. Reuse existing Python/Pydantic, provider routing and image limits. Keep FFmpeg as
the encoding/validation boundary. Do not add GSAP/Motion/R3F/Remotion solely for branding:
each adds runtime/dependency work; deterministic timestamps and a renderer capability contract
must come first. True 3D/shape morphing/character consistency require separate verified support.

## Ordered milestones and gates
1. Versioned creative brief, narrative/scene/layer/motion/transition schemas, seeded diversity,
   plan validation, plan-only API and metadata benchmark against ten prompt categories.
2. Frame-seekable motion primitives and composition-aware transitions that actually render;
   validate real MP4s and inspect sample frames. Expose only supported capabilities.
3. Content-addressed scene checkpoints, bounded retry, cooperative cancellation, process lease,
   output validation and an injected-failure recovery test. Document snapshot expiry limits.
4. Accessible storyboard editor with reorder/duplicate/delete, copy/duration/motion controls,
   preview and export. Preserve old jobs; validate edits on the server.
5. Reuse available narration provider, validate clips, synchronize captions and one style spec.
6. Deterministic QA, benchmark report, local performance measurements and CI checks.
   Never label synthetic/mocked-provider measurements as production performance or cost.

## Infrastructure alternative
For durable recovery beyond the Sandbox retention window, persist project/job/checkpoint
manifests in an existing database and outputs in object storage, dispatch to a bounded external
render worker. This is required before claiming indefinite recovery or fleet-wide concurrency
control. Keep rendering out of chat processes. No new paid provider is required for the initial
planning implementation. Provider calls and Sandbox renders retain their existing usage costs.

## Audit limits
This is a source audit, not a production load test. No live paid generation was started.
Visual, browser playback, quota and provider claims require subsequent evidence.
