# PlantBot Desk Study — STATE

**What this is:** a browser 3D mockup of PlantBot, orbitable, for showing the supervisor.
Single self-contained HTML file. No build step, no dependencies, no internet needed
(fonts fall back gracefully offline). Open `index.html` in any browser.

Published artifact (same content, shareable link):
https://claude.ai/code/artifact/595c0781-ff05-43dc-be03-c0f593a6d149

## Iteration 2 (2026-08-27) — the leaf family
One body, five swappable leaf modules, four sizes. The base, stem, PV, LDRs, LED rim
and both states are identical across all of them; only the blade parameterization
changes, so the set reads as one product line rather than five objects.

| module | outline | why it's in the set |
|---|---|---|
| Sketch | symmetric lens | the original blade, unchanged |
| Snake (Sansevieria) | near-parallel strap, `lensOutline(0.24)` | four upright blades, smallest footprint, fits a narrow sill |
| Ficus (F. elastica) | ovate, `betaOutline(0.62, 0.95)` | most PV area per leaf, widest surface to read the underglow off |
| Monstera (M. deliciosa) | notched ovate + shader fenestrations | split margin, unmistakable silhouette at display size |
| Fern (Nephrolepis) | pinnate compound frond | 11 leaflet pairs on a rachis, PV runs down the rachis |

| size | scale | blade (sketch module) | where it stands |
|---|---|---|---|
| Desk | ×1.00 | 18 cm | on the desk, alone |
| Fan | ×1.95 | 34 cm | on the desk beside a desk-size one, with one leaf detached and lying flat with a grip |
| Floor | ×3.10 | 55 cm | on the floor, ~78 cm tall, desk-size one still on the desk |
| Display | ×6.20 | 1.09 m | on the floor, ~1.6 m tall, next to a 1.71 m scale figure |

**Line-up** checkbox puts all five modules side by side on the desk at desk size.

Every combination is deep-linkable in the URL hash, comma separated:
`#monstera,display`, `#fern,fan,low`, `#lineup`, `#low`, `#min` (start with the panel folded).

## Controls
- Drag — orbit
- Scroll / pinch — zoom
- Right-drag or two fingers — pan
- **Switch** button — Sunlit (green) <-> Needs sun (amber)
- Leaf module / Size chip rows; Leaf sway / Auto-orbit / Line-up checkboxes
- **Close chip** on the panel's top-right corner folds the whole panel away, so the
  render gets the screen on a phone; folded, the same button becomes a `● CONTROLS ⌃`
  pill at the bottom-left that brings it back. It toggles the class `hud-min` on
  `<html>` — under the 720px breakpoint that class also fades the title block, and any
  `:root.hud-min <selector>{display:none}` rule you add joins in with no JS.
  `#min` in the hash starts folded.
- The spec line under the size chips reads blade length, overall height and PV area,
  recomputed from the actual geometry (PV area is summed from the panel mesh triangles)

## What's modeled
- Parametric leaf blades: outline, dish, lengthwise arc and twist, solid-ified into
  top shell / bottom shell / rim with tapering thickness
- Conforming photovoltaic panels on the upper shells (cell + busbar pattern in-shader);
  on the fern the PV is a ribbon down the rachis instead
- LDR domes on stalks, placed per module
- LED tape on the underside of the leaf rim only — masked so the top edge doesn't emit
- Charge indicator on the base rim, glowing the current mood color
- Flared foot, tapered stem, generated petioles (snake plant has none — blades leave the base)
- Room: desk by a window, floor, four wall segments, warm late-afternoon key light,
  mug + books for scale, contact shadows
- 1.71 m scale figure, deliberately blank — it is a ruler, not a character

## States
| | Sunlit | Needs sun |
|---|---|---|
| Underglow | #54E066 | #FFB13C |
| Leaf pitch | lifted | drooped (per-module `droop`, 0.26–0.46 rad) |
| Sway | full | 45% amplitude, slower |
| Pulse | none | slow breathe, 0.16 amplitude |
| Charge / light | 86% / 940 lx | 11% / 40 lx |

Transition eases over ~0.9s. The droop + amber gradient is the "cute low-battery signal,
not a stressful alert" idea from the proposal notes.

## Editing it  (read this first)

**`index.html` is the file the browser runs.** It contains its own inlined
copy of everything in `src/`. Editing `src/part3.js` changes nothing on its own.

Two valid workflows - pick one, don't mix:
1. Edit `index.html` directly. Fastest for tweaking numbers.
2. Edit `src/*.js`, then run `python src/build.py`, which regenerates the HTML.

If a change appears to do nothing, you edited the other copy. Sanity check: change the
`<h1>` text and reload - if the heading doesn't change, you're not looking at the file
you're editing (browser cache, or a stray copy in Downloads).

### Adding a sixth leaf module
Everything about a module lives in one entry of the `SPECIES` table at the top of
`part3.js` — no other file needs touching. An entry is a stem height plus a list of
leaves; each leaf gives its attachment point, resting roll/yaw/elevation, how far it
droops when flat, a sway multiplier and phase, the blade parameters, the PV footprint
and the LDR positions. Add the key to `SPECIES_ORDER` and it appears as a chip.

The blade shape is one function: `o.outline(u)` returns the half-width, as a fraction
of `o.width`, at position `u` along the midrib (0 = base, 1 = tip). Three are provided
in `part1.js` and they compose:
- `lensOutline(p)` — symmetric; low `p` = strap-like, high `p` = pointed
- `betaOutline(a, b)` — asymmetric ovate; the widest point sits at `a/(a+b)`
- `notchOutline(base, cuts, depth, sharp)` — cuts gorges into any outline

Set `frond: true` for a pinnate compound blade; `frondParts()` scatters leaflet pairs
down an arcing rachis and `buildCompound()` merges them into one buffer, so a 22-leaflet
fern still costs the same three draw calls as a simple leaf.

Set `fenestrated: true` to punch the blade through — the holes are `discard`ed in the
fragment shader (flag 7) from ellipses in UV space, so they cost no geometry. Their
positions are hard-coded in the shader, not in the species table; edit them there if a
new module needs a different hole pattern.

### The look knobs
Near the top of the script block (and at the top of `src/part3.js`):

| constant | does | note |
|---|---|---|
| `SUN` | key light through the window, RGB | may exceed 1.0, it's HDR |
| `AMBIENT` | flat fill from all sides | **raise this and it looks washed out** |
| `SKY_COL` / `GND_COL` | ambient from above / bounced off the desk | |
| `BLOOM` | how far the LED glow bleeds | |
| `EXPOSURE` | overall brightness before tonemap | change last, it moves everything |
| `GRAIN` | static dither | **lower = more visible banding**, 0 = none |
| `PULSE_RATE` / `PULSE_DEPTH` | low-battery breath speed and depth | 0.7 = ~9s cycle |
| `FLOOR` | floor height; desk top is y = 0, so this is also the desk height | |
| `VIEW` | camera preset per size and for the line-up | target, radius, phi, theta |
| `SPOT` | where each bot, the detached fan leaf and the scale figure stand | |

Contrast is the key-to-fill *ratio*: to de-wash, lower `AMBIENT` and raise `SUN`,
rather than touching `EXPOSURE`.

## How it's built
No three.js — package registries are blocked in the cloud sandbox, so the renderer is
hand-written WebGL2, which also keeps it to one CSP-safe file.
- Parametric leaf surfaces solid-ified into top shell / bottom shell / rim
- Lathe, tube, box, sphere, torus-arc primitives; `transformMesh` + `mergeMesh` bake
  sub-meshes into one buffer for compound blades
- Forward shading: hemisphere ambient + key + 3 point lights + translucency term
- MRT: color + emissive attachments; separable gaussian bloom at half res
- ACES tonemap, vignette, static dither

Species geometry is built lazily on first selection and cached in `SGEO`, so startup
stays fast; ticking Line-up warms all five before the first frame.

Only three point lights exist in the shader. With more than one bot on stage the hero
gets two and everyone else shares the third — the others still glow, they just don't
cast a pool of light on the desk. If a future iteration wants every bot lit, that is
the thing to change.

### Why the dither is static
The composite adds a per-pixel dither to stop 8-bit banding on the smooth gradients.
It must not vary with time: animated noise reads as a fluorescent-light strobe across
the whole frame. It also must not use `fract(sin(dot(uv * big numbers)))` - the huge
argument loses precision in `sin()` on real GPUs and freezes into visible streaks
(software renderers hide this, so it won't reproduce in a headless screenshot).
The hash now runs off `gl_FragCoord` with small coefficients, which has neither problem.

Source is split for editing under `src/`; `build.py` concatenates into `index.html`.

## Known / deliberate
- The leaves face the window because PlantBot is heliotropic — so from the room you see
  the underglow, which is the ambient-lighting use case. Orbit round to see the panels.
- Servos, ESP32, charger and LiPo from the schematic are implied inside the base, not modeled.
- Contact shadows are faked blobs, not a shadow map. Fine at this scale.
- The detached fan leaf is unpowered on purpose — no LED glow — which is why it reads
  darker than the leaves still on the body.
- Monstera fenestrations are shader `discard`, so the hole edges show no wall thickness.
  At display size, up close, that reads as slightly papery.
- The scale figure is 1.71 m. The display size lands at ~1.6 m to the highest leaf tip.

## Left open (next iteration)
- Day-cycle scrubber: drag through a day, sun moves across the window, charge accumulates
- Battery drain over the scrubbed day; "carry me outside" state when a windowsill isn't enough
- Servo tracking sweep — leaves rotating toward the brightest LDR
- Winter / low-sun case
- Tap ("tippy taps") interaction
- The fan leaf actually detaching on click, rather than being pre-detached at Fan size
- Per-module PV yield: the spec line reports panel *area*, but the honest comparison is
  area × the fraction of the day each blade's angle actually faces the sun
