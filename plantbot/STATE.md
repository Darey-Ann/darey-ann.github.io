# PlantBot Desk Study — STATE

**What this is:** a browser 3D mockup of PlantBot, orbitable, for showing the supervisor.
Single self-contained HTML file. No build step, no dependencies, no internet needed
(fonts fall back gracefully offline). Open `PlantBot_Desk_Study.html` in any browser.

Published artifact (same content, shareable link):
https://claude.ai/code/artifact/595c0781-ff05-43dc-be03-c0f593a6d149

## Controls
- Drag — orbit
- Scroll / pinch — zoom
- Right-drag or two fingers — pan
- **Switch** button — Sunlit (green) <-> Needs sun (amber)
- Leaf sway / Auto-orbit checkboxes
- `#low` on the URL opens straight into the low-battery state

## What's modelled
- Two lens-shaped dished blades from the sketch: one large up-and-back, one small to the side
- Conforming photovoltaic panels on the upper shells (cell + busbar pattern in-shader)
- 3 LDR domes on stalks (2 big leaf, 1 small)
- LED tape on the underside of the leaf rim only — masked so the top edge doesn't emit
- Charge indicator on the base rim, glowing the current mood colour
- Flared foot, tapered stem, two petioles
- Desk by a window, warm late-afternoon key light, mug + books for scale, contact shadows

## States
| | Sunlit | Needs sun |
|---|---|---|
| Underglow | #54E066 | #FFB13C |
| Leaf pitch | lifted | drooped (-0.44 / -0.32 rad) |
| Sway | full | 45% amplitude, slower |
| Pulse | none | slow breathe, 0.16 amplitude |
| Charge / light | 86% / 940 lx | 11% / 40 lx |

Transition eases over ~0.9s. The droop + amber gradient is the "cute low-battery signal,
not a stressful alert" idea from the proposal notes.

## How it's built
No three.js — package registries are blocked in the cloud sandbox, so the renderer is
hand-written WebGL2, which also keeps it to one CSP-safe file.
- Parametric leaf surfaces (lens outline, dish, lengthwise arc, twist), solid-ified into
  top shell / bottom shell / rim with tapering thickness
- Lathe, tube, box, sphere, torus-arc primitives
- Forward shading: hemisphere ambient + key + 3 point lights + translucency term
- MRT: colour + emissive attachments; separable gaussian bloom at half res
- ACES tonemap, vignette, light grain

Source is split for editing under `src/`; `build.py` concatenates into both output files.

## Known / deliberate
- The leaves face the window because PlantBot is heliotropic — so from the room you see
  the underglow, which is the ambient-lighting use case. Orbit round to see the panels.
- Servos, ESP32, charger and LiPo from the schematic are implied inside the base, not modelled.
- Contact shadows are faked blobs, not a shadow map. Fine at this scale.

## Left open (next iteration)
- Day-cycle scrubber: drag through a day, sun moves across the window, charge accumulates
- Battery drain over the scrubbed day; "carry me outside" state when a windowsill isn't enough
- Servo tracking sweep — leaves rotating toward the brightest LDR
- Winter / low-sun case
- Tap ("tippy taps") interaction
