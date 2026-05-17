export function pageStartsFromCounts(pageWordCounts) {
  if (!pageWordCounts?.length) return [];
  const starts = [];
  let acc = 0;
  for (const count of pageWordCounts) {
    starts.push(acc);
    acc += count;
  }
  return starts;
}

export function markersFromPageStarts(pageStarts, labels, fallbackPrefix = 'Page') {
  return pageStarts.map((wordIndex, i) => ({
    wordIndex,
    label: labels?.[i]?.trim() || `${fallbackPrefix} ${i + 1}`,
    kind: 'section',
  }));
}

export function mergeMarkers(markers, minWordGap = 40) {
  const sorted = [...markers]
    .filter((m) => m && Number.isFinite(m.wordIndex) && m.wordIndex >= 0)
    .sort((a, b) => a.wordIndex - b.wordIndex);

  const out = [];
  for (const m of sorted) {
    const prev = out[out.length - 1];
    if (prev && m.wordIndex - prev.wordIndex < minWordGap) {
      const keep =
        (m.kind === 'chapter' && prev.kind !== 'chapter') ||
        (m.kind === prev.kind && (m.label?.length ?? 0) > (prev.label?.length ?? 0));
      if (keep) out[out.length - 1] = m;
      continue;
    }
    out.push(m);
  }
  return out;
}

export function seekMarker(markers, currentIndex, direction) {
  if (!markers.length) return null;
  if (direction > 0) {
    const next = markers.find((m) => m.wordIndex > currentIndex + 8);
    return next?.wordIndex ?? null;
  }
  const prev = [...markers].reverse().find((m) => m.wordIndex < currentIndex - 8);
  return prev?.wordIndex ?? null;
}
