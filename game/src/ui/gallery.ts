export interface GalleryEntry {
  slug: string;
  repo: string;
  head: string;
  language: string;
  floors: number;
  rooms: number;
  enemies: number;
  boss: string;
  blurb?: string;
}

export async function loadGallery(): Promise<GalleryEntry[]> {
  try {
    const res = await fetch("./dungeons/index.json", { cache: "no-cache" });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter(
      (d): d is GalleryEntry =>
        typeof d === "object" && d !== null && typeof d.slug === "string" && /^[a-z0-9._-]{1,60}$/.test(d.slug),
    );
  } catch {
    return [];
  }
}

export async function loadGalleryDungeon(slug: string): Promise<string | null> {
  if (!/^[a-z0-9._-]{1,60}$/.test(slug)) return null;
  try {
    const res = await fetch(`./dungeons/${slug}.json`);
    if (!res.ok) return null;
    const text = await res.text();
    // Static hosts often answer a missing file with the index page.
    return text.trimStart().startsWith("{") ? text : null;
  } catch {
    return null;
  }
}
