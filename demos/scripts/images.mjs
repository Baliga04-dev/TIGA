// Turns the downloaded originals (.originals/<site>/, git-ignored) into small WebP files in public/img/<site>/
// at two widths, and writes src/data/credits-<site>.json for each site's footer.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const NAMES = {
  restaurant: {
    "banana-leaf-meal": "leaf-meal", "a-top-down-view-of-a-traditional": "meal-top", "commons-73080033": "akki-rotti",
    "neer-dosa-2": "neer-dosa", "masala-dosa-01": "dosa-1", "masala-dosa-and-vada": "dosa-vada", "masala-dosa-2": "dosa-2",
  },
  boutique: {
    "mysore-silk-saree": "silk-border", "embroidery-on-a-saree-01": "peacock-1", "embroidery-on-a-saree-04": "peacock-2", "shelves-from-a-saree-shop-6543977625": "shelves", "textile-shop-in-jaipur": "stacks",
    "kurta-closeup-sandalwood-buttons": "kurta", "handloom-lungi-weaving-at-dohar": "loom-weaver", "handloom-3": "loom",
  },
  preschool: {
    "boxwood-ps-kindergarten-classroom": "classroom", "wooden-toys-with-wheels": "wooden-toys", "crayons-drawing": "crayons",
    "children-s-books-unsplash": "books", "tadoussac-playground-slide": "slide",
    "traditional-montessori-educational-materials": "montessori", "montessori-metal-insets-tray": "insets",
    "asc-leiden-rwanda-2021-016-children-s": "book-shelf", "wooden-toy-castle": "castle",
  },
  salon: {
    "hair-salon-arlington-ma": "salon-floor", "salon-z-perukami-hair-lux-wnetrze": "salon-counter",
    "jasmine-garlands": "jasmine", "back-view-of-a-person-with-long": "jasmine-hair",
    "mehndi-decoration-on-back-side-of-hands": "mehndi", "detail-of-damascus-steel-hair-cutting-shears": "shears",
    "inside-the-hair-salon-5577833869": "basin",
  },
  clinic: {
    "stethoscope-ja-2019": "stethoscopes", "chair-dentist": "dental-chair", "a-waiting-room-at-a-medical-healthcare": "waiting",
    "thulasi2": "tulasi", "blood-pressure-monitoring": "bp-check", "2023-stetoskop": "stethoscope",
  },
  stay: {
    "bed-in-hotel-room-2": "room-courtyard", "bed-in-hotel-room-5": "room-garden", "bed-in-hotel-room-6": "room-twin",
    "wildlfower-boutique-motel-april-2023-sarah-stierch": "room-family", "glass-house-lalbagh": "glasshouse",
    "lalbagh-glass-house-in-nignt": "glasshouse-night", "stage-3-cubbon-park-bangalore-india": "cubbon-bandstand",
    "cubbon-park-w": "cubbon-trees", "masala-dosa-and-vada": "breakfast",
  },
};

for (const [site, names] of Object.entries(NAMES)) {
  const src = path.join(ROOT, ".originals", site);
  const out = path.join(ROOT, "public", "img", site);
  await fs.mkdir(out, { recursive: true });
  const credits = JSON.parse(await fs.readFile(path.join(src, "credits.json"), "utf8"));
  const kept = [];
  for (const c of credits) {
    const base = path.basename(c.file, path.extname(c.file));
    const name = names[base];
    if (!name) continue;
    const input = path.join(src, path.basename(c.file));
    const meta = await sharp(input).metadata();
    for (const width of [1600, 800]) {
      await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 74 })
        .toFile(path.join(out, `${name}-${width}.webp`));
    }
    const w = Math.min(1600, meta.width), h = Math.round((meta.height * w) / meta.width);
    kept.push({ name, width: w, height: h, title: c.title, creator: c.creator, license: c.license,
                licenseUrl: c.licenseUrl, page: c.page });
  }
  await fs.writeFile(path.join(ROOT, "src", "data", `credits-${site}.json`), JSON.stringify(kept, null, 1) + "\n");
  console.log(site, kept.length, "pictures");
}
