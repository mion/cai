import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeTransition, readSnapshots, type Snapshot } from "./delta.ts";
import type { Element } from "./scene.ts";

function snapshot(elements: Partial<Element>[], timestamp = 0): Snapshot {
    return {
        timestamp,
        document: "test.excalidraw",
        elements: elements.map((element) => ({
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            groupIds: [],
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            ...element,
        })) as Element[],
    };
}

function transition(before: Snapshot, after: Snapshot): string[] {
    return describeTransition(before, after, new Map(), 1);
}

const rectangle: Partial<Element> = { id: "r1", type: "rectangle" };

describe("noise", () => {
    test("ignores Excalidraw bookkeeping churn", () => {
        const before = snapshot([{ ...rectangle, version: 1, versionNonce: 111, updated: 1, seed: 9, index: "a0" }]);
        const after = snapshot([{ ...rectangle, version: 2, versionNonce: 222, updated: 2, seed: 8, index: "a1" }]);

        expect(transition(before, after)).toEqual([]);
    });

    test("drops elements Excalidraw has tombstoned, and orders by timestamp", () => {
        const directory = mkdtempSync(join(tmpdir(), "cai-delta-"));
        const scene = (elements: unknown[]) => JSON.stringify({ type: "excalidraw", elements });

        // Written out of order on purpose: ordering must come from the name.
        writeFileSync(join(directory, "200.doc.excalidraw"), scene([{ id: "b", type: "rectangle" }]));
        writeFileSync(join(directory, "100.doc.excalidraw"), scene([
            { id: "a", type: "rectangle" },
            { id: "gone", type: "rectangle", isDeleted: true },
        ]));
        writeFileSync(join(directory, "notes.txt"), "ignored");

        const snapshots = readSnapshots(directory);

        expect(snapshots.map((s) => s.timestamp)).toEqual([100, 200]);
        expect(snapshots[0]!.document).toBe("doc.excalidraw");
        expect(snapshots[0]!.elements.map((element) => element.id)).toEqual(["a"]);
    });
});

describe("geometry", () => {
    test("reports where a move went, not merely that it happened", () => {
        const before = snapshot([{ ...rectangle, x: 100, y: 100 }]);
        const after = snapshot([{ ...rectangle, x: 420, y: 160 }]);
        const [line] = transition(before, after);

        expect(line).toContain("moved down-right +320,+60 (326px)");
        expect(line).toContain("@420,160 100x100");
    });

    test("reports a resize with its area ratio", () => {
        const before = snapshot([{ ...rectangle, width: 100, height: 100 }]);
        const after = snapshot([{ ...rectangle, width: 200, height: 100 }]);

        expect(transition(before, after)[0]).toContain("resized 100x100 → 200x100 (area ×2.00)");
    });

    test("does not report the auto-resize caused by editing text", () => {
        const before = snapshot([{ id: "t1", type: "text", text: "hi", originalText: "hi", width: 20 }]);
        const after = snapshot([{ id: "t1", type: "text", text: "hi there", originalText: "hi there", width: 80 }]);

        expect(transition(before, after)[0]).not.toContain("resized");
    });
});

describe("style", () => {
    test("names the colours on both sides of a restyle", () => {
        const before = snapshot([{ ...rectangle, backgroundColor: "transparent" }]);
        const after = snapshot([{ ...rectangle, backgroundColor: "#e03131" }]);

        expect(transition(before, after)[0]).toContain("fill transparent → red");
    });
});

describe("relations", () => {
    const outer: Partial<Element> = { id: "outer", type: "rectangle", x: 0, y: 0, width: 400, height: 400 };

    test("reports containment when a shape is moved inside another", () => {
        const before = snapshot([outer, { id: "inner", type: "rectangle", x: 900, y: 900, width: 50, height: 50 }]);
        const after = snapshot([outer, { id: "inner", type: "rectangle", x: 100, y: 100, width: 50, height: 50 }]);
        const lines = transition(before, after).join("\n");

        expect(lines).toContain("now inside rectangle #oute");
    });

    test("reports containment lost when a shape is moved out", () => {
        const before = snapshot([outer, { id: "inner", type: "rectangle", x: 100, y: 100, width: 50, height: 50 }]);
        const after = snapshot([outer, { id: "inner", type: "rectangle", x: 900, y: 900, width: 50, height: 50 }]);

        expect(transition(before, after).join("\n")).toContain("no longer inside rectangle #oute");
    });

    test("does not claim containment changed when only grouping did", () => {
        const inner: Partial<Element> = { id: "inner", type: "rectangle", x: 100, y: 100, width: 50, height: 50 };
        const before = snapshot([outer, inner]);
        const after = snapshot([
            { ...outer, groupIds: ["g1"] },
            { ...inner, groupIds: ["g1"] },
        ]);
        const lines = transition(before, after).join("\n");

        expect(lines).toContain("grouped with");
        expect(lines).not.toContain("no longer contains");
        expect(lines).not.toContain("no longer inside");
    });

    test("reports proximity with the actual distance", () => {
        const before = snapshot([rectangle, { id: "r2", type: "rectangle", x: 900 }]);
        const after = snapshot([rectangle, { id: "r2", type: "rectangle", x: 140 }]);

        expect(transition(before, after).join("\n")).toContain("now 40px from rectangle #r1");
    });

    test("does not report proximity to a shape's own caption", () => {
        const shape: Partial<Element> = { id: "s1", type: "ellipse", x: 0, y: 0, width: 60, height: 60, groupIds: ["g1"] };
        const caption: Partial<Element> = { id: "c1", type: "text", x: 0, y: 60, width: 60, height: 20, groupIds: ["g1"], text: "Subject" };
        const before = snapshot([shape, caption, { id: "far", type: "rectangle", x: 2000 }]);
        const after = snapshot([shape, caption, { id: "far", type: "rectangle", x: 200 }]);

        expect(transition(before, after).join("\n")).not.toContain("#c1");
    });
});

describe("naming", () => {
    test("names a shape by the text bound inside it", () => {
        const before = snapshot([]);
        const after = snapshot([rectangle, { id: "t1", type: "text", containerId: "r1", text: "Inside" }]);
        const lines = transition(before, after);

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('rectangle "Inside"');
    });

    test("reports a caption added to a shape that already existed", () => {
        const before = snapshot([rectangle]);
        const after = snapshot([rectangle, { id: "t1", type: "text", containerId: "r1", text: "Named later" }]);

        expect(transition(before, after).join("\n")).toContain("label");
    });

    test("resolves both ends of an arrow to the shapes it joins", () => {
        const from: Partial<Element> = { id: "from", type: "rectangle", x: 0, groupIds: [] };
        const to: Partial<Element> = { id: "to", type: "rectangle", x: 400, groupIds: [] };
        const before = snapshot([from, to]);
        const after = snapshot([
            from,
            to,
            {
                id: "a1",
                type: "arrow",
                x: 100,
                width: 300,
                height: 0,
                startBinding: { elementId: "from" },
                endBinding: { elementId: "to" },
            },
        ]);

        expect(transition(before, after).join("\n")).toContain("connects rectangle #from → rectangle #to");
    });
});

describe("text", () => {
    test("describes the edit rather than the whole text", () => {
        const body = `A long standing question. ${"padding text ".repeat(60)}`;
        const before = snapshot([{ id: "t1", type: "text", text: body, originalText: body }]);
        const after = snapshot([{ id: "t1", type: "text", text: `${body}And a new conclusion.`, originalText: `${body}And a new conclusion.` }]);
        const [line] = transition(before, after);

        expect(line).toContain("appended");
        expect(line).toContain('+"And a new conclusion."');
        expect(line!.length).toBeLessThan(body.length);
    });

    test("notices a return to wording used earlier", () => {
        const history = new Map();
        const first = snapshot([{ id: "t1", type: "text", text: "original claim", originalText: "original claim" }]);
        const second = snapshot([{ id: "t1", type: "text", text: "revised claim", originalText: "revised claim" }]);

        describeTransition(snapshot([]), first, history, 1);
        describeTransition(first, second, history, 2);
        const back = describeTransition(second, first, history, 3);

        expect(back.join("\n")).toContain("restored wording from step 1");
    });
});
