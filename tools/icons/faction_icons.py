#!/usr/bin/env python3
"""Faction emblem proposals as resolution-independent SVG (two sets per faction).

    python3 tools/icons/faction_icons.py        # writes docs/icon-proposals/<faction>_<a|b>.svg and sheet.svg/png

Every icon is drawn on a 256 x 256 viewBox, flat fills only (no filters, gradients or fonts), so it prints, tiles
and scales to any size. `sheet.png` needs `pip install cairosvg`; the SVGs need nothing.
"""
import math
import os
import shutil
import subprocess
import sys

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'icon-proposals')

# faction palettes (src/locations.js FACTIONS colour first, then the livery colours in .claude/skills/blender/style.md)
YEL, YEL_D, CREAM, NAVY, NAVY_D = '#ffd23f', '#d9a514', '#f2ecdc', '#2a3a6b', '#1c284d'
RED, RED_D, SLATE, SLATE_D, SLATE_L, INK = '#ff3b5c', '#b3121f', '#6b6f78', '#3b3f48', '#8a8f99', '#22242c'
ORG, ORG_D, GRN, GRN_D, SAND = '#ff9f1c', '#c4630f', '#6a8f3a', '#46651f', '#fff4e0'
CYAN, CYAN_D, GOLD, DEEP, DEEP_D = '#2ec4ff', '#139fc4', '#ffd23f', '#16385e', '#0d2540'


def f(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def pts(points):
    return ' '.join(f'{f(x)},{f(y)}' for x, y in points)


def poly(points, fill, extra=''):
    return f'<polygon points="{pts(points)}" fill="{fill}" {extra}/>'


def circle(cx, cy, r, fill='none', stroke=None, sw=0, extra=''):
    s = f' stroke="{stroke}" stroke-width="{f(sw)}"' if stroke else ''
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}"{s} {extra}/>'


def star_pts(cx, cy, r_out, r_in, n=5, rot=-math.pi / 2):
    return [(cx + (r_out if i % 2 == 0 else r_in) * math.cos(rot + i * math.pi / n),
             cy + (r_out if i % 2 == 0 else r_in) * math.sin(rot + i * math.pi / n)) for i in range(2 * n)]


def star(cx, cy, r_out, r_in, fill, n=5, rot=-math.pi / 2, extra=''):
    return poly(star_pts(cx, cy, r_out, r_in, n, rot), fill, extra)


def faceted_star(cx, cy, r_out, r_in, light, dark, n=5, rot=-math.pi / 2):
    """Each point folded down its middle: one half light, one dark (reads as a pressed metal star)."""
    p = star_pts(cx, cy, r_out, r_in, n, rot)
    out = []
    for i in range(n):
        tip, left, right = p[2 * i], p[2 * i - 1], p[(2 * i + 1) % (2 * n)]
        out.append(poly([tip, left, (cx, cy)], light))
        out.append(poly([tip, right, (cx, cy)], dark))
    return ''.join(out)


def _norm(a):
    while a > math.pi:
        a -= 2 * math.pi
    while a <= -math.pi:
        a += 2 * math.pi
    return a


def arc_to(cx, cy, r, a_from, a_to, via):
    """SVG 'A' command from angle a_from to a_to (about c) taking the way that passes angle `via`."""
    d_to, d_via = _norm(a_to - a_from), _norm(via - a_from)
    sweep = 1 if (0 < d_via < d_to or (d_to < 0 and not (d_to < d_via < 0))) else 0
    span = (d_to % (2 * math.pi)) if sweep else ((-d_to) % (2 * math.pi))
    large = 1 if span > math.pi else 0
    x, y = cx + r * math.cos(a_to), cy + r * math.sin(a_to)
    return f'A{f(r)} {f(r)} 0 {large} {sweep} {f(x)} {f(y)}'


def crescent(c1, r1, c2, r2, fill):
    """Disc 1 with disc 2 bitten out of it, as two true arcs."""
    (x1, y1), (x2, y2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, r1 * r1 - a * a))
    ux, uy = (x2 - x1) / d, (y2 - y1) / d
    mx, my = x1 + a * ux, y1 + a * uy
    p = (mx - h * uy, my + h * ux)
    q = (mx + h * uy, my - h * ux)
    ang = lambda c, pt: math.atan2(pt[1] - c[1], pt[0] - c[0])
    away = math.atan2(y1 - y2, x1 - x2)   # far side of disc 1 from the bite
    toward = math.atan2(y1 - y2, x1 - x2)
    d_path = (f'M{f(p[0])} {f(p[1])} ' + arc_to(x1, y1, r1, ang(c1, p), ang(c1, q), away) + ' '
              + arc_to(x2, y2, r2, ang(c2, q), ang(c2, p), toward) + ' Z')
    return f'<path d="{d_path}" fill="{fill}"/>'


def ring_dots(cx, cy, r, n, dot, fill, start=-math.pi / 2, span=2 * math.pi, closed=True):
    steps = n if closed else n - 1
    return ''.join(circle(cx + r * math.cos(start + span * i / steps), cy + r * math.sin(start + span * i / steps), dot, fill)
                   for i in range(n))


def polar(cx, cy, r, a):
    return cx + r * math.cos(a), cy + r * math.sin(a)


def arrow_arc(cx, cy, r, a0, a1, sw, fill, head):
    """Thick arc from a0 to a1 (radians, increasing = clockwise on screen) ending in an arrowhead."""
    pre = a1 - head * 0.9 / r          # the shaft stops where the head starts
    x0, y0 = polar(cx, cy, r, a0)
    x1, y1 = polar(cx, cy, r, pre)
    large = 1 if (pre - a0) > math.pi else 0
    shaft = f'<path d="M{f(x0)} {f(y0)} A{f(r)} {f(r)} 0 {large} 1 {f(x1)} {f(y1)}" fill="none" stroke="{fill}" stroke-width="{f(sw)}" stroke-linecap="round"/>'
    tip = polar(cx, cy, r, a1 + head * 0.3 / r)
    base = a1 - head * 0.9 / r
    tx, ty = -math.sin(base), math.cos(base)    # clockwise tangent
    bx, by = polar(cx, cy, r, base)
    nx, ny = math.cos(base), math.sin(base)     # radial
    w = head * 0.75
    return shaft + poly([tip, (bx + nx * w, by + ny * w), (bx - nx * w, by - ny * w)], fill)


def wreath(cx, cy, r, a0, a1, n, leaf_len, leaf_w, fill, fill2):
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        x, y = polar(cx, cy, r, a)
        rot = math.degrees(a) + 90 + (18 if i % 2 else -18)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(leaf_w)}" ry="{f(leaf_len)}" '
                   f'transform="rotate({f(rot)} {f(x)} {f(y)})" fill="{fill if i % 2 else fill2}"/>')
    return ''.join(out)


def svg(body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img">'
            f'<title>{title}</title>{body}</svg>\n')


# ---------------------------------------------------------------------------------------------------- SPACECOM
def spacecom_a():
    """PEACEKEEPER SHIELD: a police badge outline with the proto crescent-and-star, nine stars for nine member states."""
    shield = 'M128 12 L226 38 V118 C226 176 186 218 128 246 C70 218 30 176 30 118 V38 Z'
    inner = 'M128 30 L210 52 V118 C210 166 177 202 128 226 C79 202 46 166 46 118 V52 Z'
    b = f'<path d="{shield}" fill="{YEL}"/><path d="{inner}" fill="{NAVY}"/>'
    b += ''.join(star(*polar(128, 112, 80, -math.pi / 2 + (i - 4) * 0.27), 8.5, 3.4, CREAM) for i in range(9) if i != 4)
    b += star(128, 112 - 80, 10.5, 4.2, YEL)
    b += crescent((118, 126), 52, (140, 110), 44, CREAM)
    b += star(150, 124, 16, 6.4, YEL)
    b += f'<path d="M72 186 L128 164 L184 186 L184 198 L128 176 L72 198 Z" fill="{YEL}"/>'
    b += f'<path d="M92 206 L128 192 L164 206 L164 216 L128 202 L92 216 Z" fill="{YEL}" opacity=".85"/>'
    return svg(b, 'SPACECOM - Peacekeeper Shield')


def spacecom_b():
    """MARSHAL STAR: an eight-point sheriff's star with ball tips, orbit rings crossing behind it, the moon at its heart."""
    b = circle(128, 128, 120, NAVY) + circle(128, 128, 112, 'none', YEL, 4)
    for rot in (-28, 28):
        b += (f'<ellipse cx="128" cy="128" rx="104" ry="36" fill="none" stroke="{CREAM}" stroke-width="3.5" '
              f'transform="rotate({rot} 128 128)" opacity=".9"/>')
    pts8 = star_pts(128, 128, 96, 40, 8, -math.pi / 2)
    b += faceted_star(128, 128, 96, 40, YEL, YEL_D, 8, -math.pi / 2)
    b += ''.join(circle(*polar(128, 128, 98, -math.pi / 2 + i * math.pi / 4), 9.5, YEL) for i in range(8))
    b += circle(128, 128, 29, NAVY) + circle(128, 128, 23, CREAM)
    b += circle(137, 121, 16, NAVY)                      # the bite: a crescent moon
    b += circle(119, 135, 5.5, CYAN)                     # earthlight at its horn
    return svg(b, 'SPACECOM - Marshal Star')


# ---------------------------------------------------------------------------------------------------- VOSTOK
def vostok_a():
    """ECLIPSE STAR: the red star set over a cratered slate moon, nine pips round the rim for Bases 1-9."""
    b = circle(128, 128, 120, INK) + circle(128, 128, 112, SLATE)
    for cx, cy, r in ((66, 80, 22), (192, 66, 14), (198, 180, 24), (60, 190, 14)):
        b += circle(cx, cy, r, SLATE_D) + circle(cx + r * 0.12, cy + r * 0.12, r * 0.8, '#5a5e68')
    b += ring_dots(128, 128, 101, 9, 6.5, RED, start=-math.pi / 2 + math.pi / 9)
    b += star(128, 132, 86, 36, INK, 5, -math.pi / 2, 'transform="translate(5 5)" opacity=".55"')
    b += faceted_star(128, 128, 86, 36, RED, RED_D)
    b += circle(128, 128, 13, INK) + circle(128, 128, 7, RED)
    return svg(b, 'Vostok - Eclipse Star')


def vostok_b():
    """STAR FORT: the plan of a real bastion fort, which is a star; walls, moat, courtyard and a red keep."""
    b = circle(128, 128, 120, INK) + circle(128, 128, 112, SLATE_D)
    b += circle(128, 128, 112, 'none', SLATE, 3)
    b += star(128, 130, 108, 56, SLATE_L, 5, -math.pi / 2)             # the glacis
    b += star(128, 130, 92, 46, RED_D, 5, -math.pi / 2)                # the walls
    b += star(128, 130, 74, 37, RED, 5, -math.pi / 2)                  # rampart top
    b += star(128, 130, 52, 25, INK, 5, -math.pi / 2)                  # parade ground
    b += star(128, 130, 36, 17, RED, 5, -math.pi / 2)                  # the keep
    b += circle(128, 130, 7, INK)
    return svg(b, 'Vostok - Star Fort')


# ---------------------------------------------------------------------------------------------------- MERIDIAN
def meridian_a():
    """EXCHANGE GLOBE: the proto globe with two gold arrows circling it, goods one way and credit the other."""
    b = circle(128, 128, 120, DEEP) + circle(128, 128, 112, 'none', CYAN, 3)
    b += circle(128, 128, 70, CYAN)
    b += f'<clipPath id="g"><circle cx="128" cy="128" r="70"/></clipPath><g clip-path="url(#g)" fill="none" stroke="{DEEP}" stroke-width="5">'
    b += '<line x1="58" y1="128" x2="198" y2="128"/><line x1="64" y1="98" x2="192" y2="98"/><line x1="64" y1="158" x2="192" y2="158"/>'
    b += '<ellipse cx="128" cy="128" rx="30" ry="70"/><line x1="128" y1="58" x2="128" y2="198"/></g>'
    b += circle(128, 128, 70, 'none', SAND, 5)
    b += arrow_arc(128, 128, 94, math.radians(-165), math.radians(-25), 11, GOLD, 24)
    b += arrow_arc(128, 128, 94, math.radians(15), math.radians(155), 11, GOLD, 24)
    return svg(b, 'Meridian - Exchange Globe')


def meridian_b():
    """TICKER M: a hex nut (the container, the bolt, the trading floor) with an M drawn as a rising price chart."""
    hexp = [polar(128, 128, 120, math.radians(30 + 60 * i)) for i in range(6)]
    hexi = [polar(128, 128, 106, math.radians(30 + 60 * i)) for i in range(6)]
    b = poly(hexp, GOLD) + poly(hexi, DEEP)
    line = [(62, 166), (92, 90), (128, 142), (164, 76), (194, 166)]
    area = line + [(194, 180), (62, 180)]
    b += poly(area, CYAN, 'opacity=".22"')
    b += f'<polyline points="{pts(line)}" fill="none" stroke="{CYAN}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>'
    b += ''.join(circle(x, y, 9.5, GOLD, DEEP, 4) for x, y in line[1:4])
    b += f'<line x1="50" y1="186" x2="206" y2="186" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>'
    b += ''.join(f'<line x1="{x}" y1="186" x2="{x}" y2="194" stroke="{GOLD}" stroke-width="4" stroke-linecap="round"/>' for x in range(62, 206, 24))
    return svg(b, 'Meridian - Ticker M')


# ---------------------------------------------------------------------------------------------------- KEPLER
def kepler_a():
    """CAPITOL DOME: the civic dome on its colonnade, in a laurel wreath, on the settlement orange."""
    b = circle(128, 128, 120, ORG) + circle(128, 128, 108, ORG_D)
    b += circle(128, 128, 102, ORG)
    b += wreath(128, 134, 94, math.radians(80), math.radians(-35), 10, 11, 4.5, GRN, GRN_D)
    b += wreath(128, 134, 94, math.radians(100), math.radians(215), 10, 11, 4.5, GRN, GRN_D)
    # dome
    b += f'<path d="M78 118 A50 50 0 0 1 178 118 Z" fill="{SAND}"/>'
    b += f'<path d="M128 68 V118" stroke="{ORG_D}" stroke-width="3"/><path d="M104 74 Q98 96 100 118 M152 74 Q158 96 156 118" fill="none" stroke="{ORG_D}" stroke-width="3"/>'
    b += f'<rect x="120" y="58" width="16" height="12" rx="3" fill="{SAND}"/><path d="M128 40 V58" stroke="{SAND}" stroke-width="4"/>'
    b += star(128, 36, 9, 3.8, SAND)
    b += f'<rect x="72" y="118" width="112" height="9" fill="{SAND}"/>'
    # colonnade
    for x in (80, 100, 120, 140, 160):
        b += f'<rect x="{x}" y="128" width="9" height="40" fill="{SAND}"/>'
    b += f'<rect x="72" y="168" width="112" height="8" fill="{SAND}"/><rect x="64" y="176" width="128" height="8" fill="{SAND}"/><rect x="56" y="184" width="144" height="8" fill="{SAND}"/>'
    return svg(b, 'Kepler - Capitol Dome')


def kepler_b():
    """COUNCIL SEAL: a notary's scalloped seal; a sprout in the cradle of the moon, a dot for each settlement."""
    n = 28
    scallop = [polar(128, 128, 120 if i % 2 == 0 else 110, 2 * math.pi * i / (2 * n)) for i in range(2 * n)]
    b = poly(scallop, ORG) + circle(128, 128, 104, SAND) + circle(128, 128, 98, 'none', ORG, 5)
    b += ring_dots(128, 128, 90, 12, 4.5, ORG)
    b += crescent((128, 150), 50, (128, 126), 45, ORG)               # the moon as a cradle, bowl up
    b += f'<path d="M128 146 V96" stroke="{GRN}" stroke-width="7" stroke-linecap="round"/>'
    b += f'<path d="M128 116 C100 116 84 100 82 80 C106 80 124 94 128 116 Z" fill="{GRN}"/>'
    b += f'<path d="M128 104 C156 104 172 88 174 68 C150 68 132 82 128 104 Z" fill="{GRN_D}"/>'
    return svg(b, 'Kepler - Council Seal')


# ---------------------------------------------------------------------------------------------------- DAEDALUS
VIO, VIO_D, PLUM, PLUM_D = '#c77dff', '#8a45c9', '#2a2540', '#171329'


def eye(cx, cy, w, h, lid, iris, pupil):
    """Almond eye: lid colour, iris disc, slit pupil."""
    a = f'<path d="M{f(cx - w)} {f(cy)} Q{f(cx)} {f(cy - h * 2)} {f(cx + w)} {f(cy)} Q{f(cx)} {f(cy + h * 2)} {f(cx - w)} {f(cy)} Z" fill="{lid}"/>'
    return a + circle(cx, cy, h * 0.9, iris) + f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(h * 0.2)}" ry="{f(h * 0.82)}" fill="{pupil}"/>'


def daedalus_a():
    """WATCHING DELTA: the proto hollow delta and eye, with its corners notched and a lidded eye that never closes."""
    b = circle(128, 128, 120, PLUM_D) + circle(128, 128, 112, 'none', VIO, 4)
    outer = [(128, 26), (226, 196), (30, 196)]
    inner = [(128, 70), (186, 172), (70, 172)]
    b += poly(outer, VIO, 'stroke-linejoin="round"') + poly(inner, PLUM_D)
    b += eye(128, 138, 40, 16, VIO, CREAM, PLUM_D)
    b += ''.join(f'<line x1="{f(128 + 52 * math.cos(a))}" y1="{f(138 + 34 * math.sin(a))}" x2="{f(128 + 64 * math.cos(a))}" y2="{f(138 + 42 * math.sin(a))}" stroke="{VIO}" stroke-width="4" stroke-linecap="round"/>'
                 for a in (math.radians(-60), math.radians(-90), math.radians(-120)))
    return svg(b, 'Daedalus - Watching Delta')


def daedalus_b():
    """UMBRA: the dark side's black disc with a violet corona, one eye open at its heart."""
    b = circle(128, 128, 120, PLUM_D)
    rays = [polar(128, 128, 112 if i % 2 == 0 else 82, -math.pi / 2 + i * math.pi / 16) for i in range(32)]
    b += poly(rays, VIO_D) + poly([polar(128, 128, 96 if i % 2 == 0 else 78, -math.pi / 2 + i * math.pi / 16 + math.pi / 32) for i in range(32)], VIO)
    b += circle(128, 128, 70, PLUM_D) + circle(128, 128, 70, 'none', VIO, 4)
    b += eye(128, 128, 50, 22, VIO, CREAM, PLUM_D)
    return svg(b, 'Daedalus - Umbra')


# ---------------------------------------------------------------------------------------------------- RUSTMOON
RUST, RUST_D, ACID, ACID_D = '#6a5a48', '#463a2d', '#7dff3a', '#3fa81a'


def rustmoon_a():
    """COG AND CROWN OF TEETH: a rusted gear, the skull stencilled on it in acid green."""
    teeth = []
    n = 12
    for i in range(n):
        a = 2 * math.pi * i / n
        for da, r in ((-0.17, 104), (-0.12, 120), (0.12, 120), (0.17, 104)):
            teeth.append(polar(128, 128, r, a + da))
    b = poly(teeth, RUST_D, 'stroke-linejoin="round"') + circle(128, 128, 104, RUST) + circle(128, 128, 90, 'none', RUST_D, 5)
    b += circle(128, 128, 82, PLUM)
    b += circle(128, 112, 44, ACID) + f'<rect x="100" y="140" width="56" height="30" rx="8" fill="{ACID}"/>'
    b += f'<ellipse cx="111" cy="114" rx="11" ry="13" fill="{PLUM}"/><ellipse cx="145" cy="114" rx="11" ry="13" fill="{PLUM}"/>'
    b += poly([(128, 124), (121, 140), (135, 140)], PLUM)
    b += ''.join(f'<line x1="{x}" y1="150" x2="{x}" y2="168" stroke="{PLUM}" stroke-width="4"/>' for x in (114, 128, 142))
    b += f'<path d="M92 184 L164 184" stroke="{ACID}" stroke-width="7" stroke-linecap="round"/>'
    return svg(b, 'Rustmoon - Cog and Teeth')


def rustmoon_b():
    """SALVAGE PLATE: hand-cut scrap, four welded rivets, a torch-cut green bolt across it."""
    plate = [(40, 30), (206, 22), (236, 74), (228, 196), (186, 238), (62, 230), (20, 176), (26, 76)]
    b = poly(plate, RUST_D) + poly([(46, 40), (200, 34), (224, 78), (216, 190), (180, 226), (66, 220), (32, 172), (38, 80)], RUST)
    b += ''.join(circle(x, y, 8, RUST_D) + circle(x - 1.5, y - 1.5, 3.2, '#8c7a63') for x, y in ((66, 64), (190, 58), (194, 198), (62, 192)))
    bolt = [(150, 40), (82, 138), (118, 138), (96, 216), (176, 108), (136, 108), (166, 40)]
    b += poly(bolt, PLUM, 'transform="translate(6 6)"') + poly(bolt, ACID, 'stroke-linejoin="miter"')
    b += poly([(150, 40), (82, 138), (108, 138), (166, 40)], ACID_D, 'opacity=".0"')
    return svg(b, 'Rustmoon - Salvage Plate')


ICONS = {
    ('spacecom', 'a'): spacecom_a, ('spacecom', 'b'): spacecom_b,
    ('vostok', 'a'): vostok_a, ('vostok', 'b'): vostok_b,
    ('daedalus', 'a'): daedalus_a, ('daedalus', 'b'): daedalus_b,
    ('rustmoon', 'a'): rustmoon_a, ('rustmoon', 'b'): rustmoon_b,
    ('meridian', 'a'): meridian_a, ('meridian', 'b'): meridian_b,
    ('kepler', 'a'): kepler_a, ('kepler', 'b'): kepler_b,
}
ORDER = ['kepler', 'vostok', 'meridian', 'spacecom', 'daedalus', 'rustmoon']
NAMES = {('kepler', 'a'): 'Capitol Dome', ('kepler', 'b'): 'Council Seal', ('vostok', 'a'): 'Eclipse Star',
         ('vostok', 'b'): 'Star Fort', ('meridian', 'a'): 'Exchange Globe', ('meridian', 'b'): 'Ticker M',
         ('spacecom', 'a'): 'Peacekeeper Shield', ('spacecom', 'b'): 'Marshal Star',
         ('daedalus', 'a'): 'Watching Delta', ('daedalus', 'b'): 'Umbra', ('rustmoon', 'a'): 'Cog and Teeth', ('rustmoon', 'b'): 'Salvage Plate'}


def inner(markup):
    return markup[markup.index('>') + 1:markup.rindex('</svg>')]


def sheet():
    cell, pad = 300, 20
    w, h = pad + len(ORDER) * cell, pad + 2 * (cell + 130) + 40
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">',
             f'<rect width="{w}" height="{h}" fill="#14102a"/>']
    for r, set_ in enumerate('ab'):
        y0 = pad + r * (cell + 130) + 30
        parts.append(f'<text x="{pad}" y="{y0 - 8}" fill="#9a94b8" font-family="sans-serif" font-size="15" letter-spacing="3">SET {set_.upper()}</text>')
        for c, fac in enumerate(ORDER):
            x0 = pad + c * cell
            icon = ICONS[(fac, set_)]()
            parts.append(f'<g transform="translate({x0 + 20} {y0 + 10})"><svg viewBox="0 0 256 256" width="256" height="256">{inner(icon)}</svg></g>')
            parts.append(f'<text x="{x0 + 148}" y="{y0 + 290}" text-anchor="middle" fill="#f3eee4" font-family="sans-serif" font-size="17" font-weight="bold">{fac.upper()} - {NAMES[(fac, set_)]}</text>')
            # the 64 / 32 / 20 px test strip
            sx = x0 + 52
            for size in (64, 40, 24):
                parts.append(f'<g transform="translate({sx} {y0 + 306})"><svg viewBox="0 0 256 256" width="{size}" height="{size}">{inner(icon)}</svg></g>')
                sx += size + 16
    parts.append('</svg>')
    return ''.join(parts)


def export_inkscape(px=1024):
    """Inkscape renders: <name>.png at px x px and a vector <name>.pdf per icon in export/, plus sheet.png."""
    ex = os.path.join(OUT, 'export')
    os.makedirs(ex, exist_ok=True)
    acts = []
    for (fac, s_) in ICONS:
        src = os.path.join(OUT, f'{fac}_{s_}.svg')
        acts.append(f'file-open:{src};export-type:png;export-width:{px};export-height:{px};export-filename:{os.path.join(ex, f"{fac}_{s_}.png")};export-do;'
                    f'export-type:pdf;export-filename:{os.path.join(ex, f"{fac}_{s_}.pdf")};export-do;file-close')
    acts.append(f'file-open:{os.path.join(OUT, "sheet.svg")};export-type:png;export-dpi:144;export-filename:{os.path.join(OUT, "sheet.png")};export-do;file-close')
    subprocess.run(['inkscape', '--actions=' + ';'.join(acts)], check=True, capture_output=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for (fac, s), fn in ICONS.items():
        with open(os.path.join(OUT, f'{fac}_{s}.svg'), 'w') as fh:
            fh.write(fn())
    with open(os.path.join(OUT, 'sheet.svg'), 'w') as fh:
        fh.write(sheet())
    if shutil.which('inkscape'):
        export_inkscape()
        return
    try:
        import cairosvg
    except ImportError:
        print('cairosvg missing: wrote the SVGs only', file=sys.stderr)
        return
    cairosvg.svg2png(url=os.path.join(OUT, 'sheet.svg'), write_to=os.path.join(OUT, 'sheet.png'), scale=1.5)


if __name__ == '__main__':
    main()
