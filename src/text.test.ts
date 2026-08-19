import { describe, expect, test } from "bun:test";
import { describeEdit, digest, envelope, shape } from "./text.ts";

const long = `The core difficulty is knowing when to speak. ${"filler words here ".repeat(40)}And that is the end.`;

describe("envelope", () => {
    test("passes short text through whole", () => {
        expect(envelope("what is a tool ?")).toBe('"what is a tool ?"');
    });

    test("keeps head and tail of long text and states its size", () => {
        const result = envelope(long);

        expect(result).toContain("The core difficulty is knowing when to speak.");
        expect(result).toContain("And that is the end.");
        expect(result).toContain(`${long.length} chars`);
        expect(result.length).toBeLessThan(long.length / 2);
    });

    test("collapses newlines so one element stays on one line", () => {
        expect(envelope("first\nsecond")).toBe('"first second"');
    });
});

describe("shape", () => {
    test("counts characters, words and lines", () => {
        expect(shape("one two\nthree")).toBe("13 chars, 3 words, 2 lines");
    });
});

describe("describeEdit", () => {
    test("says nothing when the text is unchanged", () => {
        expect(describeEdit("same", "same")).toBe("");
    });

    test("recognises an append and reports only what was added", () => {
        const result = describeEdit("first thought", "first thought and then a second");

        expect(result).toStartWith("appended");
        expect(result).toContain('+"and then a second"');
        expect(result).not.toContain("first thought\"");
    });

    test("recognises a prepend", () => {
        expect(describeEdit("the conclusion", "before that, the conclusion")).toStartWith("prepended");
    });

    test("recognises a deletion", () => {
        const result = describeEdit("keep this part but not this bit", "keep this part");

        expect(result).toStartWith("cut");
        expect(result).toContain('-"but not this bit"');
    });

    test("locates an interior revision and shows both sides", () => {
        const result = describeEdit("a b c wrong e f g", "a b c right e f g");

        expect(result).toContain("revised");
        expect(result).toContain('-"wrong"');
        expect(result).toContain('+"right"');
    });

    test("reports a wholesale rewrite as such", () => {
        expect(describeEdit("one idea", "a completely different claim")).toStartWith("rewrote");
    });

    test("caps a huge changed span and marks what was elided", () => {
        const before = "start";
        const after = `start ${"padding word ".repeat(200)}`;
        const result = describeEdit(before, after);

        expect(result).toContain("chars]");
        expect(result.length).toBeLessThan(400);
    });

    test("counts words and characters on both sides", () => {
        expect(describeEdit("one two three", "one two")).toContain("13→7 chars");
    });
});

describe("digest", () => {
    test("matches only identical text", () => {
        expect(digest("a thought")).toBe(digest("a thought"));
        expect(digest("a thought")).not.toBe(digest("a thought "));
    });
});
