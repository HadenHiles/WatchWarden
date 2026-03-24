import { prisma } from "@watchwarden/db";

interface LogInput {
    action: string;
    entityType?: string;
    entityId?: string;
    titleId?: string;
    details?: Record<string, unknown>;
    userId?: string;
}

export class AuditService {
    async log(input: LogInput) {
        return prisma.auditLog.create({
            data: {
                action: input.action,
                entityType: input.entityType ?? null,
                entityId: input.entityId ?? null,
                titleId: input.titleId ?? null,
                details: (input.details as object) ?? null,
                userId: input.userId ?? null,
            },
        });
    }
}
