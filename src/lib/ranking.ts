import { round } from './utils';

export type RankingMethod = 'COMPETITION' | 'DENSE';

export type Rankable<T> = {
  item: T;
  score: number;
};

/**
 * Assigns positions to a scored list, handling ties the way an examination
 * office expects.
 *
 *   scores 95, 95, 91
 *     COMPETITION -> 1, 1, 3   (the tied pair consumes both slots)
 *     DENSE       -> 1, 1, 2   (the next distinct score takes the next number)
 *
 * Scores are compared to two decimal places so floating-point noise in a
 * percentage never splits a genuine tie.
 */
export function assignPositions<T>(
  entries: Rankable<T>[],
  method: RankingMethod = 'COMPETITION',
): { item: T; score: number; position: number }[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);

  const out: { item: T; score: number; position: number }[] = [];
  let position = 0;
  let lastScore: number | null = null;
  let seen = 0;

  for (const entry of sorted) {
    seen += 1;
    const score = round(entry.score, 2);

    if (lastScore === null || score !== lastScore) {
      position = method === 'DENSE' ? position + 1 : seen;
      lastScore = score;
    }

    out.push({ item: entry.item, score: entry.score, position });
  }

  return out;
}

/**
 * Convenience wrapper returning a Map from an identifier to its position.
 */
export function positionMap<T>(
  entries: Rankable<T>[],
  idOf: (item: T) => string,
  method: RankingMethod = 'COMPETITION',
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of assignPositions(entries, method)) {
    map.set(idOf(row.item), row.position);
  }
  return map;
}
