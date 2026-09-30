import { useState } from 'react';
import { useVoiceConversation } from '../hooks/useVoiceConversation';
import { matchingVoices, type VoicePhase, type VoiceReply } from '../voiceConversation';

interface VoiceChatPanelProps {
  send(text: string): Promise<VoiceReply | undefined>;
  stopReply(): void;
  busy: boolean;
  onClose(): void;
}

const LABELS: Record<VoicePhase, string> = {
  idle: 'Ready to start', listening: 'Listening', thinking: 'AI is responding',
  speaking: 'AI is speaking', paused: 'Paused', error: 'Voice chat stopped'
};

export function VoiceChatPanel({ send, stopReply, busy, onClose }: VoiceChatPanelProps) {
  const voice = useVoiceConversation(send, stopReply);
  const [language, setLanguage] = useState('ms-MY');
  const [voiceURI, setVoiceURI] = useState('');
  const running = ['listening', 'thinking', 'speaking'].includes(voice.phase);
  const availableVoices = matchingVoices(voice.voices, language);
  const start = () => voice.start({ language, voiceURI });

  return (
    <section className="voice-chat-panel" aria-label="Voice conversation">
      <div className="voice-chat-header">
        <div>
          <h2>Voice chat</h2>
          <p>Speak, hear a reply, then continue. Your conversation stays in this chat.</p>
        </div>
        <button type="button" className="ghost" onClick={() => { voice.stop(); onClose(); }} aria-label="Close voice chat">×</button>
      </div>
      <div className="voice-chat-options">
        <label>Language
          <select value={language} disabled={running} onChange={event => { setLanguage(event.target.value); setVoiceURI(''); }}>
            <option value="ms-MY">Bahasa Melayu</option>
            <option value="en-MY">English</option>
          </select>
        </label>
        <label>Voice
          <select value={availableVoices.some(item => item.voiceURI === voiceURI) ? voiceURI : ''} disabled={running} onChange={event => setVoiceURI(event.target.value)}>
            <option value="">{availableVoices.length ? 'Automatic' : 'Device default'}</option>
            {availableVoices.map(item => <option key={item.voiceURI} value={item.voiceURI}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <p className="voice-chat-disclosure">Uses browser speech services. Audio may be processed by your browser provider. No paid speech API is added; existing AI limits still apply.</p>
      {availableVoices.length === 0 && <p className="voice-chat-note">A voice for this language may need to be installed on your device.</p>}
      {!voice.supported && <p className="voice-chat-error" role="status">Voice chat needs HTTPS and a browser with speech recognition and read-aloud support. Try a supported browser, or continue with text.</p>}
      <div className="voice-chat-status" role="status" aria-live="polite">
        <span className={`voice-status-dot ${voice.phase}`} aria-hidden="true" />
        <b>{LABELS[voice.phase]}</b>
        {voice.phase === 'listening' && <span>Pause after speaking to send your turn.</span>}
        {voice.phase === 'speaking' && <span>Interrupt to stop playback and speak.</span>}
      </div>
      {voice.transcript && <p className="voice-chat-transcript">{voice.transcript}</p>}
      {voice.error && <p className="voice-chat-error" role="alert">{voice.error}</p>}
      <div className="voice-chat-actions">
        {!running && <button type="button" disabled={!voice.supported || busy} onClick={start}>{voice.phase === 'idle' ? 'Start voice chat' : 'Resume'}</button>}
        {voice.phase === 'listening' && <button type="button" onClick={voice.sendNow}>Send now</button>}
        {(voice.phase === 'speaking' || voice.phase === 'thinking') && <button type="button" onClick={start}>Interrupt</button>}
        {running && <button type="button" className="ghost" onClick={voice.pause}>Pause</button>}
        {voice.phase !== 'idle' && <button type="button" className="ghost" onClick={voice.stop}>End</button>}
      </div>
    </section>
  );
}
