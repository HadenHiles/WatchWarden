import { prisma } from "@watchwarden/db";
import type { DecisionAction, SuggestionStatus, TitleStatus } from "@watchwarden/types";
import { AuditService } from "./audit.service";

interface DecisionInput {
    suggestionId: string;
    action: DecisionAction;
    reason?: string;
    snoozeDays?: number;
    extendDays?: number;
}

const auditService = new AuditService();

/**
 * Handles all admin decision actions on suggestions.
 * Applies the action, updates the suggestion/title state, and records the audit log.
 */
export class DecisionService {
    async applyDecision(input: DecisionInput) {
        const suggestion = await prisma.suggestion.findUnique({
            where: { id: input.suggestionId },
            include: { title: true },
        });
        if (!suggestion) throw new Error(`Suggestion ${input.suggestionId} not found`);

        // Record the decision first
        await prisma.suggestionDecision.create({
            data: {
                suggestionId: suggestion.id,
                action: input.action,
                reason: input.reason ?? null,
                metadata: {},
            },
        });

        // Derive new states
        const newSuggestionStatus = this.toSuggestionStatus(input.action, suggestion.status as SuggestionStatus);
        const newTitleStatus = this.toTitleStatus(input.action, suggestion.title.status as TitleStatus);
        const titleUpdates: Record<string, unknown> = { status: newTitleStatus };

        switch (input.action) {
            case "PIN":
                titleUpdates.isPinned = true;
                break;
            case "UNPIN":
                titleUpdates.isPinned = false;
                break;
            case "MARK_PERMANENT":
                titleUpdates.lifecyclePolicy = "PERMANENT";
                titleUpdates.isTemporary = false;
                break;
            case "MARK_TEMPORARY":
                titleUpdates.lifecyclePolicy = "TEMPORARY_TRENDING";
                titleUpdates.isTemporary = true;
                break;
            case "EXTEND_RETENTION":
                if (input.extendDays) {
                    const base = suggestion.title.keepUntil ?? new Date();
                    titleUpdates.keepUntil = new Date(base.getTime() + input.extendDays * 86_400_000);
                }
                break;
            case "FORCE_CLEANUP_ELIGIBLE":
                titleUpdates.cleanupEligible = true;
                titleUpdates.cleanupReason = input.reason ?? "Admin forced cleanup eligible";
                break;
            case "SNOOZE":
                await prisma.suggestion.update({
                    where: { id: suggestion.id },
                    data: {
                        status: "SNOOZED",
                        snoozedUntil: new Date(Date.now() + (input.snoozeDays ?? 14) * 86_400_000),
                    },
                });
                break;
        }

        // Update suggestion status
        if (input.action !== "SNOOZE" && newSuggestionStatus !== suggestion.status) {
            await prisma.suggestion.update({
                where: { id: suggestion.id },
                data: { status: newSuggestionStatus as SuggestionStatus },
            });
        }

        // Update title
        await prisma.title.update({
            where: { id: suggestion.titleId },
            data: titleUpdates,
        });

        // Audit log
        await auditService.log({
            action: `SUGGESTION_${input.action}`,
            entityType: "Suggestion",
            entityId: suggestion.id,
            titleId: suggestion.titleId,
            details: { action: input.action, reason: input.reason },
        });

        return {
            suggestionId: suggestion.id,
            titleId: suggestion.titleId,
            action: input.action,
            newTitleStatus,
        };
    }

    private toSuggestionStatus(action: DecisionAction, _current: SuggestionStatus): SuggestionStatus {
        switch (action) {
            case "APPROVE":
            case "PIN":
            case "MARK_PERMANENT":
            case "EXTEND_RETENTION":
                return "APPROVED";
            case "REJECT":
                return "REJECTED";
            case "SNOOZE":
                return "SNOOZED";
            case "UNDO":
                return "PENDING";
            default:
                return _current;
        }
    }

    private toTitleStatus(action: DecisionAction, current: TitleStatus): TitleStatus {
        switch (action) {
            case "APPROVE":
                return "APPROVED";
            case "REJECT":
                return "REJECTED";
            case "SNOOZE":
                return "SNOOZED";
            case "PIN":
                return "PINNED";
            case "UNPIN":
                return current === "PINNED" ? "APPROVED" : current;
            case "FORCE_CLEANUP_ELIGIBLE":
                return "CLEANUP_ELIGIBLE";
            case "UNDO":
                return "SUGGESTED";
            default:
                return current;
        }
    }
}
