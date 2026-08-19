import { log, warn } from "node:console";
import { join, parse, resolve } from "node:path";
import { copyFile, existsSync, mkdirSync } from "node:fs";
import chokidar from "chokidar";

const PKG = await import("../package.json");

function isTargetExtension(path: string): boolean {
    return path.endsWith(".excalidraw");
}

function copy(src: string, dest: string): void {
    copyFile(src, dest, function (err) {
        if (err) {
        warn("[!] Failed to copy file", { error: err?.message, src, dest });
        } else {
            log("[·] Copied file", { src, dest });
        }
    });
}

function main(args: string[]): void {
    log(`${PKG.displayName} v${PKG.version}`);

    if (args.length !== 1) {
        log("USAGE: cai [path to directory]");
        process.exit(1);
    }

    const targetDirPath: string = args[0] ? args[0] : "";
    const snapshotsDirPath: string = resolve(targetDirPath, ".snapshots");

    log({ targetDirPath, snapshotsDirPath });

    if (!existsSync(snapshotsDirPath)) {
        mkdirSync(snapshotsDirPath);
        log("Created .snapshots directory in " + targetDirPath);
    }

    chokidar.watch(targetDirPath).on("change", (path, stats) => {
        if (isTargetExtension(path)) {
            log("File changed", { path, size: stats ? stats.size + " bytes" : "N/A" });
            const { name, ext } = parse(path);
            copy(path, join(snapshotsDirPath, Date.now() + "." + name + ext));
        }
    });
}

main(process.argv.slice(2));