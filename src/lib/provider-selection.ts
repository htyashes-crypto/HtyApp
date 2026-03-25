import { ALL_PROVIDERS, Provider, WorkspaceRecord } from "./types";

export function getDefaultPublishProviders(): Provider[] {
  return [...ALL_PROVIDERS];
}

export function getDefaultInstallProviders(available: Provider[]): Provider[] {
  return [...available];
}

export function getInstallableProviders(
  available: Provider[],
  workspace: Pick<WorkspaceRecord, "kind" | "availableProviders"> | null
): Provider[] {
  if (!workspace || workspace.kind !== "special") {
    return [...available];
  }

  return available.filter((provider) => workspace.availableProviders.includes(provider));
}

export function toggleProvider(current: Provider[], provider: Provider): Provider[] {
  return current.includes(provider)
    ? current.filter((item) => item !== provider)
    : [...current, provider];
}
