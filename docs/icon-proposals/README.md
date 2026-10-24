# Faction emblem proposals

Two proposed emblems for each playable faction (Kepler, Vostok, Meridian, SPACECOM), drawn as flat SVG on a
256 x 256 viewBox: vector shapes only (no gradients, filters or fonts), so they scale to any size. `sheet.png` shows
all eight with a 64 / 40 / 24 px strip under each. Regenerate with `python3 tools/icons/faction_icons.py`
(`pip install cairosvg` for the PNG; the SVGs need nothing).

The proto-icons they replace are the `emblem()` roundels in `tools/blender/decals.py` (Vostok star, SPACECOM
crescent and star, Kepler orbit, Meridian globe, Daedalus delta and eye). Colours are the faction colour from
`src/locations.js` plus its livery from `.claude/skills/blender/style.md`.

| Faction | Set A | Set B |
| --- | --- | --- |
| Kepler (civil government) | **Capitol Dome**: the civic dome and colonnade in a laurel wreath | **Council Seal**: a notary's scalloped seal, a sprout in the moon's cradle |
| Vostok (the red army, not Russia) | **Eclipse Star**: a faceted red star over a cratered slate moon, nine pips for Bases 1-9 | **Star Fort**: the plan of a bastion fort, which is a star; glacis, walls, parade ground, keep |
| Meridian (trade) | **Exchange Globe**: the proto globe ringed by two gold arrows, goods one way and credit the other | **Ticker M**: a hex nut (container, bolt, trading floor) round an M drawn as a rising price chart |
| SPACECOM (international police) | **Peacekeeper Shield**: a badge with the proto crescent and star, nine stars for the member states | **Marshal Star**: an eight-point sheriff's star with ball tips, orbit rings crossing behind, the moon at its heart |
