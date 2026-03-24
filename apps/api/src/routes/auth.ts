import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import type { ApiEnv } from "@watchwarden/config";
import { AppError } from "../middleware/error";
import { z } from "zod";

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export function authRouter(env: ApiEnv) {
    const router = Router();

    // POST /auth/login
    router.post("/login", async (req: Request, res: Response) => {
        const result = loginSchema.safeParse(req.body);
        if (!result.success) {
            throw new AppError(400, "Username and password required");
        }

        const { username, password } = result.data;

        if (username !== env.ADMIN_USERNAME) {
            throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
        }

        const valid = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
        if (!valid) {
            throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
        }

        req.session.adminAuthenticated = true;
        req.session.userId = username;

        return res.json({ success: true, data: { username } });
    });

    // POST /auth/logout
    router.post("/logout", (req: Request, res: Response) => {
        req.session.destroy(() => {
            res.json({ success: true });
        });
    });

    // GET /auth/me
    router.get("/me", (req: Request, res: Response) => {
        if (!req.session.adminAuthenticated) {
            return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        return res.json({ success: true, data: { username: req.session.userId } });
    });

    return router;
}
