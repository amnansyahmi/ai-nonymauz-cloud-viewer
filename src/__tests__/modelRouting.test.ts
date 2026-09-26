import { describe, expect, it } from 'vitest';
import { configuredModels } from '../modelRouting';

describe('configured model mapping', () => {
  it('lists only live provider models for an alias without duplicates', () => {
    const health = { litellm_deployments: [
      { alias: 'ai-nonymauz-fast', model: 'groq/openai/gpt-oss-20b', enabled: true },
      { alias: 'ai-nonymauz-fast', model: 'groq/openai/gpt-oss-20b', enabled: true },
      { alias: 'ai-nonymauz-fast', model: 'trial/other', enabled: false },
      { alias: 'ai-nonymauz-coding', model: 'groq/openai/gpt-oss-120b', enabled: true }
    ] };

    expect(configuredModels(health, 'ai-nonymauz-fast')).toEqual(['groq/openai/gpt-oss-20b']);
    expect(configuredModels(health, 'missing')).toEqual([]);
  });
});
