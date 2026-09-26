import type { HealthResponse } from './types';

export function configuredModels(health: HealthResponse | undefined, alias: string): string[] {
  return Array.from(new Set(
    (health?.litellm_deployments ?? [])
      .filter(deployment => deployment.alias === alias && deployment.enabled === true)
      .map(deployment => deployment.model)
      .filter((model): model is string => Boolean(model))
  ));
}
