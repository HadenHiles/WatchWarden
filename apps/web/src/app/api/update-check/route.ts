import { NextResponse } from "next/server";

// Docker Hub public API endpoint for listing tags.
// We request the most-recently-pushed tags (ordering=last_updated) and pick
// the highest valid semver tag from the first page.
const DOCKER_IMAGE = process.env.DOCKER_UPDATE_IMAGE ?? "hadenhiles/watchwarden";
const DOCKER_TAGS_URL = `https://hub.docker.com/v2/repositories/${DOCKER_IMAGE}/tags?page_size=25&ordering=last_updated`;

// Very thin semver parser — only handles MAJOR.MINOR.PATCH (optional "v" prefix).
function parseSemver(tag: string): [number, number, number] | null {
    const m = tag.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return null;
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function semverGt(a: [number, number, number], b: [number, number, number]): boolean {
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

export async function GET() {
    const currentRaw = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
    const current = parseSemver(currentRaw);
    if (!current) {
        return NextResponse.json({ updateAvailable: false, currentVersion: currentRaw, latestVersion: null });
    }

    try {
        const res = await fetch(DOCKER_TAGS_URL, {
            headers: { Accept: "application/json" },
            // Revalidate at most once every hour — no need to hammer Docker Hub.
            next: { revalidate: 3600 },
        });

        if (!res.ok) {
            return NextResponse.json({ updateAvailable: false, currentVersion: currentRaw, latestVersion: null });
        }

        const json = await res.json();
        const tags: Array<{ name: string }> = json.results ?? [];

        let latest: [number, number, number] | null = null;
        let latestTag = "";

        for (const { name } of tags) {
            const parsed = parseSemver(name);
            if (!parsed) continue;
            if (!latest || semverGt(parsed, latest)) {
                latest = parsed;
                latestTag = name.replace(/^v/, "");
            }
        }

        if (!latest) {
            return NextResponse.json({ updateAvailable: false, currentVersion: currentRaw, latestVersion: null });
        }

        return NextResponse.json({
            updateAvailable: semverGt(latest, current),
            currentVersion: currentRaw,
            latestVersion: latestTag,
        });
    } catch {
        return NextResponse.json({ updateAvailable: false, currentVersion: currentRaw, latestVersion: null });
    }
}
