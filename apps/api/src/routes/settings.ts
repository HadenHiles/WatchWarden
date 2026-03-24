import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { validateBody } from "../middleware/validation";

export const settingsRouter = Router();

// GET /settings — returns all settings grouped by category
settingsRouter.get("/", async (_req, res) => {
    const settings = await prisma.appSetting.findMany({ orderBy: { category: "asc" } });
    const grouped = settings.reduce<Record<string, unknown>>((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {});
    res.json({ success: true, data: grouped });
});

// GET /settings/:key
settingsRouter.get("/:key", async (req, res) => {
    const setting = await prisma.appSetting.findUnique({ where: { key: req.params.key } });
    if (!setting) return res.status(404).json({ success: false, error: "Setting not found" });
    return res.json({ success: true, data: setting });
});

const upsertSettingSchema = z.object({
    value: z.unknown(),
    category: z.string().optional(),
});

// PUT /settings/:key — upsert a single setting
settingsRouter.put("/:key", validateBody(upsertSettingSchema), async (req, res) => {
    const { value, category } = req.body as { value: unknown; category?: string };
    const setting = await prisma.appSetting.upsert({
        where: { key: req.params.key },
        update: { value: value as object, ...(category ? { category } : {}) },
        create: {
            key: req.params.key,
            value: value as object,
            category: category ?? "general",
        },
    });
    res.json({ success: true, data: setting });
});

const batchUpdateSchema = z.record(z.unknown());

// PATCH /settings — batch update multiple settings
settingsRouter.patch("/", validateBody(batchUpdateSchema), async (req, res) => {
    const updates = req.body as Record<string, unknown>;
    await prisma.$transaction(
        Object.entries(updates).map(([key, value]) =>
            prisma.appSetting.upsert({
                where: { key },
                update: { value: value as object },
                create: { key, value: value as object, category: "general" },
            })
        )
    );
    res.json({ success: true });
});
