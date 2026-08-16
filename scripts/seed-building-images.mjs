// Fills the `building-images` Storage bucket and `building_images` rows from
// the Wikimedia Commons manifest.
//
// Building photos are reference data, but the files are not in git — a reset
// leaves the table empty. Reviews inherit the primary photo (REV-12); this is
// how that catalog gets onto a stack.
//
//   npm run db:images
//
// Safe to re-run: objects are upserted and rows merge on (building_id,
// storage_path). Buildings with no Commons match are not in the manifest and
// stay image_path = null — that is the correct empty state, not a gap to fill
// with a photo of a different building.
//
// Downloads the 1200px Commons derivative rather than the original, so there
// is no local image library and no 15 MB JPEG in Storage. Attribution and
// license come from the Commons API at seed time, not from a hand-copied field
// that would go stale.
//
// Deliberately NOT guarded to localhost. Seeding a hosted project is a
// legitimate run; point .env at it and go. It prints the host and the row
// count before writing anything so you can see which it is.

import { readFileSync } from "node:fs";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "SpotlyBuildingImages/1.0 (campus study-spot app; building photo seed)";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const API = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!API) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL in .env");
if (!SERVICE_ROLE) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");

const restHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

const json = async (res) => {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
};

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** `think[box]` → `thinkbox.jpg`. short_name is what the picker already uses. */
function storagePath(shortName, buildingName) {
  const raw = shortName || buildingName;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}.jpg`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listBuildings() {
  const res = await fetch(`${API}/rest/v1/buildings?select=id,name,short_name`, {
    headers: restHeaders,
  });
  return json(res);
}

async function existingPrimaryPaths() {
  const res = await fetch(
    `${API}/rest/v1/building_images?select=building_id,storage_path&is_primary=eq.true`,
    { headers: restHeaders },
  );
  const rows = await json(res);
  return new Map(rows.map((r) => [r.building_id, r.storage_path]));
}

/**
 * 1200px derivative plus the license fields the table stores.
 * Commons requires a descriptive User-Agent; a bare fetch is rate-limited.
 */
async function commonsFile(filename) {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1200",
    format: "json",
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Commons ${res.status} for ${filename}`);
  const data = await res.json();
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`Commons has no imageinfo for ${filename}`);

  const meta = info.extmetadata ?? {};
  return {
    downloadUrl: info.thumburl || info.url,
    sourceUrl: info.descriptionurl,
    license: stripHtml(meta.LicenseShortName?.value ?? meta.License?.value ?? ""),
    attribution: stripHtml(meta.Artist?.value ?? meta.Credit?.value ?? ""),
  };
}

async function downloadImage(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadObject(path, bytes) {
  const res = await fetch(`${API}/storage/v1/object/building-images/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`storage ${res.status} ${path}: ${body}`);
  }
}

async function upsertRow(row) {
  const res = await fetch(
    `${API}/rest/v1/building_images?on_conflict=building_id,storage_path`,
    {
      method: "POST",
      headers: {
        ...restHeaders,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upsert ${res.status}: ${body}`);
  }
}

const manifest = JSON.parse(
  readFileSync(new URL("./building-images.manifest.json", import.meta.url), "utf8"),
);

const buildings = await listBuildings();
const byName = new Map(buildings.map((b) => [b.name, b]));
const already = await existingPrimaryPaths();

console.log(`Seeding building images on ${new URL(API).host}`);
console.log(`${Object.keys(manifest).length} in the manifest, ${buildings.length} buildings in the table`);

let uploaded = 0;
let skipped = 0;

for (const [name, commonsFileName] of Object.entries(manifest)) {
  const building = byName.get(name);
  if (!building) {
    console.warn(`  skip (no building row): ${name}`);
    skipped += 1;
    continue;
  }

  if (already.has(building.id)) {
    console.log(`  ${name} already seeded (${already.get(building.id)})`);
    skipped += 1;
    continue;
  }

  const path = storagePath(building.short_name, building.name);
  try {
    // Commons 429s if we fire every request back-to-back.
    await sleep(3000);
    const file = await commonsFile(commonsFileName);
    const bytes = await downloadImage(file.downloadUrl);
    await uploadObject(path, bytes);
    await upsertRow({
      building_id: building.id,
      storage_path: path,
      is_primary: true,
      source_url: file.sourceUrl,
      license: file.license || null,
      attribution: file.attribution || null,
    });
    console.log(`  ${name} → ${path} (${file.license || "unknown license"})`);
    uploaded += 1;
  } catch (cause) {
    console.warn(`  fail ${name}: ${cause.message}`);
    skipped += 1;
  }
}

console.log(`done. ${uploaded} uploaded, ${skipped} skipped.`);
