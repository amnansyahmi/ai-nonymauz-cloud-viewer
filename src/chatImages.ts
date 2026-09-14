import type { ChatAttachment, ChatContent, ChatImagePart, ChatMessage } from './types';

export const MAX_CHAT_IMAGES = 4;
export const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const KEEP_ORIGINAL_BYTES = 2.5 * 1024 * 1024;
const SAFE_PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode ${file.name}. Try JPEG, PNG, or WebP.`));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not prepare this image for upload.'));
    }, type, quality);
  });
}

export async function prepareChatImage(file: File): Promise<ChatAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image.`);
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error(`${file.name} is larger than 12 MB.`);
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  let output: Blob = file;
  if (
    scale < 1 ||
    file.size > KEEP_ORIGINAL_BYTES ||
    !SAFE_PASSTHROUGH_TYPES.has(file.type)
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    output = await canvasBlob(canvas, 'image/jpeg', 0.9);
  }

  return {
    id: makeId(),
    name: file.name,
    mimeType: output.type || 'image/jpeg',
    sizeBytes: output.size,
    width,
    height,
    dataUrl: await blobToDataUrl(output)
  };
}

export function buildUserContent(text: string, attachments: ChatAttachment[]): ChatContent {
  const trimmed = text.trim();
  if (attachments.length === 0) return trimmed;

  const parts: ChatContent = [];
  if (trimmed) parts.push({ type: 'text', text: trimmed });
  for (const attachment of attachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: attachment.dataUrl, detail: 'auto' }
    });
  }
  return parts;
}

export function chatContentText(content: ChatContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter(part => part.type === 'text')
    .map(part => part.type === 'text' ? part.text : '')
    .filter(Boolean)
    .join('\n\n');
}

export function chatContentImages(content: ChatContent): ChatImagePart[] {
  if (typeof content === 'string') return [];
  return content.filter((part): part is ChatImagePart => part.type === 'image_url');
}

export function messagesHaveImages(messages: ChatMessage[]): boolean {
  return messages.some(message => chatContentImages(message.content).length > 0);
}

export function formatImageSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
