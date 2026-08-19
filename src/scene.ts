/**
 * Geometry, colour and naming helpers for a single Excalidraw scene.
 *
 * On a whiteboard, meaning lives in arrangement: what sits inside what, what
 * touches what, what lines up, what is joined by an arrow. None of that is
 * stated in the file — it has to be derived from coordinates.
 */

export type Element = Record<string, unknown> & { id: string; type: string };

export type Box = { left: number; top: number; right: number; bottom: number };

/** Bounding boxes closer than this read as deliberately placed together. */
export const NEAR_PX = 80;

/** Excalidraw snaps to a grid, so alignment is exact far more often than not. */
export const ALIGN_TOLERANCE_PX = 2;

export function box(element: Element): Box {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    return { left: x, top: y, right: x + width, bottom: y + height };
}

export function area(element: Element): number {
    return (Number(element.width) || 0) * (Number(element.height) || 0);
}

export function overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function contains(outer: Box, inner: Box): boolean {
    return (
        outer.left <= inner.left + ALIGN_TOLERANCE_PX &&
        outer.top <= inner.top + ALIGN_TOLERANCE_PX &&
        outer.right >= inner.right - ALIGN_TOLERANCE_PX &&
        outer.bottom >= inner.bottom - ALIGN_TOLERANCE_PX
    );
}

/** Shortest distance between two boxes; 0 when they touch or overlap. */
export function gap(a: Box, b: Box): number {
    const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
    const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
    return Math.round(Math.hypot(dx, dy));
}

export function alignments(a: Box, b: Box): string[] {
    const found: string[] = [];
    const near = (p: number, q: number) => Math.abs(p - q) <= ALIGN_TOLERANCE_PX;

    if (near(a.left, b.left)) found.push("left");
    if (near(a.right, b.right)) found.push("right");
    if (near(a.top, b.top)) found.push("top");
    if (near(a.bottom, b.bottom)) found.push("bottom");
    if (near((a.left + a.right) / 2, (b.left + b.right) / 2)) found.push("centre-x");
    if (near((a.top + a.bottom) / 2, (b.top + b.bottom) / 2)) found.push("centre-y");

    return found;
}

export function direction(dx: number, dy: number): string {
    const parts: string[] = [];
    if (dy < 0) parts.push("up");
    if (dy > 0) parts.push("down");
    if (dx < 0) parts.push("left");
    if (dx > 0) parts.push("right");
    return parts.join("-") || "in place";
}

// Excalidraw's default palette. Naming these matters because a user reaching for
// red is doing something different from a user reaching for the default black.
const PALETTE: Record<string, string> = {
    transparent: "transparent",
    "#1e1e1e": "black",
    "#343a40": "dark-grey",
    "#495057": "grey",
    "#ffffff": "white",
    "#e03131": "red",
    "#2f9e44": "green",
    "#1971c2": "blue",
    "#f08c00": "orange",
    "#ffc9c9": "pale-red",
    "#b2f2bb": "pale-green",
    "#a5d8ff": "pale-blue",
    "#ffec99": "pale-yellow",
    "#0c8599": "teal",
};

function hueName(h: number): string {
    if (h < 15 || h >= 345) return "red";
    if (h < 45) return "orange";
    if (h < 70) return "yellow";
    if (h < 160) return "green";
    if (h < 200) return "teal";
    if (h < 250) return "blue";
    if (h < 290) return "purple";
    return "pink";
}

/** Falls back to describing an unknown hex rather than echoing it raw. */
export function colourName(value: unknown): string {
    if (typeof value !== "string") return "unset";

    const lower = value.toLowerCase();
    const known = PALETTE[lower];
    if (known) return known;

    const hex = lower.replace("#", "");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return lower;

    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const delta = max - min;

    let name: string;
    if (delta < 0.08) {
        name = lightness > 0.9 ? "white" : lightness > 0.6 ? "light-grey" : lightness > 0.25 ? "grey" : "black";
    } else {
        let hue: number;
        if (max === r) hue = 60 * (((g - b) / delta + 6) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);

        const shade = lightness > 0.75 ? "pale-" : lightness < 0.3 ? "dark-" : "";
        name = shade + hueName(hue);
    }

    return alpha < 0.95 ? `translucent-${name}` : name;
}

/**
 * A shape's name can come from text bound inside it (`containerId`) or from a
 * caption grouped alongside it. Both appear in real files, and a shape that
 * loses its name in the trace stops being followable.
 */
/** Connectors and sketch strokes are not named by a caption sitting near them. */
const NAMEABLE_TYPES = new Set(["rectangle", "ellipse", "diamond", "image", "frame", "embeddable"]);

function groupIdsOf(element: Element): string[] {
    return Array.isArray(element.groupIds) ? (element.groupIds as string[]) : [];
}

/**
 * A caption names the shape it sits closest to. Any other shape in the group
 * merely belongs to a group that has that name — calling it by that name would
 * assert something the file does not say, so `groupName` reports it separately.
 */
function nearestCaption(element: Element, elements: Element[]): Element | undefined {
    const groupIds = groupIdsOf(element);
    if (groupIds.length === 0) return undefined;

    let best: { element: Element; distance: number } | undefined;
    for (const other of elements) {
        if (other.id === element.id || typeof other.text !== "string" || !other.text.trim()) continue;
        if (!groupIdsOf(other).some((id) => groupIds.includes(id))) continue;

        const distance = gap(box(element), box(other));
        if (!best || distance < best.distance) best = { element: other, distance };
    }

    return best?.element;
}

function ownsCaption(element: Element, caption: Element, elements: Element[]): boolean {
    const distance = gap(box(element), box(caption));

    for (const other of elements) {
        if (other.id === element.id || other.id === caption.id) continue;
        if (!NAMEABLE_TYPES.has(other.type)) continue;
        if (!groupIdsOf(other).some((id) => groupIdsOf(caption).includes(id))) continue;
        if (gap(box(other), box(caption)) < distance) return false;
    }

    return true;
}

export function labelOf(element: Element, elements: Element[]): string | undefined {
    if (typeof element.text === "string" && element.text.trim()) return element.text;

    for (const other of elements) {
        if (other.containerId === element.id && typeof other.text === "string" && other.text.trim()) {
            return other.text;
        }
    }

    if (!NAMEABLE_TYPES.has(element.type)) return undefined;

    const caption = nearestCaption(element, elements);
    if (!caption || !ownsCaption(element, caption, elements)) return undefined;

    return caption.text as string;
}

/** The name of the group an element belongs to, when the element has no name of its own. */
export function groupName(element: Element, elements: Element[]): string | undefined {
    if (labelOf(element, elements)) return undefined;

    const caption = nearestCaption(element, elements);
    return typeof caption?.text === "string" ? caption.text : undefined;
}

export function isBoundLabel(element: Element, byId: Map<string, Element>): boolean {
    return typeof element.containerId === "string" && byId.has(element.containerId);
}

/** Arrow endpoints are the only explicitly stated relationship in the file. */
export function bindings(element: Element): { start?: string; end?: string } {
    const start = element.startBinding as { elementId?: string } | undefined;
    const end = element.endBinding as { elementId?: string } | undefined;
    return { start: start?.elementId, end: end?.elementId };
}
