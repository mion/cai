import { log } from "node:console";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG = await import("../package.json");

type Element = Record<string, unknown> & { id: string; type: string };

type Snapshot = {
    timestamp: number;
    document: string;
    elements: Element[];
};

// Excalidraw rewrites this bookkeeping on almost every save. `index` is the
// fractional z-order key, which churns whenever anything is grouped or added.
// None of it says anything about what the user was thinking.
const NOISE_FIELDS = new Set(["version", "versionNonce", "updated", "seed", "index"]);

const POSITION_FIELDS = ["x", "y"];
const SIZE_FIELDS = ["width", "height"];
const TEXT_FIELDS = ["text", "originalText"];
const STYLE_FIELDS = [
    "strokeColor",
    "backgroundColor",
    "strokeStyle",
    "fillStyle",
    "strokeWidth",
    "roughness",
    "opacity",
    "fontSize",
    "fontFamily",
    "textAlign",
    "verticalAlign",
];
const STRUCTURE_FIELDS = ["groupIds", "boundElements", "containerId", "startBinding", "endBinding"];

// A gap longer than this reads as the user having left and come back.
const SESSION_GAP_MS = 30 * 60 * 1000;

function readSnapshots(snapshotsDirPath: string): Snapshot[] {
    const snapshots: Snapshot[] = [];

    for (const fileName of readdirSync(snapshotsDirPath)) {
        if (!fileName.endsWith(".excalidraw")) continue;

        const separator = fileName.indexOf(".");
        const timestamp = Number(fileName.slice(0, separator));
        if (!Number.isFinite(timestamp)) continue;

        const scene = JSON.parse(readFileSync(join(snapshotsDirPath, fileName), "utf8"));
        snapshots.push({
            timestamp,
            document: fileName.slice(separator + 1),
            elements: Array.isArray(scene.elements) ? scene.elements : [],
        });
    }

    return snapshots.sort((a, b) => a.timestamp - b.timestamp);
}

function quote(value: unknown): string {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > 48 ? `"${text.slice(0, 48)}…"` : `"${text}"`;
}

/**
 * Excalidraw stores a labelled shape as two elements: the shape, and a text
 * element bound to it by `containerId`. Treating them separately double-reports
 * every act, so bound text is always described as its container.
 */
function boundContainer(element: Element, byId: Map<string, Element>): Element | undefined {
    return typeof element.containerId === "string" ? byId.get(element.containerId) : undefined;
}

function labelElement(element: Element, byId: Map<string, Element>): string {
    const container = boundContainer(element, byId);
    const own = typeof element.text === "string" && element.text.trim() ? element.text : undefined;

    if (container) return own ? `${container.type} ${quote(own)}` : container.type;
    if (own) return `${element.type} ${quote(own)}`;

    for (const candidate of byId.values()) {
        if (candidate.containerId === element.id && typeof candidate.text === "string" && candidate.text.trim()) {
            return `${element.type} ${quote(candidate.text)}`;
        }
    }

    return element.type;
}

function changedFields(before: Element, after: Element): string[] {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...fields].filter(
        (field) =>
            !NOISE_FIELDS.has(field) &&
            JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    );
}

function describeChange(before: Element, after: Element, label: string, isBoundText: boolean): string[] {
    const changed = new Set(changedFields(before, after));
    if (changed.size === 0) return [];

    const events: string[] = [];
    const editedText = TEXT_FIELDS.some((field) => changed.has(field));

    if (editedText) {
        events.push(`edited ${label} (was ${quote(before.text ?? "")})`);
    }

    // Bound text is dragged, resized and grouped by its container. Reporting
    // those again here would describe one act as two.
    if (!isBoundText) {
        if (POSITION_FIELDS.some((field) => changed.has(field))) {
            events.push(`moved ${label}`);
        }
        // Editing text auto-resizes its box, so that resize is an artifact, not an act.
        if (!editedText && SIZE_FIELDS.some((field) => changed.has(field))) {
            events.push(`resized ${label}`);
        }
        if (changed.has("groupIds")) {
            const grouped = (after.groupIds as unknown[] | undefined)?.length ?? 0;
            const wasGrouped = (before.groupIds as unknown[] | undefined)?.length ?? 0;
            events.push(`${grouped > wasGrouped ? "grouped" : "ungrouped"} ${label}`);
        }
        if (STRUCTURE_FIELDS.some((field) => field !== "groupIds" && changed.has(field))) {
            events.push(`reconnected ${label}`);
        }
    }

    if (STYLE_FIELDS.some((field) => changed.has(field))) {
        events.push(`restyled ${label}`);
    }

    if (events.length === 0 && !isBoundText) {
        events.push(`changed ${label} (${[...changed].sort().join(", ")})`);
    }

    return events;
}

export function describeTransition(before: Snapshot, after: Snapshot): string[] {
    const beforeById = new Map(before.elements.map((element) => [element.id, element]));
    const afterById = new Map(after.elements.map((element) => [element.id, element]));

    const events: string[] = [];

    for (const [id, element] of afterById) {
        if (beforeById.has(id)) continue;
        const container = boundContainer(element, afterById);
        // The container's own "created" event already carries this label.
        if (container && !beforeById.has(container.id)) continue;
        const label = labelElement(element, afterById);
        events.push(container ? `labelled ${label}` : `created ${label}`);
    }

    for (const [id, element] of beforeById) {
        if (afterById.has(id)) continue;
        const container = boundContainer(element, beforeById);
        if (container && !afterById.has(container.id)) continue;
        const label = labelElement(element, beforeById);
        events.push(container ? `unlabelled ${label}` : `deleted ${label}`);
    }

    for (const [id, element] of afterById) {
        const previous = beforeById.get(id);
        if (!previous) continue;
        events.push(
            ...describeChange(
                previous,
                element,
                labelElement(element, afterById),
                boundContainer(element, afterById) !== undefined,
            ),
        );
    }

    return countDuplicates(events);
}

/**
 * A shape and its label can produce the same sentence (both were restyled), and
 * identical elements are often created together. Collapse repeats but keep the
 * count, so the timeline stays short without misreporting how much happened.
 */
function countDuplicates(events: string[]): string[] {
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event, (counts.get(event) ?? 0) + 1);
    return [...counts].map(([event, count]) => (count > 1 ? `${event} (×${count})` : event));
}

function formatGap(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${(minutes / 60).toFixed(1)}h`;
}

function printTimeline(snapshots: Snapshot[]): void {
    log(`${snapshots.length} snapshots of ${snapshots[0]?.document}`);
    log(`first ${new Date(snapshots[0]!.timestamp).toLocaleString()}`);
    log(`last  ${new Date(snapshots[snapshots.length - 1]!.timestamp).toLocaleString()}\n`);

    const initial = snapshots[0]!.elements.length;
    log(`${initial} element${initial === 1 ? "" : "s"} already present at the first snapshot`);

    for (let i = 1; i < snapshots.length; i++) {
        const before = snapshots[i - 1]!;
        const after = snapshots[i]!;
        const events = describeTransition(before, after);

        // A save that changed nothing meaningful is not part of the trajectory.
        if (events.length === 0) continue;

        const gap = after.timestamp - before.timestamp;
        if (gap > SESSION_GAP_MS) {
            log(`\n--- ${formatGap(gap)} away ---`);
        }

        log(`\n[+${formatGap(gap)}] ${new Date(after.timestamp).toLocaleTimeString()}`);
        for (const event of events) log(`    ${event}`);
    }
}

function main(args: string[]): void {
    log(`${PKG.displayName} v${PKG.version} — delta\n`);

    if (args.length !== 1) {
        log("USAGE: delta [path to directory]");
        process.exit(1);
    }

    const targetDirPath: string = args[0] ? args[0] : "";
    const snapshotsDirPath: string = resolve(targetDirPath, ".snapshots");
    const snapshots = readSnapshots(snapshotsDirPath);

    if (snapshots.length < 2) {
        log(`Need at least 2 snapshots in ${snapshotsDirPath}, found ${snapshots.length}`);
        process.exit(1);
    }

    printTimeline(snapshots);
}

if (import.meta.main) main(process.argv.slice(2));
