# Moon-Runner's model style in one place: the numbers behind .claude/skills/blender/style.md (the rules and the reasons
# live there). Builders can import it or exec it like kit.py; style_audit.py checks a built model against it.
#
#   srgb("2a2540")      a hex colour as Blender's linear RGB (what every builder's S() does)
#   PALETTE             the fixed slot colours every model shares (style.md, "The toon look")
#   INK, ink_class()    outline thickness by part size (style.md, "Ink")
#   BUDGET              triangle budgets by model class (style.md, "Detail and triangle budgets")
#   HALO                slot names the game gives a glow halo (src/toon.js HALO_SLOT; the audit checks they match)
#   BLACK               the darkest a slot may be: darks are plum, pure black is the ink
import re


def srgb(h):
    """'rrggbb' (or 0xrrggbb) -> linear RGB tuple, as Blender's colours are"""
    if isinstance(h, int):
        h = f"{h:06x}"
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# fixed toon slots, then glow slots (the factories' *_TOON / *_GLOW maps in src/models.js hold the game's own values)
PALETTE = {
    "dark": "2a2540", "tire": "1d1a29", "steel": "55607a", "metal": "8a87a0", "white": "f3eee4", "concrete": "8d8898",
    "hazard": "ffd23f", "red": "d7263d", "navy": "1b2a4a", "olive": "5b6b3a",
    "glass": "cfefff", "lamp": "fff6a8", "tail": "ff2a4a", "hot": "ff9f1c", "window": "fff6a8",
}

# ink (m) by part class: (min, max); a class is picked by the part's second-longest side (ink_class: a 4 m pole 10 cm
# thick is a small fitting, not a hull)
INK = {
    "hull": (0.06, 0.08),      # main hull, building shell
    "volume": (0.04, 0.06),    # big secondary volumes: turrets, fenders, tyres, cabs, boards
    "fitting": (0.02, 0.03),   # medium fittings: rails, bumpers, crates, seats, columns
    "small": (0.008, 0.015),   # small fittings: lamp cups, mirrors, handles, hub caps
}


def ink_class(breadth):
    return "hull" if breadth >= 2.5 else "volume" if breadth >= 0.8 else "fitting" if breadth >= 0.2 else "small"


# triangles per model (export root), by class
BUDGET = {"vehicle": 11000, "courier": 75000, "ship": 25000, "building": 35000, "setpiece": 40000, "prop": 5000}

# glow slots that get the game's halo (light sources): keep in step with HALO_SLOT in src/toon.js
HALO = re.compile(r"^(?:glow_)?(?:lamps?|bulbs?|beacon\w*|leds?\w?|laser|plasma\w*|ion|redlamp|tail|hot|neon\w*|underglow|element"
                  r"|lane\d|glow(?:cyan|pink|red|amber|green|gold|mint)|red|green)$", re.I)

BLACK = 0.012   # linear: the deepest a slot may go (tire 0x1d1a29 is about 0.012 in its darkest channel)
