import { describe, expect, test } from "bun:test";
import { alignments, box, colourName, contains, direction, gap, groupName, labelOf, overlaps, type Element } from "./scene.ts";

function element(overrides: Partial<Element> = {}): Element {
    return { id: "e1", type: "rectangle", x: 0, y: 0, width: 100, height: 100, groupIds: [], ...overrides } as Element;
}

describe("geometry", () => {
    test("detects containment and does not mistake it for overlap", () => {
        const outer = box(element({ x: 0, y: 0, width: 200, height: 200 }));
        const inner = box(element({ x: 50, y: 50, width: 50, height: 50 }));

        expect(contains(outer, inner)).toBe(true);
        expect(contains(inner, outer)).toBe(false);
        expect(overlaps(outer, inner)).toBe(true);
    });

    test("measures the gap between separated boxes and zero when touching", () => {
        const left = box(element({ x: 0, width: 100 }));
        const right = box(element({ x: 140, width: 100 }));
        const touching = box(element({ x: 100, width: 100 }));

        expect(gap(left, right)).toBe(40);
        expect(gap(left, touching)).toBe(0);
    });

    test("reports alignment on shared edges and centres", () => {
        const a = box(element({ x: 0, y: 0, width: 100, height: 50 }));
        const b = box(element({ x: 0, y: 200, width: 100, height: 50 }));

        expect(alignments(a, b)).toContain("left");
        expect(alignments(a, b)).toContain("right");
        expect(alignments(a, b)).toContain("centre-x");
        expect(alignments(a, b)).not.toContain("top");
    });

    test("names directions the way a person would", () => {
        expect(direction(0, 200)).toBe("down");
        expect(direction(-30, -30)).toBe("up-left");
        expect(direction(0, 0)).toBe("in place");
    });
});

describe("colourName", () => {
    test("names the Excalidraw palette", () => {
        expect(colourName("#1e1e1e")).toBe("black");
        expect(colourName("#e03131")).toBe("red");
        expect(colourName("transparent")).toBe("transparent");
    });

    test("derives a name for a colour outside the palette", () => {
        expect(colourName("#00ff00")).toContain("green");
        expect(colourName("#7b2ff7")).toContain("purple");
    });

    test("marks alpha as translucent", () => {
        expect(colourName("#ffffffaa")).toBe("translucent-white");
    });

    test("falls back to the raw value rather than inventing one", () => {
        expect(colourName("url(#gradient)")).toBe("url(#gradient)");
        expect(colourName(undefined)).toBe("unset");
    });
});

describe("labelOf", () => {
    test("uses text bound inside a shape", () => {
        const shape = element({ id: "r1" });
        const bound = element({ id: "t1", type: "text", containerId: "r1", text: "Bound" });

        expect(labelOf(shape, [shape, bound])).toBe("Bound");
    });

    test("uses a caption grouped alongside a shape", () => {
        const shape = element({ id: "r1", x: 0, y: 0, width: 60, height: 60, groupIds: ["g1"] });
        const caption = element({ id: "t1", type: "text", x: 0, y: 60, width: 60, height: 20, groupIds: ["g1"], text: "Subject" });

        expect(labelOf(shape, [shape, caption])).toBe("Subject");
    });

    test("does not name a shape after a caption that belongs to a nearer shape", () => {
        const near = element({ id: "r1", x: 0, y: 0, width: 60, height: 60, groupIds: ["g1"] });
        const far = element({ id: "r2", x: 400, y: 0, width: 60, height: 60, groupIds: ["g1"] });
        const caption = element({ id: "t1", type: "text", x: 0, y: 60, width: 60, height: 20, groupIds: ["g1"], text: "Subject" });
        const scene = [near, far, caption];

        expect(labelOf(near, scene)).toBe("Subject");
        expect(labelOf(far, scene)).toBeUndefined();
        expect(groupName(far, scene)).toBe("Subject");
    });

    test("does not name a connector after a nearby caption", () => {
        const arrow = element({ id: "a1", type: "arrow", x: 0, y: 60, width: 40, height: 0, groupIds: ["g1"] });
        const caption = element({ id: "t1", type: "text", x: 0, y: 60, width: 60, height: 20, groupIds: ["g1"], text: "Pattern" });

        expect(labelOf(arrow, [arrow, caption])).toBeUndefined();
    });
});
