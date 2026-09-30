export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
export interface VoiceSnapshot {
  phase: VoicePhase;
  transcript: string;
  error: string;
}
export interface VoiceReply { text: string; error?: string }
export interface RecognitionResultEvent {
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
}
export interface VoiceRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type VoiceRecognitionConstructor = new () => VoiceRecognition;
export interface VoiceOptions { language: string; voiceURI: string }
export interface VoiceDependencies {
  createRecognition(): VoiceRecognition;
  send(text: string): Promise<VoiceReply | undefined>;
  cancelReply(): void;
  speak(text: string, options: VoiceOptions, done: () => void, fail: (message: string) => void): () => void;
  onChange(snapshot: VoiceSnapshot): void;
}

export const VOICE_INSTRUCTION = 'This is a spoken conversation. Reply in the language the user is speaking. Keep answers concise and natural, usually two or three short sentences unless more detail is requested. Avoid tables and code blocks unless requested. Keep the existing grounding and tool rules.';

export function recognitionConstructor(): VoiceRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

// Remove visual formatting and hidden reasoning instead of reading markup aloud.
export function spokenText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' Code is available in the transcript. ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[\t ]*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function matchingVoices(voices: SpeechSynthesisVoice[], language: string): SpeechSynthesisVoice[] {
  const normalized = language.toLowerCase();
  return voices.filter(voice => voice.lang.toLowerCase().split('-')[0] === normalized.split('-')[0])
    .sort((a, b) => Number(b.lang.toLowerCase() === normalized) - Number(a.lang.toLowerCase() === normalized));
}

function recognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Microphone access was denied. Allow it in your browser settings, then resume.';
    case 'audio-capture': return 'No microphone is available. Check your device and resume.';
    case 'network': return 'The browser speech service could not connect. Check your connection and resume.';
    case 'language-not-supported': return 'This speech service does not support the selected language. Choose another language.';
    case 'no-speech': return 'No speech was detected. Resume when you are ready.';
    default: return `Speech recognition stopped (${code}). Resume to try again.`;
  }
}

/** One recognizer/AI turn/utterance at a time. Generation IDs discard stale events. */
export class VoiceConversation {
  private generation = 0;
  private recognition: VoiceRecognition | null = null;
  private cancelSpeech: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private options: VoiceOptions = { language: 'ms-MY', voiceURI: '' };
  private snapshot: VoiceSnapshot = { phase: 'idle', transcript: '', error: '' };

  constructor(private dependencies: VoiceDependencies) {}

  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.dependencies.onChange(this.snapshot);
  }

  private release() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.abort();
    }
    this.cancelSpeech?.();
    this.cancelSpeech = null;
    this.dependencies.cancelReply();
  }

  start(options: VoiceOptions) {
    this.release();
    this.active = true;
    this.options = options;
    this.listen();
  }

  pause() {
    this.release();
    this.update({ phase: 'paused', error: '' });
  }

  stop() {
    this.active = false;
    this.release();
    this.update({ phase: 'idle', transcript: '', error: '' });
  }

  sendNow() { this.recognition?.stop(); }

  private fail(error: string) {
    this.release();
    this.update({ phase: 'error', error });
  }

  private listen() {
    if (!this.active) return;
    const generation = ++this.generation;
    let recognition: VoiceRecognition;
    try { recognition = this.dependencies.createRecognition(); }
    catch { this.fail('Speech recognition is unavailable in this browser.'); return; }
    this.recognition = recognition;
    recognition.lang = this.options.language;
    recognition.continuous = false;
    recognition.interimResults = true;
    let finalText = '';
    recognition.onresult = event => {
      if (generation !== this.generation) return;
      const final: string[] = [];
      const interim: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript.trim();
        if (text) (result.isFinal ? final : interim).push(text);
      }
      finalText = final.join(' ');
      this.update({ transcript: [...final, ...interim].join(' ') });
    };
    recognition.onerror = event => {
      if (generation === this.generation && event.error !== 'aborted') this.fail(recognitionError(event.error));
    };
    recognition.onend = () => {
      if (generation !== this.generation) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.recognition = null;
      recognition.onresult = recognition.onerror = recognition.onend = null;
      // Claim this turn immediately: duplicate end callbacks cannot submit twice.
      const turn = ++this.generation;
      if (!finalText) { this.update({ phase: 'paused', error: 'No speech was captured. Resume to try again.' }); return; }
      void this.reply(finalText, turn);
    };
    this.update({ phase: 'listening', transcript: '', error: '' });
    try {
      recognition.start();
      this.timer = setTimeout(() => {
        if (generation === this.generation) this.fail('Listening timed out. Resume when you are ready.');
      }, 45_000);
    } catch (error) { this.fail(error instanceof Error ? error.message : 'Could not start the microphone.'); }
  }

  private async reply(text: string, generation: number) {
    this.update({ phase: 'thinking', transcript: text });
    try {
      const reply = await this.dependencies.send(text);
      if (generation !== this.generation || !this.active) return;
      if (!reply || reply.error) { this.fail(reply?.error || 'The chat is busy. Resume after the current response finishes.'); return; }
      const spoken = spokenText(reply.text);
      if (!spoken) { this.fail('The response has no spoken text. Read the transcript and resume.'); return; }
      this.update({ phase: 'speaking' });
      const cancel = this.dependencies.speak(spoken, this.options, () => {
        if (generation !== this.generation) return;
        this.cancelSpeech = null;
        this.listen();
      }, error => {
        if (generation === this.generation) this.fail(error);
      });
      if (generation === this.generation && this.snapshot.phase === 'speaking') this.cancelSpeech = cancel;
      else cancel();
    } catch (error) {
      if (generation === this.generation) this.fail(error instanceof Error ? error.message : 'The voice response failed.');
    }
  }
}
