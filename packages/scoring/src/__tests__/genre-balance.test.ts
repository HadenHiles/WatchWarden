import { describe, expect, it } from "vitest";
import { genreBalanceBoost } from "../genre-balance";

describe("bounded library genre balance", () => {
    it("gently favors underrepresented genres without penalizing popular genres", () => {
        const counts = { Drama: 100, Comedy: 80, Mystery: 10 };
        expect(genreBalanceBoost(["Mystery"], counts)).toBeGreaterThan(genreBalanceBoost(["Drama"], counts));
        expect(genreBalanceBoost(["Drama"], counts)).toBe(1);
        expect(genreBalanceBoost(["Science Fiction"], counts, 99)).toBeLessThanOrEqual(1.2);
    });
    it("is neutral with unknown evidence and averages multi-genre titles", () => {
        expect(genreBalanceBoost([], { Drama: 100 })).toBe(1);
        expect(genreBalanceBoost(["Drama"], {})).toBe(1);
        expect(genreBalanceBoost(["Drama", "Mystery"], { Drama: 100, Mystery: 10 }))
            .toBeLessThan(genreBalanceBoost(["Mystery"], { Drama: 100, Mystery: 10 }));
    });
});