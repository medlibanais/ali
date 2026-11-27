# Realistic avatar model

`build.py` packs the avatar model, `assets/avatar3d/models/human.bin`, and
`scripts/split-human.mjs` splits it into what the app loads: `models/core.bin`
(body, shapes, eyes, teeth, brows, lashes) and one file per hair, outfit, shoes,
glasses and skin in `assets/avatar3d/parts/`, so a render only loads what the
avatar wears. `human.bin` itself is not committed.
The app never runs this. Run it only to add or remove hair, clothes or shapes.

## Sources (all CC0, no attribution required)

- MakeHuman base mesh, shape targets, skeleton and weights:
  <https://github.com/makehumancommunity/makehuman> (the `makehuman/data` folder).
- MakeHuman system assets pack (`makehuman_system_assets_cc0.zip`): skins, eyes,
  hair, eyebrows, eyelashes, teeth, default clothes and shoes.
- Community asset packs `glasses01`, `pants01`, `shirts01`, `hair01`, `dress01`, `skirts01`, `suits01`, `shoes01` (CC0 editions) from
  <http://www.makehumancommunity.org/content/asset_packs.html>.

Only assets published as CC0 are listed in `catalog.py`. Keep it that way.

## Rebuild

```sh
cd mobile/tools/human
python3 build.py --mh <makehuman checkout> \
  --assets <system assets> <glasses01> <pants01> <shirts01> <hair01> <dress01> <skirts01> <suits01> <shoes01> \
  --out ../../assets/avatar3d/models/human.bin
cd ../.. && node scripts/split-human.mjs   # writes core.bin, parts/, src/avatar/modelParts.ts and modelManifest.ts
npm run build:avatar3d                     # only if avatar3d/*.ts changed
node scripts/avatar-assets.mjs             # what the bytes are (morph targets, meshes, textures)
node scripts/avatar-assets.mjs --check     # the CI size budget (assets/avatar3d/budget.json)
npx jest src/avatar                   # checks the app only asks for what the file holds, first-render budget
```

## Size budget

CI runs `node scripts/avatar-assets.mjs --check`. It fails when a model file
changed without `src/avatar/modelManifest.ts` (run it with `--write`), or
when the viewer, the core, a pack, or all packs together grow past
`assets/avatar3d/budget.json` (the 2026-11-25 sizes plus about 2%). Jest
checks the first full render of the built-in looks and of random looks
against the same file. If a new hair or outfit is meant to add bytes, raise
the number in `budget.json` in the same PR and say why.

Needs Python 3 with `numpy` and `Pillow`. It takes about two minutes.

## What to edit

- `catalog.py`: which hair, brows, lashes, clothes, shoes, glasses and skins go in,
  their ids, texture sizes, and which shape targets are left out.
- `src/avatar/wardrobe.ts`: the same ids with their labels, as the editor shows them.
- `src/avatar/custom.ts`: sliders, presets and expressions, by target name.

## File layout

`u32 headerLength`, a JSON header, then raw buffers. The header lists the base
mesh, skeleton, targets (16-bit deltas with a scale each), fitted meshes
("proxies") with their textures, and skins. `avatar3d/human.ts` reads it.
