import type { VideoImageInput, VideoImageRole } from './types';

/** Upper bound for any engine; the backend reports each engine's own limit. */
export const MAX_VIDEO_IMAGES = 5;
export const MAX_VIDEO_IMAGE_BYTES = 768 * 1024;
export const MAX_VIDEO_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IOS_PHOTO_TYPES = new Set(['image/heic', 'image/heif']);

export interface VideoImageDraft extends VideoImageInput {
  id: string;
  sizeBytes: number;
  /** The original file of a screen recording, uploaded in chunks. */
  file?: Blob;
  /** A still frame of a recording, for the list. */
  poster?: string;
}

const CLIP_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
export const MAX_CLIP_BYTES = 20 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 30;

export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number, type = 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the image.')), type, quality);
  });
}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not open ${file.name}.`)); };
    image.src = url;
  });
}

export async function prepareVideoImage(file: File): Promise<VideoImageDraft> {
  const iosPhoto = IOS_PHOTO_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!TYPES.has(file.type) && !iosPhoto) throw new Error(`${file.name}: use JPEG, PNG, WebP or an iPhone HEIC photo.`);
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name}: maximum source size is 12 MB.`);
  const image = await decode(file);
  if (image.naturalWidth > 8192 || image.naturalHeight > 8192 ||
      image.naturalWidth * image.naturalHeight > 24_000_000) {
    throw new Error(`${file.name}: image dimensions are too large.`);
  }

  let output: Blob = file;
  if (iosPhoto || file.size > MAX_VIDEO_IMAGE_BYTES || Math.max(image.naturalWidth, image.naturalHeight) > 1600) {
    const canvas = document.createElement('canvas');
    let longest = Math.min(1600, Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 5; attempt++) {
      const factor = longest / Math.max(image.naturalWidth, image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not resize the image.');
      // PNG/WebP cutouts must keep their alpha when resized for the upload cap.
      if (iosPhoto || file.type === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      output = await toBlob(canvas, Math.max(0.58, 0.84 - attempt * 0.06),
        iosPhoto || file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp');
      if (output.size <= MAX_VIDEO_IMAGE_BYTES) break;
      longest = Math.max(480, Math.round(longest * 0.75));
    }
  }
  if (output.size > MAX_VIDEO_IMAGE_BYTES) throw new Error(`${file.name}: could not reduce this image below 768 KB.`);
  const resized = output !== file;
  const scale = resized ? Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)) : 1;
  const measured = resized ? await decode(new File([output], file.name, { type: output.type })) : image;
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 120),
    data_url: await toDataUrl(output),
    sizeBytes: output.size,
    kind: 'image',
    width: measured.naturalWidth || Math.round(image.naturalWidth * scale),
    height: measured.naturalHeight || Math.round(image.naturalHeight * scale),
    caption: '',
    fit: 'contain',
    role: guessImageRole(file.name, file.type, image.naturalWidth, image.naturalHeight)
  };
}

/**
 * A starting guess the user can change: phone and desktop captures are PNGs
 * at screen proportions or are named as screenshots; everything else is a photo.
 */
export function guessImageRole(name: string, type: string, width: number, height: number): VideoImageRole {
  if (/screen ?shot|screen|capture|skrin/i.test(name)) return 'screenshot';
  if (/logo/i.test(name)) return 'logo';
  const ratio = height / Math.max(1, width);
  if (type === 'image/png' && (ratio >= 1.9 || (ratio > 0.55 && ratio < 0.65))) return 'screenshot';
  return 'photo';
}

export function isClipFile(file: File): boolean {
  return CLIP_TYPES.has(file.type) || /\.(mp4|mov|webm)$/i.test(file.name);
}

/** A screen recording: checked, measured and given a poster frame; never re-encoded. */
export async function prepareVideoClip(file: File): Promise<VideoImageDraft> {
  const type = CLIP_TYPES.has(file.type) ? file.type
    : /\.mov$/i.test(file.name) ? 'video/quicktime' : /\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4';
  if (!file.size || file.size > MAX_CLIP_BYTES) throw new Error(`${file.name}: screen recordings can be up to 20 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`${file.name}: this browser cannot open the recording.`));
    });
    if (!video.duration || video.duration > MAX_CLIP_SECONDS) {
      throw new Error(`${file.name}: trim recordings to ${MAX_CLIP_SECONDS} seconds or less.`);
    }
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.5, video.duration / 2);
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(360, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / Math.max(1, video.videoWidth));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 120),
      kind: 'video',
      mime: type,
      width: video.videoWidth,
      height: video.videoHeight,
      seconds: Math.round(video.duration * 10) / 10,
      sizeBytes: file.size,
      // The preview plays it from memory; the render receives the file itself.
      data_url: await toDataUrl(file),
      file,
      poster: canvas.toDataURL('image/jpeg', 0.7),
      caption: '',
      fit: 'cover',
      role: 'screenshot'
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mimeOf(dataUrl?: string): string {
  return dataUrl?.slice(5, dataUrl.indexOf(';')) ?? 'image/jpeg';
}

/** Key the backend uses for media sent by reference. */
export function mediaKey(image: VideoImageDraft, index: number): string {
  return `${image.kind === 'video' ? 'vid' : 'img'}${index}`;
}

export function videoImagePayload(images: VideoImageDraft[], byReference = false): VideoImageInput[] {
  if (!byReference) {
    return images.map(({ name, data_url, caption, fit, role }) => ({ name, data_url, caption, fit, role: role ?? 'photo' }));
  }
  return images.map(image => ({
    name: image.name, caption: image.caption, fit: image.fit, role: image.role ?? 'photo',
    kind: image.kind ?? 'image', mime: image.mime ?? mimeOf(image.data_url),
    width: image.width, height: image.height, size_bytes: image.sizeBytes,
    ...(image.kind === 'video' ? { seconds: image.seconds } : {})
  }));
}

/** The media a preview needs, filled in on this device: nothing is re-uploaded. */
export function previewMedia(images: VideoImageDraft[]): Record<string, string> {
  return Object.fromEntries(images.flatMap((image, index) =>
    image.data_url ? [[mediaKey(image, index), image.data_url]] : []));
}

/** The bytes for one expected upload. */
export async function mediaBlob(image: VideoImageDraft): Promise<Blob> {
  if (image.file) return image.file;
  return (await fetch(image.data_url ?? '')).blob();
}
