import { describe, expect, test } from "bun:test";
import { describeTransition } from "./delta.ts";

type TestElement = Record<string, unknown> & { id: string; type: string };

function snapshot(elements: TestElement[]) {
    return { timestamp: 0, document: "test.excalidraw", elements: elements as never };
}

function rectangle(overrides: Partial<TestElement> = {}): TestElement {
    return { id: "r1", type: "rectangle", x: 0, y: 0, width: 100, height: 50, version: 1, ...overrides };
}

function label(overrides: Partial<TestElement> = {}): TestElement {
    return { id: "t1", type: "text", containerId: "r1", text: "before", originalText: "before", ...overrides };
}

describe("describeTransition", () => {
    test("ignores Excalidraw bookkeeping churn", () => {
        const before = snapshot([rectangle({ version: 1, versionNonce: 111, updated: 1, seed: 9, index: "a0" })]);
        const after = snapshot([rectangle({ version: 2, versionNonce: 222, updated: 2, seed: 8, index: "a1" })]);

        expect(describeTransition(before, after)).toEqual([]);
    });

    test("reports a bound text edit once, as its container", () => {
        const before = snapshot([rectangle(), label()]);
        const after = snapshot([rectangle(), label({ text: "after", originalText: "after" })]);

        expect(describeTransition(before, after)).toEqual(['edited rectangle "after" (was "before")']);
    });

    test("does not report the auto-resize caused by editing text", () => {
        const before = snapshot([{ id: "t2", type: "text", text: "hi", originalText: "hi", width: 20 }]);
        const after = snapshot([{ id: "t2", type: "text", text: "hi there", originalText: "hi there", width: 80 }]);

        expect(describeTransition(before, after)).toEqual(['edited text "hi there" (was "hi")']);
    });

    test("does not report bound text as separately moved", () => {
        const before = snapshot([rectangle({ x: 0 }), label({ x: 5 })]);
        const after = snapshot([rectangle({ x: 300 }), label({ x: 305 })]);

        expect(describeTransition(before, after)).toEqual(['moved rectangle "before"']);
    });

    test("attributes a new label to its container rather than creating twice", () => {
        const before = snapshot([]);
        const after = snapshot([rectangle(), label()]);

        expect(describeTransition(before, after)).toEqual(['created rectangle "before"']);
    });

    test("reports a label added to an existing shape", () => {
        const before = snapshot([rectangle()]);
        const after = snapshot([rectangle(), label()]);

        expect(describeTransition(before, after)).toEqual(['labelled rectangle "before"']);
    });

    test("counts repeated identical events instead of listing them", () => {
        const before = snapshot([]);
        const after = snapshot([
            { id: "a", type: "text", text: "Agent", originalText: "Agent" },
            { id: "b", type: "text", text: "Agent", originalText: "Agent" },
        ]);

        expect(describeTransition(before, after)).toEqual(['created text "Agent" (×2)']);
    });

    test("distinguishes grouping from ungrouping", () => {
        const grouped = snapshot([rectangle({ groupIds: ["g1"] })]);
        const ungrouped = snapshot([rectangle({ groupIds: [] })]);

        expect(describeTransition(ungrouped, grouped)).toEqual(["grouped rectangle"]);
        expect(describeTransition(grouped, ungrouped)).toEqual(["ungrouped rectangle"]);
    });

    test("reports deletion of a shape and its label as one event", () => {
        const before = snapshot([rectangle(), label()]);
        const after = snapshot([]);

        expect(describeTransition(before, after)).toEqual(['deleted rectangle "before"']);
    });
});
