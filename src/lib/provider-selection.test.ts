import { describe, expect, it } from "vitest";
import {
  getDefaultInstallProviders,
  getInstallableProviders,
  getDefaultPublishProviders,
  toggleProvider
} from "./provider-selection";

describe("provider selection helpers", () => {
  it("defaults publish to all providers", () => {
    expect(getDefaultPublishProviders()).toEqual(["codex", "claude", "cursor"]);
  });

  it("defaults install to available providers", () => {
    expect(getDefaultInstallProviders(["codex", "cursor"])).toEqual(["codex", "cursor"]);
  });

  it("filters install providers for special workspaces", () => {
    expect(
      getInstallableProviders(["codex", "claude", "cursor"], {
        kind: "special",
        availableProviders: ["codex", "cursor"]
      })
    ).toEqual(["codex", "cursor"]);
  });

  it("keeps all providers for normal workspaces", () => {
    expect(
      getInstallableProviders(["codex", "claude"], {
        kind: "project",
        availableProviders: ["codex"]
      })
    ).toEqual(["codex", "claude"]);
  });

  it("toggles providers predictably", () => {
    expect(toggleProvider(["codex"], "claude")).toEqual(["codex", "claude"]);
    expect(toggleProvider(["codex", "claude"], "codex")).toEqual(["claude"]);
  });
});
