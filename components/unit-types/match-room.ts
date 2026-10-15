/**
 * components/unit-types/match-room.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which of a floor's rooms (from the admin) a room tapped in the 3D model
 * is.
 *
 * By English name, not by number. The models are numbered after the
 * brochure; the admin's rooms are numbered in whatever order they were
 * pinned, and on some floors (The Residence Prime's, Trinity Type B's
 * upper floor) the two orders differ. Names agree far more often — with
 * small differences of wording, which normalise() irons out:
 * "Kitchen & Dining Area" ≈ "Kitchen & Dining", "Living · Kitchen ·
 * Dining" ≈ "Living · Dining · Kitchen", "Swimming Pool 1" ≈ "Swimming
 * Pool" when the floor has only one.
 *
 * No match → null, and the section shows the model's own (English) name.
 * Used by the admin's room check too, so the count it reports is the
 * count visitors get.
 * ─────────────────────────────────────────────────────────────────────────
 */

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && word !== "area" && word !== "and" && word !== "the");
}

const exact = (name: string) => words(name).join(" ");
const unordered = (name: string) => [...words(name)].sort().join(" ");
const unnumbered = (name: string) =>
  words(name)
    .filter((word) => !/^\d+$/.test(word))
    .sort()
    .join(" ");

export function matchRoom<T extends { matchName: string }>(modelName: string, rooms: readonly T[]): T | null {
  for (const key of [exact, unordered]) {
    const target = key(modelName);
    const hit = rooms.find((room) => room.matchName && key(room.matchName) === target);
    if (hit) return hit;
  }
  // Numbers ignored only when that leaves exactly one candidate — two
  // "Bedroom"s must not both answer to "Bedroom 1".
  const target = unnumbered(modelName);
  const hits = rooms.filter((room) => room.matchName && unnumbered(room.matchName) === target);
  return hits.length === 1 ? hits[0] : null;
}
