export const state = {
  radarData:       null,
  availableMoments: new Set(),
  activeFile:      null,
  activeSite:      null,
  localFiles:      [],
  s3Files:         [],
  activeFilter:    'all',
  siteScans:       [],
  scanIndex:       -1,
  parsedDataCache: new Map(),
};

export const MAX_PARSED_CACHE = 4;

export function getCachedParsed(filename) {
  const entry = state.parsedDataCache.get(filename);
  if (entry) { entry.ts = Date.now(); return entry.data; }
  return null;
}

// Non-destructive presence check — does not update LRU timestamp
export function hasCachedParsed(filename) {
  return state.parsedDataCache.has(filename);
}

export function clearParsedCache() {
  state.parsedDataCache.clear();
}

export function setCachedParsed(filename, data) {
  if (state.parsedDataCache.size >= MAX_PARSED_CACHE) {
    let oldest = null, oldestTs = Infinity;
    state.parsedDataCache.forEach((v, k) => {
      if (v.ts < oldestTs) { oldest = k; oldestTs = v.ts; }
    });
    if (oldest) state.parsedDataCache.delete(oldest);
  }
  state.parsedDataCache.set(filename, { data, ts: Date.now() });
}
