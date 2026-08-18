const pkg = await import("./package.json");

console.log(`${pkg.displayName} v${pkg.version}`);