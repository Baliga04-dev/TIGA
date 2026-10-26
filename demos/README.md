# Demo shop websites

Four complete websites for made-up Bengaluru shops, to show prospects, published at
https://baliga04-dev.github.io/demos/ (linked from the portfolio):

| Folder | Shop | What a visitor can do |
|---|---|---|
| `malnad-table/` | Restaurant, Malleshwaram | Build an order on a banana leaf, pick a pickup time, book a table, see if it's open now |
| `navilu-boutique/` | Saree shop, Jayanagar | Filter the catalogue, keep up to four sarees aside for a trial, book a blouse fitting |
| `little-banyan/` | Preschool and daycare, HSR Layout | Find a child's class for June 2027 from the birthday, read the day, ask for a visit |
| `sampige-residency/` | Hotel, Basavanagudi | Live prices for any dates (weekend rates, extra bed, GST), request a room |

Every order, booking or enquiry ends in a preview of the WhatsApp message the shop would receive; nothing is
sent. "Get one for your shop" goes to Adithya's WhatsApp (`OWNER_WA` in `src/shared/site.ts`).

## Work on it

```bash
npm ci
npm run dev        # http://localhost:5173/demos/
npm run build      # dist/, built for the /demos/ path
```

Vite multi-page app: React 18, TypeScript, Tailwind 3, Framer Motion, Phosphor icons, fonts from Fontsource.
Each site has `src/<site>/` (App, its own colours and fonts in `site.css`); shared pieces are in `src/shared/`.
Menus, catalogue and room rates are JSON in `public/data/` and load with real loading and error states.

## Photos

Downloaded from Wikimedia Commons with the taste-skill `assets.mjs` into `.originals/` (git-ignored), then
`npm run images` writes WebP files to `public/img/<site>/` and the credit lists to `src/data/credits-*.json`,
which each footer shows. Several are CC BY-SA: an edited version must keep the same licence. They show the
world around a shop and stand in for a real client's own photos.

## Publish

Copy `dist/` to `demos/` in the Baliga04-dev.github.io repo and push (the portfolio lives at its root).
