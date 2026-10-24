# The credit sign (₵, U+20B5) for the game's two pixel faces, neither of which has one: each font's own C with a vertical bar through it, on
# that font's pixel grid, saved as a one-glyph font the game layers under the face (src/fonts.js: "Display Credit", "Body Credit").
#
#   pip install fonttools brotli
#   python3 tools/make-credit-glyph.py        -> src/assets/fonts/credit-display.woff2, credit-body.woff2
import os
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.subset import Subsetter, Options

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FS = os.path.join(REPO, "node_modules", "@fontsource")
OUT = os.path.join(REPO, "src", "assets", "fonts")
#            source font                                          out                    bar: x0, x1, y0, y1 (font units, on its pixel grid)
FACES = [("press-start-2p/files/press-start-2p-latin-400-normal.woff", "credit-display.woff2", (375, 500, 0, 1125)),     # (8 px grid of 125)
         ("jersey-15/files/jersey-15-latin-400-normal.woff", "credit-body.woff2", (250, 350, -100, 850))]                  # (50-unit pixels)


def area(contour):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(contour, contour[1:] + contour[:1])) / 2


os.makedirs(OUT, exist_ok=True)
for src, out, (x0, x1, y0, y1) in FACES:
    font = TTFont(os.path.join(FS, src))
    gs = font.getGlyphSet()
    c = font.getBestCmap()[ord("C")]
    rec = RecordingPen()
    gs[c].draw(rec)
    # the C's outline, contour by contour, and which way its outer contour winds: the bar winds the same way, so where they overlap
    # they fill as one (nonzero winding)
    contours, cur = [], []
    for op, args in rec.value:
        if op == "moveTo":
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "closePath":
            contours.append(cur)
        elif op not in ("endPath",):
            raise RuntimeError(f"{src}: the C has curves ({op}); this expects a pixel font")
    outer = max(contours, key=lambda k: abs(area(k)))
    bar = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if (area(bar) > 0) != (area(outer) > 0):
        bar.reverse()
    pen = TTGlyphPen(None)
    for k in contours + [bar]:
        pen.moveTo(k[0])
        for p in k[1:]:
            pen.lineTo(p)
        pen.closePath()
    font["glyf"][c] = pen.glyph()                        # (the C itself is redrawn as ₵: the subset below keeps only the ₵)
    for t in font["cmap"].tables:
        if t.isUnicode():
            t.cmap[0x20B5] = c
    opts = Options()
    opts.flavor = "woff2"
    opts.layout_features = []
    sub = Subsetter(opts)
    sub.populate(unicodes=[0x20B5])
    sub.subset(font)
    font.flavor = "woff2"
    font.save(os.path.join(OUT, out))
    print(out, os.path.getsize(os.path.join(OUT, out)), "bytes")
