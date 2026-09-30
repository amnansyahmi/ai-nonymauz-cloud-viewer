import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VoiceConversation, matchingVoices, spokenText,
  type VoiceRecognition, type VoiceReply, type VoiceSnapshot
} from '../voiceConversation';

class Recognition implements VoiceRecognition {
  continuous = true;
  interimResults = false;
  lang = '';
  onresult: VoiceRecognition['onresult'] = null;
  onerror: VoiceRecognition['onerror'] = null;
  onend: VoiceRecognition['onend'] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  result(text: string, isFinal = true) {
    this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] });
  }
}

function setup(send = vi.fn<(text: string) => Promise<VoiceReply | undefined>>().mockResolvedValue({ text: '**Hello** there.' })) {
  const recognitions: Recognition[] = [];
  const snapshots: VoiceSnapshot[] = [];
  const cancelReply = vi.fn();
  const cancelSpeech = vi.fn();
  let speechDone: (() => void) | undefined;
  let speechFail: ((text: string) => void) | undefined;
  const speak = vi.fn((_text, _options, done, fail) => {
    speechDone = done;
    speechFail = fail;
    return cancelSpeech;
  });
  const conversation = new VoiceConversation({
    createRecognition: () => { const recognition = new Recognition(); recognitions.push(recognition); return recognition; },
    send, cancelReply, speak, onChange: snapshot => snapshots.push(snapshot)
  });
  const start = () => conversation.start({ language: 'ms-MY', voiceURI: 'malay' });
  return { conversation, start, recognitions, snapshots, send, speak, cancelReply, cancelSpeech,
    done: () => speechDone?.(), fail: (error: string) => speechFail?.(error) };
}

afterEach(() => vi.useRealTimers());

describe('browser voice conversation', () => {
  it('uses one recognition turn, sends final text, speaks the answer, then listens again', async () => {
    const s = setup(); s.start();
    const mic = s.recognitions[0];
    expect(mic.lang).toBe('ms-MY');
    expect(mic.continuous).toBe(false);
    mic.result('Apa khabar', false);
    expect(s.send).not.toHaveBeenCalled();
    mic.result('Apa khabar'); mic.onend?.();
    await Promise.resolve();
    expect(s.send).toHaveBeenCalledExactlyOnceWith('Apa khabar');
    expect(s.speak.mock.calls[0][0]).toBe('Hello there.');
    expect(s.recognitions).toHaveLength(1);
    s.done();
    expect(s.recognitions).toHaveLength(2);
    expect(s.snapshots.at(-1)?.phase).toBe('listening');
    s.conversation.stop();
  });

  it('never sends an interim transcript when recognition ends without final speech', () => {
    const s = setup(); s.start();
    s.recognitions[0].result('unfinished', false);
    s.recognitions[0].onend?.();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.snapshots.at(-1)?.phase).toBe('paused');
    s.conversation.stop();
  });

  it('ignores repeated end events from the same recognition turn', async () => {
    const s = setup(); s.start();
    s.recognitions[0].result('hello');
    const end = s.recognitions[0].onend;
    end?.(); end?.();
    await Promise.resolve();
    expect(s.send).toHaveBeenCalledTimes(1);
    s.conversation.stop();
  });

  it('does not speak a late reply after pause or end', async () => {
    let resolve!: (reply: VoiceReply) => void;
    const s = setup(vi.fn(() => new Promise<VoiceReply>(r => { resolve = r; })));
    s.start(); s.recognitions[0].result('hello'); s.recognitions[0].onend?.();
    s.conversation.pause(); resolve({ text: 'Late answer' });
    await Promise.resolve();
    expect(s.speak).not.toHaveBeenCalled();
    expect(s.snapshots.at(-1)?.phase).toBe('paused');
    s.conversation.stop();
  });

  it('aborts the microphone, detaches events, and discards late results on end', () => {
    const s = setup(); s.start();
    const mic = s.recognitions[0];
    const result = mic.onresult; const end = mic.onend;
    s.conversation.stop();
    result?.({ results: [{ isFinal: true, 0: { transcript: 'old audio' } }] }); end?.();
    expect(mic.abort).toHaveBeenCalledOnce();
    expect(mic.onresult).toBeNull();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.snapshots.at(-1)?.phase).toBe('idle');
  });

  it('interrupts playback without reopening the microphone from a stale audio callback', async () => {
    const s = setup(); s.start();
    s.recognitions[0].result('hello'); s.recognitions[0].onend?.(); await Promise.resolve();
    s.start(); s.done();
    expect(s.cancelSpeech).toHaveBeenCalledOnce();
    expect(s.recognitions).toHaveLength(2);
    s.conversation.stop();
  });

  it('does not speak backend errors or automatically retry paid/quota-limited requests', async () => {
    const s = setup(vi.fn().mockResolvedValue({ text: 'Error 429', error: 'Quota exceeded' }));
    s.start(); s.recognitions[0].result('hello'); s.recognitions[0].onend?.(); await Promise.resolve();
    expect(s.speak).not.toHaveBeenCalled();
    expect(s.recognitions).toHaveLength(1);
    expect(s.snapshots.at(-1)?.error).toBe('Quota exceeded');
    s.conversation.stop();
  });

  it('pauses on microphone denial and surfaces a useful recovery message', () => {
    const s = setup(); s.start();
    s.recognitions[0].onerror?.({ error: 'not-allowed' });
    expect(s.snapshots.at(-1)?.error).toContain('Microphone access was denied');
    expect(s.recognitions[0].abort).toHaveBeenCalledOnce();
    expect(s.send).not.toHaveBeenCalled();
    s.conversation.stop();
  });

  it('bounds empty listening sessions instead of keeping the microphone open indefinitely', () => {
    vi.useFakeTimers();
    const s = setup(); s.start(); vi.advanceTimersByTime(45_000);
    expect(s.snapshots.at(-1)?.phase).toBe('error');
    expect(s.recognitions[0].abort).toHaveBeenCalledOnce();
    expect(s.send).not.toHaveBeenCalled();
    s.conversation.stop();
  });

  it('stops the loop after an audio failure', async () => {
    const s = setup(); s.start();
    s.recognitions[0].result('hello'); s.recognitions[0].onend?.(); await Promise.resolve();
    s.fail('Playback blocked');
    expect(s.snapshots.at(-1)?.error).toBe('Playback blocked');
    expect(s.cancelSpeech).toHaveBeenCalledOnce();
    expect(s.recognitions).toHaveLength(1);
    s.conversation.stop();
  });

  it('allows Send now to request a final result without starting a second turn', () => {
    const s = setup(); s.start(); s.conversation.sendNow();
    expect(s.recognitions[0].stop).toHaveBeenCalledOnce();
    expect(s.send).not.toHaveBeenCalled();
    s.conversation.stop();
  });
});

describe('speech presentation', () => {
  it('removes private reasoning, code, markdown, URLs, and image syntax from playback', () => {
    expect(spokenText('<think>private</think>## Answer\n**Read** [this](https://example.test).\n```js\nsecret()\n```\n![photo](x)'))
      .toBe('Answer Read this. Code is available in the transcript.');
  });

  it('prefers the requested locale without selecting another language as a voice', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'ms-SG' }, { lang: 'ms-MY' }] as SpeechSynthesisVoice[];
    expect(matchingVoices(voices, 'ms-MY').map(voice => voice.lang)).toEqual(['ms-MY', 'ms-SG']);
  });
});
