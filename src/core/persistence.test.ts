import { afterEach, describe, expect, it, vi } from "vitest";
import { loadState } from "./persistence";

function stubStoredState(state: unknown): void {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify(state),
    setItem: vi.fn(),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("printer profile persistence migration", () => {
  const profile = {
    id: "printer-1",
    name: "Office printer",
    outputFacing: "down",
    reloadFlip: "long",
  };

  it("promotes a legacy per-notebook selection to the global selection", () => {
    stubStoredState({
      schemaVersion: 1,
      notebooks: [
        {
          id: "notebook-1",
          printerProfileId: profile.id,
          coverPages: null,
        },
      ],
      printerProfiles: [profile],
      sources: {},
    });

    expect(loadState().activePrinterProfileId).toBe(profile.id);
  });

  it("ignores a selected profile id that no longer exists", () => {
    stubStoredState({
      schemaVersion: 2,
      notebooks: [],
      printerProfiles: [],
      activePrinterProfileId: "deleted-printer",
      sources: {},
    });

    expect(loadState().activePrinterProfileId).toBeUndefined();
  });
});
