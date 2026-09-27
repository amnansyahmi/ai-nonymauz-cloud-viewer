import type { VideoImageInput } from './types';

export const MAX_VIDEO_IMAGES = 3;
export const MAX_VIDEO_IMAGE_BYTES = 768 * 1024;
export const MAX_VIDEO_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IOS_PHOTO_TYPES = new Set(['image/heic', 'image/heif']);

export interface VideoImageDraft extends VideoImageInput {
  id: string;
  sizeBytes: number;
}

function toDataUrl(blob: Blob): Promise<string> {
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
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 120),
    data_url: await toDataUrl(output),
    sizeBytes: output.size,
    caption: '',
    fit: 'contain'
  };
}

export function videoImagePayload(images: VideoImageDraft[]): VideoImageInput[] {
  return images.map(({ name, data_url, caption, fit }) => ({ name, data_url, caption, fit }));
}
