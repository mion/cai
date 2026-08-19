import { log } from "node:console";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
    NEAR_PX,
    alignments,
    area,
    bindings,
    box,
    colourName,
    contains,
    direction,
    gap,
    groupName,
    isBoundLabel,
    labelOf,
    overlaps,
    type Element,
} from "./scene.ts";
import { describeEdit, digest, envelope } from "./text.ts";

const PKG = await import("../package.json");

type Snapshot = {
    timestamp: number;
    document: string;
    elements: Element[];
};

// Excalidraw rewrites this bookkeeping on almost every save. `index` is the
// fractional z-order key, which churns whenever anything is grouped.
const NOISE_FIELDS = new Set(["version", "versionNonce", "updated", "seed", "index"]);

const STYLE_LABELS: Record<string, string> = {
    strokeColor: "stroke",
    backgroundColor: "fill",
    strokeStyle: "stroke-style",
    fillStyle: "fill-style",
    strokeWidth: "stroke-width",
    roughness: "roughness",
    opacity: "opacity",
    fontSize: "font-size",
    fontFamily: "font-family-id",
    textAlign: "text-align",
    verticalAlign: "vertical-align",
};

const COLOUR_FIELDS = new Set(["strokeColor", "backgroundColor"]);

// A gap longer than this reads as the user having left and come back.
const SESSION_GAP_MS = 30 * 60 * 1000;

/** Enough relations to convey the arrangement without listing the whole scene. */
const MAX_RELATIONS_PER_ELEMENT = 3;

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
            elements: (Array.isArray(scene.elements) ? scene.elements : []).filter(
                (element: Element) => !element.isDeleted,
            ),
        });
    }

    return snapshots.sort((a, b) => a.timestamp - b.timestamp);
}

function shortId(id: string): string {
    return id.slice(0, 4);
}

function groupsOf(element: Element): string[] {
    return Array.isArray(element.groupIds) ? (element.groupIds as string[]) : [];
}

function sharesGroup(a: Element, b: Element): boolean {
    const groups = groupsOf(b);
    return groupsOf(a).some((id) => groups.includes(id));
}

function quoteLabel(text: string | undefined): string {
    if (!text) return "";
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > 32 ? ` "${flat.slice(0, 32)}…"` : ` "${flat}"`;
}

/** How an element is referred to when it is not the subject of the line. */
function refer(element: Element, elements: Element[]): string {
    const own = labelOf(element, elements);
    if (own) return `${element.type}${quoteLabel(own)}`;

    const group = groupName(element, elements);
    return group ? `${element.type} (in${quoteLabel(group)})` : element.type;
}

function position(element: Element): string {
    const b = box(element);
    return `@${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.right - b.left)}x${Math.round(b.bottom - b.top)}`;
}

function colours(element: Element): string {
    const stroke = colourName(element.strokeColor);
    const fill = colourName(element.backgroundColor);
    return fill === "transparent" ? stroke : `${stroke} on ${fill}`;
}

/**
 * Text sitting inside or captioning a shape is not an idea of its own — it is
 * that shape's name. Saying so keeps the shape followable and stops the same
 * label being reported as two separate things.
 */
function captionTarget(element: Element, elements: Element[]): Element | undefined {
    if (element.type !== "text") return undefined;

    if (typeof element.containerId === "string") {
        const container = elements.find((other) => other.id === element.containerId);
        if (container) return container;
    }

    const groups = groupsOf(element);
    if (groups.length === 0) return undefined;

    let best: { element: Element; distance: number } | undefined;
    for (const other of elements) {
        if (other.id === element.id || other.type === "text" || !sharesGroup(element, other)) continue;
        const distance = gap(box(element), box(other));
        if (distance <= NEAR_PX && (!best || distance < best.distance)) best = { element: other, distance };
    }

    return best?.element;
}

function describeElement(element: Element, elements: Element[]): string {
    const caption = captionTarget(element, elements);
    const own = typeof element.text === "string" ? element.text : undefined;

    if (caption) {
        const body = own ? ` ${envelope(own)}` : "";
        return `label${body} on ${refer(caption, elements)} #${shortId(caption.id)}`;
    }

    const parts = [element.type];
    if (element.type === "text" && own !== undefined) parts.push(envelope(own));
    else if (labelOf(element, elements)) parts.push(quoteLabel(labelOf(element, elements)).trim());

    parts.push(position(element), colours(element));

    if (element.type === "arrow") {
        const bound = bindings(element);
        const from = elements.find((other) => other.id === bound.start);
        const to = elements.find((other) => other.id === bound.end);
        if (from || to) {
            const name = (target: Element | undefined) =>
                target ? `${refer(target, elements)} #${shortId(target.id)}` : "nothing";
            parts.push(`connects ${name(from)} → ${name(to)}`);
        }
    }

    return parts.join(" ");
}

type Relation = { kind: string; otherId: string; detail?: string; distance?: number };

function relationKey(relation: Relation): string {
    return `${relation.kind}:${relation.otherId}:${relation.detail ?? ""}`;
}

/**
 * Relations are only computed for elements the user actually touched, so output
 * stays proportional to the edit rather than to the size of the whiteboard.
 *
 * At most one relation is kept per pair: a shape that both overlaps and aligns
 * with another is described by the stronger fact.
 */
function relationsFor(element: Element, elements: Element[]): Relation[] {
    const relations: Relation[] = [];
    const self = box(element);

    for (const other of elements) {
        if (other.id === element.id) continue;
        // A caption is not an independent object, so being near one is not news;
        // the shape it names is reported instead.
        if (captionTarget(other, elements)) continue;

        const target = box(other);
        const distance = gap(self, target);

        // Containment and overlap are geometric facts that grouping does not
        // change. Only proximity between group members is suppressed, since
        // members of one group are placed together by definition.
        if (contains(target, self) && area(other) > area(element)) {
            relations.push({ kind: "inside", otherId: other.id });
        } else if (contains(self, target) && area(element) > area(other)) {
            relations.push({ kind: "contains", otherId: other.id });
        } else if (overlaps(self, target)) {
            relations.push({ kind: "overlaps", otherId: other.id });
        } else if (sharesGroup(element, other)) {
            continue;
        } else if (distance <= NEAR_PX) {
            relations.push({ kind: "near", otherId: other.id, detail: `${distance}px` });
        } else {
            const aligned = alignments(self, target);
            if (aligned.length && distance <= NEAR_PX * 4) {
                relations.push({ kind: "aligned", otherId: other.id, detail: aligned.join("+"), distance });
            }
        }
    }

    return relations;
}

/**
 * Excalidraw snaps to a grid, so in a tidy diagram nearly everything aligns with
 * nearly everything. Alignment is therefore only worth one mention, and only
 * when a move established it — on creation it says nothing about intent.
 */
function pickRelations(relations: Relation[], max: number, allowAligned: boolean): Relation[] {
    const ranked = [...relations].sort((a, b) => {
        const priority = RELATION_PRIORITY.indexOf(a.kind) - RELATION_PRIORITY.indexOf(b.kind);
        return priority !== 0 ? priority : (a.distance ?? 0) - (b.distance ?? 0);
    });

    const picked: Relation[] = [];
    let aligned = 0;

    for (const relation of ranked) {
        if (relation.kind === "aligned") {
            if (!allowAligned || aligned >= 1) continue;
            aligned++;
        }
        picked.push(relation);
        if (picked.length >= max) break;
    }

    return picked;
}

function renderRelation(relation: Relation, elements: Element[], gained: boolean): string | undefined {
    const other = elements.find((element) => element.id === relation.otherId);
    if (!other) return undefined;

    const name = `${refer(other, elements)} #${shortId(other.id)}`;

    if (relation.kind === "inside") return gained ? `now inside ${name}` : `no longer inside ${name}`;
    if (relation.kind === "contains") return gained ? `now contains ${name}` : `no longer contains ${name}`;
    if (relation.kind === "overlaps") return gained ? `now overlaps ${name}` : `no longer overlaps ${name}`;
    if (relation.kind === "aligned") return gained ? `aligned ${relation.detail} with ${name}` : undefined;
    if (relation.kind === "near") return gained ? `now ${relation.detail} from ${name}` : undefined;

    return undefined;
}

// Containment and overlap say more about intent than mere proximity does.
const RELATION_PRIORITY = ["inside", "contains", "overlaps", "aligned", "near"];

function describeRelationChange(before: Element, after: Element, beforeAll: Element[], afterAll: Element[]): string[] {
    const previous = new Map(relationsFor(before, beforeAll).map((relation) => [relationKey(relation), relation]));
    const current = new Map(relationsFor(after, afterAll).map((relation) => [relationKey(relation), relation]));

    const gained = pickRelations(
        [...current.values()].filter((relation) => !previous.has(relationKey(relation))),
        MAX_RELATIONS_PER_ELEMENT,
        true,
    );
    const lost = pickRelations(
        [...previous.values()].filter((relation) => !current.has(relationKey(relation))),
        MAX_RELATIONS_PER_ELEMENT,
        false,
    );

    const texts = [
        ...gained.map((relation) => renderRelation(relation, afterAll, true)),
        ...lost.map((relation) => renderRelation(relation, beforeAll, false)),
    ].filter((text): text is string => text !== undefined);

    return texts.slice(0, MAX_RELATIONS_PER_ELEMENT);
}

function changedFields(before: Element, after: Element): Set<string> {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = new Set<string>();
    for (const field of fields) {
        if (NOISE_FIELDS.has(field)) continue;
        if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changed.add(field);
    }
    return changed;
}

function describeStyle(before: Element, after: Element, changed: Set<string>): string[] {
    const events: string[] = [];

    for (const [field, name] of Object.entries(STYLE_LABELS)) {
        if (!changed.has(field)) continue;
        const from = COLOUR_FIELDS.has(field) ? colourName(before[field]) : String(before[field]);
        const to = COLOUR_FIELDS.has(field) ? colourName(after[field]) : String(after[field]);
        if (from !== to) events.push(`${name} ${from} → ${to}`);
    }

    return events;
}

function describeGeometry(before: Element, after: Element, changed: Set<string>): string[] {
    const events: string[] = [];

    if (changed.has("x") || changed.has("y")) {
        const dx = Math.round((Number(after.x) || 0) - (Number(before.x) || 0));
        const dy = Math.round((Number(after.y) || 0) - (Number(before.y) || 0));
        const distance = Math.round(Math.hypot(dx, dy));
        events.push(`moved ${direction(dx, dy)} ${dx >= 0 ? "+" : ""}${dx},${dy >= 0 ? "+" : ""}${dy} (${distance}px) → ${position(after)}`);
    }

    // Editing text auto-resizes its box, so that resize is an artifact.
    const textChanged = changed.has("text") || changed.has("originalText");
    if (!textChanged && (changed.has("width") || changed.has("height"))) {
        const from = `${Math.round(Number(before.width) || 0)}x${Math.round(Number(before.height) || 0)}`;
        const to = `${Math.round(Number(after.width) || 0)}x${Math.round(Number(after.height) || 0)}`;
        const ratio = area(before) > 0 ? area(after) / area(before) : 0;
        events.push(`resized ${from} → ${to}${ratio ? ` (area ×${ratio.toFixed(2)})` : ""}`);
    }

    return events;
}

function describeStructure(before: Element, after: Element, changed: Set<string>, afterAll: Element[]): string[] {
    const events: string[] = [];

    if (changed.has("groupIds")) {
        const wasGrouped = groupsOf(before).length;
        const isGrouped = groupsOf(after).length;
        if (isGrouped > wasGrouped) {
            const peers = afterAll
                .filter((other) => other.id !== after.id && sharesGroup(after, other))
                .slice(0, 3)
                .map((other) => `${refer(other, afterAll)} #${shortId(other.id)}`);
            events.push(`grouped with ${peers.join(", ") || "(alone)"}`);
        } else {
            events.push("ungrouped");
        }
    }

    if (changed.has("startBinding") || changed.has("endBinding")) {
        const bound = bindings(after);
        const from = afterAll.find((element) => element.id === bound.start);
        const to = afterAll.find((element) => element.id === bound.end);
        const name = (target: Element | undefined) =>
            target ? `${refer(target, afterAll)} #${shortId(target.id)}` : "nothing";
        events.push(`now connects ${name(from)} → ${name(to)}`);
    }

    if (changed.has("points")) events.push("reshaped");
    if (changed.has("containerId")) events.push("re-parented");

    return events;
}

/** Digests of every wording an element has held, to notice a user going back. */
type WordingHistory = Map<string, Map<string, number>>;

function describeChange(
    before: Element,
    after: Element,
    beforeAll: Element[],
    afterAll: Element[],
    history: WordingHistory,
    step: number,
): string | undefined {
    const changed = changedFields(before, after);
    if (changed.size === 0) return undefined;

    const parts: string[] = [];
    const isCaption = captionTarget(after, afterAll) !== undefined;

    if (changed.has("text") || changed.has("originalText")) {
        const from = typeof before.text === "string" ? before.text : "";
        const to = typeof after.text === "string" ? after.text : "";
        const edit = describeEdit(from, to);
        if (edit) parts.push(edit);

        const seen = history.get(after.id);
        const earlier = seen?.get(digest(to));
        if (earlier !== undefined) parts.push(`restored wording from step ${earlier}`);
        if (seen) seen.set(digest(to), step);
    }

    // Captions are dragged, resized and grouped by the shape they name.
    if (!isCaption) {
        parts.push(...describeGeometry(before, after, changed));
        parts.push(...describeStructure(before, after, changed, afterAll));
    }

    parts.push(...describeStyle(before, after, changed));

    if (!isCaption) parts.push(...describeRelationChange(before, after, beforeAll, afterAll));

    if (parts.length === 0) return undefined;

    const subject = isCaption ? `label${quoteLabel(typeof after.text === "string" ? after.text : "")}` : refer(after, afterAll);
    return `~ #${shortId(after.id)} ${subject}: ${parts.join(" · ")}`;
}

function describeTransition(
    before: Snapshot,
    after: Snapshot,
    history: WordingHistory,
    step: number,
): string[] {
    const beforeById = new Map(before.elements.map((element) => [element.id, element]));
    const afterById = new Map(after.elements.map((element) => [element.id, element]));

    const lines: string[] = [];

    for (const [id, element] of afterById) {
        if (beforeById.has(id)) continue;

        // A caption created together with the shape it names is already reported
        // on that shape's line; a caption added to an existing shape is news.
        const names = captionTarget(element, after.elements);
        if (names && !beforeById.has(names.id)) continue;

        lines.push(`+ #${shortId(id)} ${describeElement(element, after.elements)}`);

        const relations = pickRelations(relationsFor(element, after.elements), MAX_RELATIONS_PER_ELEMENT, false)
            .map((relation) => renderRelation(relation, after.elements, true))
            .filter((text): text is string => text !== undefined);

        if (relations.length) lines.push(`      ${relations.join(" · ")}`);

        if (typeof element.text === "string") {
            history.set(id, new Map([[digest(element.text), step]]));
        }
    }

    for (const [id, element] of beforeById) {
        if (afterById.has(id)) continue;
        const named = captionTarget(element, before.elements);
        if (named && !afterById.has(named.id)) continue;
        lines.push(`- #${shortId(id)} ${describeElement(element, before.elements)}`);
    }

    for (const [id, element] of afterById) {
        const previous = beforeById.get(id);
        if (!previous) continue;
        const line = describeChange(previous, element, before.elements, after.elements, history, step);
        if (line) lines.push(line);
    }

    return lines;
}

function formatGap(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
    }
    return `${(seconds / 3600).toFixed(1)}h`;
}

function time(timestamp: number): string {
    return new Date(timestamp).toTimeString().slice(0, 8);
}

/** An anchor for the deltas that follow, so positions mean something. */
function printScene(snapshot: Snapshot, heading: string): void {
    const count = snapshot.elements.length;
    log(`${heading} @ ${time(snapshot.timestamp)} — ${count} element${count === 1 ? "" : "s"}`);

    const byId = new Map(snapshot.elements.map((element) => [element.id, element]));

    for (const element of snapshot.elements) {
        if (isBoundLabel(element, byId)) continue;
        log(`  #${shortId(element.id)} ${describeElement(element, snapshot.elements)}`);
    }

    const structure: string[] = [];
    for (const element of snapshot.elements) {
        const held = snapshot.elements.filter(
            (other) =>
                other.id !== element.id &&
                !sharesGroup(element, other) &&
                contains(box(element), box(other)) &&
                area(element) > area(other),
        );
        if (held.length) {
            structure.push(
                `  ${refer(element, snapshot.elements)} #${shortId(element.id)} contains ` +
                    held.map((other) => `${refer(other, snapshot.elements)} #${shortId(other.id)}`).join(", "),
            );
        }
    }
    if (structure.length) {
        log("  structure:");
        for (const line of structure) log(`  ${line}`);
    }
}

function printTimeline(snapshots: Snapshot[]): void {
    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;

    log(`trajectory of ${first.document} — ${snapshots.length} snapshots`);
    log(`${new Date(first.timestamp).toLocaleString()} → ${new Date(last.timestamp).toLocaleString()}`);
    log(`#id = first 4 chars of an element id · @x,y WxH in canvas pixels`);
    log(`text marked …[+N chars] is elided here, not lost: read it from <timestamp>.${first.document} by element id\n`);

    printScene(first, "SCENE");

    const history: WordingHistory = new Map();
    for (const element of first.elements) {
        if (typeof element.text === "string") history.set(element.id, new Map([[digest(element.text), 0]]));
    }

    for (let i = 1; i < snapshots.length; i++) {
        const before = snapshots[i - 1]!;
        const after = snapshots[i]!;
        const lines = describeTransition(before, after, history, i);

        // A save that changed nothing meaningful is not part of the trajectory.
        if (lines.length === 0) continue;

        const elapsed = after.timestamp - before.timestamp;

        if (elapsed > SESSION_GAP_MS) {
            log(`\n=== away ${formatGap(elapsed)} ===`);
            log("");
            printScene(before, "SCENE on leaving");
        }

        log(`\nstep ${i} [+${formatGap(elapsed)}] ${time(after.timestamp)}`);
        for (const line of lines) log(`  ${line}`);
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

export { describeTransition, printScene, readSnapshots, type Snapshot };
