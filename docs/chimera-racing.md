# Chimera racing: how it works

The numbers behind Chimera Downs. The code: `src/chimeragenes.js` (splicing), `src/chimerastats.js` (stats, careers, training, the race
model), `src/chimeraskills.js` (skills), `src/race.js` (the course, the card, the live race). `tools/race-sim.mjs` runs the model
headless to check the balance (the figures at the end are from it).

## Splicing

Two or more **different** kinds of creature in the reactor make a chimera (two of one kind and nothing else come back out of the reactor;
one kind with materials makes a Mutant). Body, legs and head are each drawn at random from the parents (the order they went in counts for
nothing), and with two or more kinds the three parts always come from at least two of them. An extra head: 15% + 12% per distinct kind.
Size: 0.75 to 1.45 (drawn at 0.95 of that: `CHIMERA_DRAWN` in chimeragenes.js).

## Stats

Each part brings a line of four numbers (`LEGS`, `BODY`, `HEAD_WIT` in `chimerastats.js`). The base stats are a weighted blend, with no
randomness:

```
s = size - 1.1                      (-0.35 .. +0.35)
SPEED   = 0.66 Legs.spd + 0.30 Body.spd + 2   - 30 s
POWER   = 0.60 Legs.pow + 0.35 Body.pow + 2.5 + 20 s
STAMINA = 0.45 Legs.sta + 0.50 Body.sta + 2.5 + 26 s
WIT     = 0.60 HeadWit  + 0.20 Legs.wit + 0.20 Body.wit
extra head: WIT += (HeadWit(extra) - 40) x 0.22;  mutations add flat amounts (turbo +12 POW +4 SPD -4 STA, ...)
```

A stat is its base plus what training added, capped at 100. **Grade** from the total: S 260+, A 244+, B 220+, else C.

**Growth** (rolled at birth): one stat (60%) or two (40%) train 5 to 15% faster. **Running style** (rolled at birth, leaning on the
stats: a punchy, short-winded build leans Front Runner, a deep tank leans Late Surger):

| Style | Cruises at (opening, middle, late; of top speed) | Final sprint from | Kicks to | Keeps to |
|---|---|---|---|---|
| Front Runner | 0.89, 0.87, 0.91 | 72% of the race | 1.03 x top | the lead |
| Pace Chaser | 0.87, 0.875, 0.93 | 62% (sprints) to 68% (a mile on) | 1.06 x top | 2nd to 3rd |
| Late Surger | 0.84, 0.865, 0.94 | 50% to 63% | 1.11 x top | the back half |

In short races the styles' paces bunch together (their spread scales with distance / 2400, from 0.4 to 1.2).

## The race

Six runners break from the gate in their stalls (3 m apart) and head for the inner rail. Each step:

- **Top speed** = 33.5 + 0.075 x SPEED m/s, times the going (FAST 1.05, DUSTY 1, HEAVY 0.93, LOW-G 1.02).
- **Acceleration** = 2 + 0.12 x POWER m/s², 15% more while pushing. **Across the track** at 0.6 + 0.03 x POWER m/s.
- **Stamina** (a tank of 1) drains at `k x (v / top)^4` per second, so cruising at 0.88 costs 0.6 of flat out.
  `k = 0.012 + 0.00022 x (100 - STAMINA)`, scaled per race so an average runner would use 0.7 of its tank in a sprint and up to 1.15 in a
  marathon. Pushing costs about 1.5x, a pass 1.4x (2.2x if it fumbles), Rushed 1.6x; HEAVY going 1.3x; **drafting** behind another
  runner 0.8x.
- **Pace:** it cruises at its style's pace, keeps its place in the pack (behind its band it pushes to 0.98 of top if the tank can spare it;
  ahead of it, it eases off), and once its final sprint starts it runs the fastest pace its tank (as its wit judges it: a dim runner's
  estimate is off by up to 15%) will hold to the line, up to its style's kick. Short of stamina it eases off (to no less than 0.8); with an
  empty tank it falls to 0.74 of top.
- **Blocking and passing:** a runner close behind another in its line is held to that runner's speed. It passes if there is room to one
  side (inside first), its pace beats the blocker's by 0.35 m/s (**its current speed, not its SPEED stat**: a slower chimera can pass a
  faster one that is cruising, tired or holding back), and it gets across and by within 4.5 s (POWER). A WIT check when the pass starts
  (35% + 0.55 x wit) decides whether it costs 1.4x stamina or 2.2x (and maybe a Spot Struggle). A front runner being passed pushes back.
- **Bends:** the inside line is shorter: progress x (55 / radius)^0.35.
- **The outer strip:** runners go no wider than 15 m out from the inner rail (the outer stalls start wider and come in); the starting gate
  is towed onto the outer 4 m once the field has gone.

**WIT's three bad moments:** Late Start (one roll at the gate, 30% - 0.28% per wit point: a 0.3 to 1 s late break); Spot Struggle (a
position check every 1.5 s while another runner is close: 12% x (1 - wit/100) to hesitate for 1.2 s at 0.9 pace, drifting wide); Rushed
(at most once, early: about 20% - 0.17% per wit point + 1.2% per chaos point; pushes at 1.08x cruise, 1.6x drain, no skills, a wit check
every 3 s to calm down, 9 s at most). LOW-G going raises the chances by 45%, FAST lowers them by 15%.

## Skills

A triggered skill gets a wit roll per chance (15% + 0.75% per wit point, at most 90%) and fires once a race; nothing fires while Rushed.

| Skill | When | Effect |
|---|---|---|
| Sprinter's Instinct | passive, sprints (450-850 m) | +3% top speed, +10% acceleration |
| Miler's Rhythm | passive, miles (1000-1800 m) | +2% top speed, 8% less stamina |
| Stakes Savvy | passive, medium (2000-2800 m) | 12% less stamina, +3% speed in the last third |
| Marathon Heart | passive, long (3000-3600 m) | 18% less stamina, fades to 0.82 (not 0.74) on an empty tank |
| Gate Burst | the start | no Late Start, +40% acceleration for 3 s |
| Rail Hugger | each bend until it fires | dives for the rail, +5% speed for 5 s |
| Slipstream | each pass until it fires | the pass needs no wit check and costs no extra stamina, +4% speed |
| Second Wind | halfway | +20% stamina |
| Home Stretch | into the final straight | +8% speed, +25% acceleration for 5 s |
| Chimera Soul (rare) | each second from 80 to 90% of the race | +15% speed, +60% acceleration to the line (each roll at 0.35 x the chance) |

Skill speed raises the ceiling without costing stamina. **Learning:** a win teaches one, from the race's pool (its distance skill weighs
most; sprints lean to Gate Burst, long races to Second Wind, races with more bends to Rail Hugger): EASY 30%, MEDIUM 45% (Chimera Soul
3%), HARD 60% (8%), a tournament 100% (15%). A skill it knows already is re-rolled among the ones it doesn't.

## The card, careers and training

Three sections, one race each at a time: **EASY** (grades C and B only; rivals' totals 196-226, no skills), **MEDIUM** (up to A; 228-258,
0-1 skills), **HARD** (anyone; 258-296, 1-3 skills). Rivals are fresh splices (two kinds at least), trained up to their total. No odds:
the board shows each rival's grade and skill count, and the scouting screen before you enter shows every runner's full card. A win pays the
section's flat multiple of a bet (2.5x, 3.5x, 5x; tournaments 4x to 6x).

**A career is three seasons**, each three races and then that season's tournament: the Regolith Guineas (1600 m), the Lunar Derby
(2400 m), the Dark Side St. Leger (3200 m). The tournament ends the season, win or lose; after the third the chimera **retires** (it stays
in the pen with a RETIRED tag and can be sold to the Lunar Stud Farm for its record: 150 + 2 x stat total + 300 a win + 90 a place
+ 1500 a tournament + 12,000 for the Triple Crown). Winning all three tournaments is the **Triple Crown**: a crown on its card, its name in
the Hall of Fame (at the race window).

**Training:** every race banks one session, spent at the Training Yard (the trainer in the stable lane). Four drills: Sprints (SPD, a
little POW), Hill Pulls (POW, a little STA), Long Laps (STA, a little SPD), Maze Run (WIT, a little POW). +4 to 7 on the main stat and +1
to 2 on the side one, times (1 + growth), halved once a stat is past 80. Twelve sessions add about 85 to the total: about two grades.

## Balance (tools/race-sim.mjs, 1500 races of six per distance)

How often the field's best in each stat wins (fair would be 16.7%):

| Distance | SPEED | POWER | STAMINA | WIT | Front / Pace / Late win share (field share 31 / 34 / 35%) |
|---|---|---|---|---|---|
| Sprint | 31% | 26% | 11% | 13% | 46 / 25 / 29% |
| Mile | 41% | 15% | 11% | 14% | 43 / 29 / 28% |
| Medium | 33% | 13% | 20% | 12% | 37 / 34 / 29% |
| Long | 32% | 12% | 26% | 10% | 34 / 35 / 31% |

The starting stall is worth a little: the inside stall wins 18 to 22%, the outside one 13 to 15%. A race has 8 to 15 passes tried (60 to
80% get done), about one Late Start, one Rushed spell, and 3 to 8 Spot Struggles; about one runner in ten empties its tank. Given every
skill, a runner fires Gate Burst 59% of races, Rail Hugger 93%, Slipstream 69%, Second Wind 56%, Home Stretch 57%, Chimera Soul 62%.
Wit's own effect is under-counted without skills (they are where it pays most).
