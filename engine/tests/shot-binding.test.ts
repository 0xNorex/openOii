import { describe, expect, it } from "vitest";
import { bindShotCharacters } from "../src/agents/index.js";

const cast = [
  { id: 1, name: "陈望海" },
  { id: 2, name: "小鸥" },
];

describe("bindShotCharacters", () => {
  it("binds exact names in cast order", () => {
    expect(bindShotCharacters({ character_names: ["小鸥", "陈望海"] }, cast)).toEqual([1, 2]);
  });

  it("tolerates spaces and titles around the name", () => {
    expect(bindShotCharacters({ character_names: [" 老渔夫陈望海 "] }, cast)).toEqual([1]);
  });

  it("falls back to names mentioned in the shot when character_names is empty", () => {
    expect(
      bindShotCharacters({ character_names: [], description: "陈望海把纸船递给小鸥", dialogue: "" }, cast),
    ).toEqual([1, 2]);
  });

  it("binds nobody for a pure scenery shot", () => {
    expect(bindShotCharacters({ description: "雨落在港口" }, cast)).toEqual([]);
  });
});
