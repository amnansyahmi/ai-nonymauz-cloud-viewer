import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginTask, collectTask, endTask, launchTarget, newTaskId, pendingTask, pendingTasks, reportPresence, updatePending
} from '../background';
import { ApiClient } from '../api/client';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

function fakeClient(overrides: Partial<Record<'task' | 'taskPresence' | 'forgetTask', unknown>> = {}) {
  return {
    task: vi.fn(),
    taskPresence: vi.fn().mockResolvedValue(undefined),
    forgetTask: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as ApiClient & { task: ReturnType<typeof vi.fn>; taskPresence: ReturnType<typeof vi.fn>;
    forgetTask: ReturnType<typeof vi.fn> };
}

describe('background tasks', () => {
  it('makes unguessable task ids the backend accepts', () => {
    const id = newTaskId();
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(newTaskId()).not.toBe(id);
  });

  it('tracks a request until it ends, and only forgets server copies of away tasks', () => {
    const client = fakeClient();
    const first = beginTask('chat', 'Hello');
    const second = beginTask('image', 'A cat');
    expect(pendingTasks().map(task => task.kind)).toEqual(['chat', 'image']);
    expect(first.push).toBeUndefined();
    endTask(client, first.task_id);
    expect(client.forgetTask).not.toHaveBeenCalled();
    updatePending(second.task_id, { away: true });
    endTask(client, second.task_id);
    expect(client.forgetTask).toHaveBeenCalledWith(second.task_id);
    expect(pendingTasks()).toEqual([]);
  });

  it('marks every running task away as the app hides; only renders come back', () => {
    const client = fakeClient();
    const chat = beginTask('chat');
    const video = beginTask('video');
    reportPresence(client, true);
    expect(pendingTask(chat.task_id)?.away).toBe(true);
    expect(client.taskPresence).toHaveBeenCalledTimes(2);
    reportPresence(client, false);
    expect(client.taskPresence).toHaveBeenLastCalledWith(video.task_id, false);
    expect(client.taskPresence).toHaveBeenCalledTimes(3);
  });

  it('waits while the backend is still working, then returns the result', async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    client.task
      .mockResolvedValueOnce({ status: 'running' })
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce({ status: 'done', kind: 'chat', result: { text: 'Hi' } });
    const pending = collectTask(client, 'a'.repeat(32));
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ status: 'done', kind: 'chat', result: { text: 'Hi' } });
    vi.useRealTimers();
  });

  it('gives up on a task the backend never heard of', async () => {
    const client = fakeClient();
    client.task.mockRejectedValue(new Error('HTTP 404: Unknown task.'));
    expect(await collectTask(client, 'b'.repeat(32))).toBeNull();
  });

  it('reads the tab a tapped notification asked for', () => {
    expect(launchTarget('?open=video&task=abc')).toEqual({ kind: 'video', task: 'abc' });
    expect(launchTarget('?open=settings')).toBeNull();
    expect(launchTarget('')).toBeNull();
  });
});

describe('background API calls', () => {
  it('retries presence without keepalive when the browser refuses it', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    await new ApiClient('https://example.test', 'secret').taskPresence('e'.repeat(32), true);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    expect(fetchMock.mock.calls[1][1].keepalive).toBeUndefined();
  });

  it('sends presence with keepalive so it leaves as the page is suspended', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    await new ApiClient('https://example.test', 'secret').taskPresence('c'.repeat(32), true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/v1/tasks/${'c'.repeat(32)}/presence`);
    expect(init.method).toBe('PUT');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ away: true });
  });

  it('adds the background block to chat and image requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ image_base64: 'AA==' }));
    vi.stubGlobal('fetch', fetchMock);
    const block = { task_id: 'd'.repeat(32), label: 'x' };
    await new ApiClient('https://example.test', 'k').generateImage('a cat', 'realistic', '1024x1024', block);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).background).toEqual(block);
  });
});
