import { describe, it, expect } from "vitest";
import { createRng, nextFloat, nextInt, pick } from "../rng.ts";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = nextFloat(createRng(42));
    const b = nextFloat(createRng(42));
    expect(a.value).toBe(b.value);
  });

  it("produces a different value on the advanced state", () => {
    const first = nextFloat(createRng(42));
    const second = nextFloat(first.rng);
    expect(first.value).not.toBe(second.value);
  });

  it("never mutates the input state", () => {
    const rng = createRng(7);
    const before = rng.seed;
    nextFloat(rng);
    expect(rng.seed).toBe(before);
  });

  it("keeps floats within [0, 1)", () => {
    let rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(rng);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      rng = r.rng;
    }
  });

  it("keeps ints within the inclusive range", () => {
    let rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(rng, 3, 8);
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(8);
      rng = r.rng;
    }
  });

  it("picks an element from the array", () => {
    const r = pick(createRng(5), ["a", "b", "c"]);
    expect(["a", "b", "c"]).toContain(r.value);
  });
});
