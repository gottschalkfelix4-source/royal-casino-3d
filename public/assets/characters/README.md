# Casino human characters

These are game-ready adaptations of **MakeHuman CC0 data assets**, replacing the former procedural primitive-based figures. They are not newly authored human topology or scans of real people.

Source and permission:
- [MakeHuman asset license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md), section C: bundled mesh, targets, textures, clothes and poses are CC0.
- [Official system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html): the selected assets are listed as CC0.
- Full CC0 text: `LICENSE-CC0.txt`. Per-source URLs, sizes and SHA-256 hashes: `SOURCES.json`.
- Original copyright notices name Data Collection AB, Joel Palmius and Jonas Hauquier. Some targets were originally created by Manuel Bastioni, with copyright transferred as stated in their headers.

## Adaptations

Three adult models, 1.70–1.83 m tall, with separate face/hand, suit, shoe, hair, eyebrow and eye surfaces. The suit is fitted to each body's shape, including the female body. Hidden skin beneath clothing is removed. The original base mesh's helper geometry is omitted.

103 skeletal joints per model. Body and finger weights are inherited from the authored rig; unused facial joint weights are combined onto the head. Eye closure is exported as a morph target. No MakeHuman application code is included in the game or build scripts.

Positions and normals are converted to the casino's metre scale and forward direction. UVs are converted for glTF. Original textures are resized where appropriate and encoded as WebP (quality 94): 2K skin, 1K clothing/hair, 512px brows/eyes. No external asset requests occur while playing.

High-detail models have about 36–40k triangles. The distance LOD has about 11–12k triangles and shares the original position, UV, skin-weight and morph buffers. Meshoptimizer changes only the index buffer, preserving the remaining attributes. In each instance both levels share one skeleton and one set of owned materials; geometry and textures stay shared across instances.

## Rebuilding

Install Python dependencies from `scripts/characters/requirements.txt`; JavaScript build dependency `meshoptimizer` is in `devDependencies`.

```sh
python3 scripts/characters/download.py /tmp/royal-human-source
python3 scripts/characters/build.py /tmp/royal-human-source
node scripts/characters/lod.mjs
npm test
```

Run the Python build before running the LOD step again. `models.json` records final sizes, triangle counts and GLB checksums. `npm run test:graphics` enables the local `/__characters.html` pose/portrait preview and the existing game regression harness. These routes are absent from the normal server.
