const coordinatePairRegex = /^\s*(?<a>[0-9.-]+)°?\s*(,\s*(?<b>[0-9.-]+)°?)?\s*$/;

function sanitizeNumber(s: string | undefined, min: number, max: number): number | undefined {
  if (!s) {
    return undefined;
  }

  const n: number = Number(s);

  return Number.isNaN(n) || n < min || n > max ? undefined : n;
}

export function sanitizeCoordinates(
  input: string | undefined
): [ number, number ] | undefined {

  const matches: RegExpMatchArray | null | undefined = input?.match(coordinatePairRegex);

  const lat: number | undefined = sanitizeNumber(matches?.groups?.a, -90, 90);
  const lon: number | undefined = sanitizeNumber(matches?.groups?.b, -180, 180);

  return lat !== undefined && lon !== undefined ? [ lat, lon ] : undefined;
}
