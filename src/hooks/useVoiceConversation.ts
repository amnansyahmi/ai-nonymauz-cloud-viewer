import { useCallback, useEffect, useRef, useState } from 'react';
import {
  matchingVoices, recognitionConstructor, VoiceConversation,
  type VoiceOptions, type VoiceReply, type VoiceSnapshot
} from '../voiceConversation';

export function useVoiceConversation(send: (text: string) => Promise<VoiceReply | undefined>, stopReply: () => void) {
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>({ phase: 'idle', transcript: '', error: '' });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);
  const latest = useRef({ send, stopReply });
  const controller = useRef<VoiceConversation | null>(null);

  useEffect(() => { latest.current = { send, stopReply }; }, [send, stopReply]);

  useEffect(() => {
    const Constructor = recognitionConstructor();
    const synthesis = window.speechSynthesis;
    setSupported(Boolean(Constructor && synthesis && window.SpeechSynthesisUtterance && window.isSecureContext));
    if (!Constructor || !synthesis || !window.SpeechSynthesisUtterance || !window.isSecureContext) return;
    let mounted = true;
    const refreshVoices = () => setVoices(synthesis.getVoices());
    refreshVoices();
    synthesis.addEventListener('voiceschanged', refreshVoices);
    const conversation = new VoiceConversation({
      createRecognition: () => new Constructor(),
      send: text => latest.current.send(text),
      cancelReply: () => latest.current.stopReply(),
      onChange: next => { if (mounted) setSnapshot(next); },
      speak: (text, options, done, fail) => {
        // Short chunks avoid engines that stall on long utterances. No AI text is truncated.
        const chunks = text.match(/.{1,220}(?:\s|$)|\S{1,220}/g) ?? [text];
        let cancelled = false;
        let utterance: SpeechSynthesisUtterance | null = null;
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        const clear = () => { if (watchdog) clearTimeout(watchdog); };
        const speakNext = () => {
          if (cancelled) return;
          const chunk = chunks.shift();
          if (!chunk) { done(); return; }
          utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = options.language;
          const available = matchingVoices(synthesis.getVoices(), options.language);
          utterance.voice = available.find(voice => voice.voiceURI === options.voiceURI) ?? available[0] ?? null;
          utterance.rate = 1;
          const onTimeout = () => { if (!cancelled) fail('Audio playback did not finish. Check your device audio and resume.'); };
          utterance.onstart = () => {
            clear();
            watchdog = setTimeout(onTimeout, Math.max(30_000, chunk.length * 200));
          };
          utterance.onend = () => { clear(); speakNext(); };
          utterance.onerror = event => {
            clear();
            if (!cancelled) fail(`Audio playback failed (${event.error}). Check your device audio and resume.`);
          };
          watchdog = setTimeout(onTimeout, 12_000);
          synthesis.speak(utterance);
        };
        synthesis.cancel();
        speakNext();
        return () => {
          cancelled = true;
          clear();
          if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
          synthesis.cancel();
        };
      }
    });
    controller.current = conversation;
    const pauseInBackground = () => { if (document.hidden) conversation.pause(); };
    const pauseOnLeave = () => conversation.pause();
    document.addEventListener('visibilitychange', pauseInBackground);
    window.addEventListener('pagehide', pauseOnLeave);
    return () => {
      mounted = false;
      conversation.stop();
      controller.current = null;
      synthesis.removeEventListener('voiceschanged', refreshVoices);
      document.removeEventListener('visibilitychange', pauseInBackground);
      window.removeEventListener('pagehide', pauseOnLeave);
    };
  }, []);

  const start = useCallback((options: VoiceOptions) => controller.current?.start(options), []);
  const pause = useCallback(() => controller.current?.pause(), []);
  const stop = useCallback(() => controller.current?.stop(), []);
  const sendNow = useCallback(() => controller.current?.sendNow(), []);
  return { ...snapshot, supported, voices, start, pause, stop, sendNow };
}
