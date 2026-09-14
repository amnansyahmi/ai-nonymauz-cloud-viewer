import { ApiClient } from './api/client';
import type { ChatFileAttachment } from './types';

export const MAX_CHAT_FILES = 3;
export const MAX_FILE_INPUT_BYTES = 10 * 1024 * 1024;

export const CHAT_FILE_ACCEPT = [
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.txt', '.md', '.markdown', '.csv', '.json', '.jsonl', '.log',
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.htm',
  '.css', '.scss', '.sql', '.cs', '.java', '.go', '.rs', '.php', '.rb',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd'
].join(',');

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export async function prepareChatFile(file: File, client: ApiClient): Promise<ChatFileAttachment> {
  if (isImageFile(file)) throw new Error(`${file.name} is an image. Use the photo attachment option.`);
  if (file.size > MAX_FILE_INPUT_BYTES) throw new Error(`${file.name} is larger than 10 MB.`);

  const extracted = await client.extractFile(file);
  return {
    kind: 'file',
    id: makeId(),
    name: extracted.filename || file.name,
    mimeType: extracted.content_type || file.type || 'application/octet-stream',
    sizeBytes: extracted.original_bytes ?? file.size,
    extension: extracted.extension || '',
    text: extracted.text,
    extractedChars: extracted.extracted_chars,
    truncated: extracted.truncated,
    metadata: extracted.metadata
  };
}
