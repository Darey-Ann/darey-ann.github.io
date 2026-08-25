# Arborality Park — where we got to

Last built: this session. The published artifact and the copy in this
folder are both up to date with everything below.

## What it is
A walkable Japanese park at golden hour, first person, five species
along a 247 m looping path. Standing near a specimen tree prompts
"What tree is this?"; Space raises the Arborality device, which is a
see-through window onto the park with the tree's whole life drawn over
it. Sakura uses the 200 Blender plates; the other four are drawn live
as schematics and labelled as such.

Single self-contained HTML file, no libraries, hand-written WebGL2.
Build with `python3 build.py` from `src/` — never edit the built file.

## Controls
  arrows      walk / turn
  click       take the camera, click again to release
  Space       raise Arborality at a tree
  C           collection
  R           restart (back to the entrance, collection emptied)
  M           sound
  P           lighter graphics (three steps down)

## Done and verified
- Camera returns to exactly where it was looking after a scan
- R resets position, heading, momentum and the collection incl. storage
- All five species reachable on one lap, in order, no prompt at spawn
- Device screen is a real window (the body has a hole cut in it)
- Pool of light behind the specimen; denser for plates than schematics
- Komorebi: shadow-map dapple + screen-space shafts
- Comments throughout; architecture map at the top of the built file

## Test scripts (in this zip)
  walk.py    walks the whole loop, reports which species get offered
  audit.py   per-specimen distance from path vs. detection reach
  logic.py   the aim/restore turn, driven at fixed dt (frame-rate proof)
  verify.py  end-to-end: scan, collect, close, reset
  veil.py    screenshots the sakura plate
  test.py    the long visual pass, 11 screenshots
Run any with `python3 <name>.py`. They need playwright + a chromium.

## Open, if you ever want it
- matsu has the shortest window to notice it (~5.5 m of walking, ~2 s).
  Fix by lowering its `off` in buildWorld or raising reachOf.
- The plate's on-screen SIZE now follows the app's own algorithm, but
  it is worth eyeballing side by side with the app once.
- Phone mockup: agreed for a separate chat. Decide first whether you
  want a device mockup or a phone-screen mockup — different builds.

## Where things live
  src/01_gl.js .......... maths, WebGL plumbing, Mesh/Builder
  src/02_shaders.js ..... all shader source
  src/03_textures.js .... every leaf and blade, drawn on canvas
  src/04_trees.js ....... SPECIES_FORM — tree shapes
  src/05_world.js ....... PATH_CTRL, ground, scattering, critters
  src/06_render.js ...... LOOK — all lighting; the frame passes
  src/07_player.js ...... walking, looking, reachOf, aim/restore
  src/08_data.js ........ LIB — what the device says
  src/09_schematic.js ... the growing ink figure
  src/10_device.js ...... device state machine, plate layout
  src/11_main.js ........ sound, boot, keys, frame loop
