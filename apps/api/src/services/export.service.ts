import fs from "fs/promises";
import path from "path";
import { prisma } from "@watchwarden/db";
import { createLogger } from "@watchwarden/config";
import type { KometaExportFile, KometaExportItem } from "@watchwarden/types";
import type { Title } from "@prisma/client";

const logger = createLogger("export-service");

const EXPORT_TYPES = [
    { type: "active_trending_movies", mediaType: "MOVIE", status: "ACTIVE_TRENDING" },
    { type: "active_trending_shows", mediaType: "SHOW", status: "ACTIVE_TRENDING" },
    { type: "cleanup_eligible_movies", mediaType: "MOVIE", cleanupEligible: true },
    { type: "cleanup_eligible_shows", mediaType: "SHOW", cleanupEligible: true },
    { type: "pinned_movies", mediaType: "MOVIE", isPinned: true },
    { type: "pinned_shows", mediaType: "SHOW", isPinned: true },
    { type: "approved_movies", mediaType: "MOVIE", status: "APPROVED" },
    { type: "approved_shows", mediaType: "SHOW", status: "APPROVED" },
] as const;

export class ExportService {
    private get outputDir(): string {
        return process.env.EXPORT_OUTPUT_DIR ?? "./exports";
    }

    async generateAllExports(): Promise<{ type: string; itemCount: number; filePath: string }[]> {
        await fs.mkdir(this.outputDir, { recursive: true });
        const results: { type: string; itemCount: number; filePath: string }[] = [];

        for (const spec of EXPORT_TYPES) {
            try {
                const result = await this.generateExport(spec);
                results.push(result);
            } catch (err) {
                logger.error("Export generation failed", { type: spec.type, error: String(err) });
            }
        }

        return results;
    }

    private async generateExport(spec: {
        type: string;
        mediaType: "MOVIE" | "SHOW";
        status?: string;
        cleanupEligible?: boolean;
        isPinned?: boolean;
    }) {
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

        const items: KometaExportItem[] = titles.map((t) => this.toExportItem(t));

        const exportFile: KometaExportFile = {
            exportType: spec.type,
            generatedAt: new Date().toISOString(),
            itemCount: items.length,
            items,
        };

        const filename = `${spec.type}.json`;
        const filePath = path.join(this.outputDir, filename);

        await fs.writeFile(filePath, JSON.stringify(exportFile, null, 2), "utf8");

        // Record in DB
        await prisma.publishedExport.create({
            data: {
                exportType: spec.type,
                filePath,
                itemCount: items.length,
                metadata: { generatedAt: new Date().toISOString() },
            },
        });

        logger.info("Export generated", { type: spec.type, itemCount: items.length, filePath });
        return { type: spec.type, itemCount: items.length, filePath };
    }

    private toExportItem(t: Title): KometaExportItem {
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
}
