#!/usr/bin/env node
/**
 * After `prisma generate`, the generated client lands in the workspace-root
 * node_modules/.prisma/client.  In a pnpm workspace the runtime actually
 * resolves @prisma/client through the pnpm virtual store, which has its own
 * adjacent .prisma/client directory that shadows the root one.  This script
 * copies the freshly generated client to that virtual-store location so both
 * the TypeScript types and the Prisma runtime engine stay in sync.
 */
const path = require("path");
const { execSync } = require("child_process");

// Dynamically resolve where @prisma/client lives at runtime (pnpm virtual store)
const clientPkg = require.resolve("@prisma/client/package.json");
const pnpmPrismaDir = path.resolve(path.dirname(clientPkg), "../../.prisma/client");
const rootPrismaDir = path.resolve(__dirname, "../../../node_modules/.prisma/client");

console.log("Syncing generated Prisma client to pnpm virtual store…");
console.log("  src:", rootPrismaDir);
console.log("  dst:", pnpmPrismaDir);

execSync(`cp -rf "${rootPrismaDir}/." "${pnpmPrismaDir}"`);
console.log("Done.");
