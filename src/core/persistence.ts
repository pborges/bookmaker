import { EMPTY_COVER_PAGES, SCHEMA_VERSION, type PersistedState } from "./model";

const STORAGE_KEY = "bookmaker:state";

export function loadState(): PersistedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { schemaVersion: SCHEMA_VERSION, notebooks: [], printerProfiles: [], sources: {} };
  }
  const parsed = JSON.parse(raw) as PersistedState;
  return migrate(parsed);
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Migration hook: bump SCHEMA_VERSION and add a case here when the shape
// of PersistedState changes. Always coalesce missing fields regardless of
// version match, since a field can be added without bumping the version
// during development, and old stored records must not crash a fresh load.
function migrate(state: PersistedState): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    notebooks: (state.notebooks ?? []).map((nb) => ({
      ...nb,
      coverPages: nb.coverPages ?? { ...EMPTY_COVER_PAGES },
    })),
    printerProfiles: state.printerProfiles ?? [],
    sources: state.sources ?? {},
  };
}
