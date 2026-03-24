import fs from "fs/promises";
import path from "path";
import { prisma } from "@watchwarden/db";
import { createLogger } from "@watchwarden/config";
import type { KometaExportFile, KometaExportItem } from "@watchwarden/types";
import type { Title } from "@prisma/client";

const logger = createLogger("export-job");

const EXPORT_TYPES = [
    { type: "active_trending_movies", mediaType: "MOVIE" as const, status: "ACTIVE_TRENDING" },
    { type: "active_trending_shows", mediaType: "SHOW" as const, status: "ACTIVE_TRENDING" },
    { type: "cleanup_eligible_movies", mediaType: "MOVIE" as const, cleanupEligible: true },
    { type: "cleanup_eligible_shows", mediaType: "SHOW" as const, cleanupEligible: true },
    { type: "pinned_movies", mediaType: "MOVIE" as const, isPinned: true },
    { type: "pinned_shows", mediaType: "SHOW" as const, isPinned: true },
    { type: "approved_movies", mediaType: "MOVIE" as const, status: "APPROVED" },
    { type: "approved_shows", mediaType: "SHOW" as const, status: "APPROVED" },
];

function toExportItem(t: Title): KometaExportItem {
    return {
        tmdbId: t.tmdbId,
        tvdbId: t.tvdbId,
        imdbId: t.imdbId,
        title: t.title,
        year: t.year,
        mediaType: t.mediaType,
        lifecyclePolicy: t.lifecyclePolicy,
        status: t.status,
        keepUntil: t.keepUntil?.toISOString() ?? null,
        cleanupEligible: t.cleanupEligible,
        isPinned: t.isPinned,
    };
}

export async function exportJob(): Promise<void> {
    const outputDir = process.env.EXPORT_OUTPUT_DIR ?? "./exports";
    await fs.mkdir(outputDir, { recursive: true });

    logger.info("Starting Kometa export generation");

    let totalItems = 0;
    let exportCount = 0;

    for (const spec of EXPORT_TYPES) {
        try {
            const where = {
                mediaType: spec.mediaType,
                ...(spec.status ? { status: spec.status as never } : {}),
                ...(spec.cleanupEligible !== undefined ? { cleanupEligible: spec.cleanupEligible } : {}),
                ...(spec.isPinned !== undefined ? { isPinned: spec.isPinned } : {}),
            };

            const titles = await prisma.title.findMany({
                where,
                orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
            });

            const items: KometaExportItem[] = titles.map(toExportItem);

            const exportFile: KometaExportFile = {
                exportType: spec.type,
                generatedAt: new Date().toISOString(),
                itemCount: items.length,
                items,
            };

            const filePath = path.join(outputDir, `${spec.type}.json`);
            await fs.writeFile(filePath, JSON.stringify(exportFile, null, 2), "utf8");

            await prisma.publishedExport.create({
                data: {
                    exportType: spec.type,
                    filePath,
                    itemCount: items.length,
                    metadata: { generatedAt: new Date().toISOString() },
                },
            });

            logger.info("Export written", { type: spec.type, itemCount: items.length });
            totalItems += items.length;
            exportCount++;
        } catch (err) {
            logger.error("Export failed", { type: spec.type, error: String(err) });
        }
    }

    logger.info("Export job complete", { exports: exportCount, totalItems });
}
