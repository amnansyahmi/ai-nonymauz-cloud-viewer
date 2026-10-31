/**
 * Work that outlives the screen: chat replies, images and video renders that
 * finish while the app is in the background.
 *
 * A phone suspends a web app soon after it leaves the screen and its open
 * request dies, although the backend usually keeps working. So each such
 * request carries a `background` block with a task id made here. When the app
 * is hidden it tells the backend the task is "away"; the backend then keeps
 * the result and sends a push notification when it is ready. When the app
 * returns (or the notification is tapped) the view collects the result.
 */

import type { ApiClient } from './api/client';

export type TaskKind = 'chat' | 'image' | 'video';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface BackgroundBlock {
  task_id: string;
  push?: PushSubscriptionJson;
  label?: string;
}

export interface PendingTask {
  id: string;
  kind: TaskKind;
  startedAt: number;
  /** Set once the app told the backend it left while this task ran. */
  away?: boolean;
  /** Anything the view needs to put the result back (a video job id). */
  meta?: Record<string, string>;
}

export interface TaskResult {
  status: 'done' | 'running';
  kind?: TaskKind;
  result?: Record<string, unknown>;
}

const PENDING_KEY = 'ai-nonymauz-pending-tasks';
const PUSH_KEY = 'ai-nonymauz-push-subscription';
/** A request older than this is not coming back (functions stop at 5 min). */
const PENDING_MAX_AGE = 30 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function newTaskId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function pendingTasks(now = Date.now()): PendingTask[] {
  try {
    const raw = JSON.parse(storage()?.getItem(PENDING_KEY) ?? '[]') as PendingTask[];
    return Array.isArray(raw) ? raw.filter(task => task && typeof task.id === 'string'
      && (task.kind === 'video' || now - task.startedAt < PENDING_MAX_AGE)) : [];
  } catch {
    return [];
  }
}

function savePending(tasks: PendingTask[]): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify(tasks.slice(-20)));
  } catch {
    // Storage full or blocked: background recovery is a convenience.
  }
}

export function updatePending(id: string, patch: Partial<PendingTask>): void {
  savePending(pendingTasks().map(task => task.id === id ? { ...task, ...patch, id } : task));
}

export function pendingTask(id: string): PendingTask | undefined {
  return pendingTasks().find(task => task.id === id);
}

export function savedSubscription(): PushSubscriptionJson | undefined {
  try {
    const raw = storage()?.getItem(PUSH_KEY);
    return raw ? JSON.parse(raw) as PushSubscriptionJson : undefined;
  } catch {
    return undefined;
  }
}

/** Start tracking a request; returns the block to send with it. */
export function beginTask(kind: TaskKind, label = '', meta?: Record<string, string>): BackgroundBlock {
  const id = newTaskId();
  savePending([...pendingTasks(), { id, kind, startedAt: Date.now(), meta }]);
  const push = savedSubscription();
  return { task_id: id, label: label.slice(0, 80), ...(push ? { push } : {}) };
}

/** The request is over (answered, failed or collected): forget it. */
export function endTask(client: ApiClient, id: string): void {
  const task = pendingTask(id);
  savePending(pendingTasks().filter(item => item.id !== id));
  // Only a task marked away can have anything stored on the backend.
  if (task?.away) void client.forgetTask(id).catch(() => undefined);
}

/** Tell the backend which running tasks the app is leaving (or back for). */
export function reportPresence(client: ApiClient, away: boolean): void {
  for (const task of pendingTasks()) {
    // A reply or image cannot be resumed once its request died, so it stays
    // away; a render can, so it is only away while the app is.
    if (!away && task.kind !== 'video') continue;
    if (away) updatePending(task.id, { away: true });
    void client.taskPresence(task.id, away).catch(() => undefined);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The result of a task whose request was lost while the app was away:
 * waits while the backend is still working. Null when it never heard of it.
 */
export async function collectTask(client: ApiClient, id: string, signal?: AbortSignal,
                                  maxWaitMs = 6 * 60 * 1000): Promise<TaskResult | null> {
  const started = Date.now();
  let delay = 1500;
  while (!signal?.aborted) {
    const found = await client.task(id).catch(reason => {
      if (reason instanceof Error && reason.message.startsWith('HTTP 404')) return null;
      return { status: 'running' } as TaskResult;  // offline for a moment: keep waiting
    });
    if (found === null || found.status === 'done') return found;
    if (Date.now() - started > maxWaitMs) return null;
    await sleep(delay);
    delay = Math.min(delay * 1.5, 8000);
  }
  return null;
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationState = 'unsupported' | 'install' | 'off' | 'denied' | 'on';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function notificationState(): NotificationState {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  // iPhone allows notifications only for an app added to the Home Screen.
  if (isIos() && !isInstalled()) return 'install';
  if (!('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && savedSubscription() ? 'on' : 'off';
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/** Ask permission, subscribe and send a test notification. Must run from a tap. */
export async function enableNotifications(client: ApiClient): Promise<NotificationState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await registerWorker();
  if (!registration) throw new Error('This browser could not start the notification worker.');
  await navigator.serviceWorker.ready;
  const key = await client.pushKey();
  if (!key.enabled || !key.public_key) {
    throw new Error('The backend has no storage for notifications yet (connect a Vercel Blob store).');
  }
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(key.public_key)
  });
  const json = subscription.toJSON() as PushSubscriptionJson;
  storage()?.setItem(PUSH_KEY, JSON.stringify(json));
  await client.pushTest(json);
  return 'on';
}

export async function disableNotifications(): Promise<void> {
  storage()?.removeItem(PUSH_KEY);
  const registration = await navigator.serviceWorker?.getRegistration?.();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

/** The tab a tapped notification asked for, from the launch URL. */
export function launchTarget(search: string): { kind: TaskKind; task: string } | null {
  const params = new URLSearchParams(search);
  const kind = params.get('open');
  const task = params.get('task') ?? '';
  return kind === 'chat' || kind === 'image' || kind === 'video' ? { kind, task } : null;
}
