import { log, warn } from "node:console";
import { join, parse, resolve } from "node:path";
import { copyFile, existsSync, mkdirSync } from "node:fs";

const PKG = await import("../package.json");

function main(args: string[]): void {
    log(`${PKG.displayName} v${PKG.version}`);

    if (args.length !== 1) {
        log("USAGE: bun run src/timeline.ts [path to directory]");
        process.exit(1);
    }

    const targetDirPath: string = args[0] ? args[0] : "";
    const snapshotsDirPath: string = resolve(targetDirPath, ".snapshots");

    log({ targetDirPath, snapshotsDirPath });

    if (!existsSync(snapshotsDirPath)) {
        console.error("[!] ERROR: missing .snapshots directory in target directory");
        process.exit(1);
    }
}

main(process.argv.slice(2));