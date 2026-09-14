import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function useVoiceInput(value: string, onChange: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const supported = useMemo(() => Boolean(recognitionConstructor()), []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError('Voice input is not supported by this browser.');
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    const base = value.trimEnd();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : 'en-MY';

    recognition.onresult = event => {
      const pieces: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript;
        if (typeof transcript === 'string') pieces.push(transcript.trim());
      }
      const spoken = pieces.filter(Boolean).join(' ').trim();
      onChange([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
    };

    recognition.onerror = event => {
      const code = String(event?.error || 'unknown');
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone permission was denied. Allow microphone access and try again.');
      } else if (code !== 'aborted') {
        setError(`Voice input stopped: ${code}.`);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    setError('');
    setListening(true);
    try {
      recognition.start();
    } catch (startError) {
      setListening(false);
      setError(startError instanceof Error ? startError.message : String(startError));
    }
  }, [onChange, value]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, error, start, stop, toggle, clearError: () => setError('') };
}
