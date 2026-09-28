# Circumgician — Graphical (and audio) overhaul

## Context

The current look is flat vector: circles and strokes. The user wants it "jazzed up a lot", and specifically notes that the annihilation dot is hard to tell from red. They set the core art direction and answered an interview for the rest.

Direction set by the user:
- **Motes**: smoky, wispy particle effects.
- **Nodes**: glassy bowls, colored with the color they catch.
- **Edges**: glass tubes. Each node's two adjacent tubes carry the color it produces, as flowing liquid: each half flows from its node toward the tube's middle and swirls where the two halves meet.
- **Generic/wild**: opalescent.
- **Annihilation**: broken or very dull.

Interview answers:
- **Rune inner layers**: nested frosted glass. The middle is a frosted plate; the center is faintly etched glass.
- **Held mote**: the bowl fills with glowing liquid of the mote's color, rising as it arrives. Free motes are smoke; being caught condenses them into liquid.
- **Detonation**: the captured liquid pulls inward and the glass shatters in an implosion. The gathered liquid flies off toward the obstacle as the hit. Liquid spilled from the broken tubes congeals into the new (released) motes.
- **Obstacles**: faceted obsidian crystal with the black holes swirling inside. The next-shape outline becomes a ghostly obsidian outline.
- **Backdrop**: deep violet nebula with slow stars, plus faint arcane circles and constellation lines. The field border is an etched ring.
- **Link**: a thin shimmering thread with glyph beads drifting toward the obstacle; it brightens and pulses when the rune is full.
- **Blockers**: obsidian slabs, the same material as obstacles.
- **UI**: frosted-glass panels, thin gilt filigree borders, a decorative serif display font.
- **Palette**: the same five hues retuned as jewel tones: ruby, sapphire, amber, jade, amethyst.
- **Budget**: as rich as possible while holding 60fps on the user's iPhone, with adaptive detail.
- **Audio**: rework the SFX to match (glass, liquid, smoke, implosion). Keep the music bed.

Rules and simulation are untouched. This is presentation only, so the 60 existing tests stay the regression net.

## Approach

Pixi v8 as now. Soft or complex shapes come from textures generated once at startup on an offscreen 2D canvas and drawn as batched Sprites (cheap on mobile GPUs). Geometry that moves per frame (tubes, threads, facets) stays in `Graphics`. No runtime filters on many objects.

### 1. Palette & texture atlas — `src/render/Theme.ts`, new `src/render/textures.ts`
- `HUE_COLORS` retuned: ruby, sapphire, amber, jade, amethyst.
  - Keep hue keys (`red`, `blue`, …) so the sim, levels and editor are unchanged.
  - Check each hue stays distinct from the others and from the dull annihilation tone.
- `ANNIHILATION`: a dull ash tone plus a crack treatment.
- `opal(t, seed)`: a slowly shifting pastel iridescence, used for generic motes, generic release liquid and the wildcard shimmer.
- `textures.ts` builds once:
  - soft glow disc
  - smoke puff (layered noisy radial blobs)
  - glass bowl base (white, tintable) and a separate untinted specular highlight
  - liquid meniscus disc
  - glass shard
  - glyph bead
  - star sprites
  - a full-canvas nebula backdrop
- Exported as Pixi `Texture`s via `Texture.from(canvas)`.

### 2. Backdrop & field — `src/render/ZoneBackground.ts`
- Nebula texture behind all zones, plus a few dozen star sprites drifting very slowly (parallax), plus faint arcane circles and constellation lines (static `Graphics`, low alpha).
- The field border becomes an etched ring (double line with small rune ticks).
- Blockers become obsidian slabs, sharing the obsidian facet routine with obstacles.

### 3. Motes — rewrite `src/render/MoteView.ts`, new `src/render/SmokeSystem.ts`
- `SmokeSystem`: a pooled sprite particle layer.
  - `emit(x, y, color, size, vel)`.
  - Each puff drifts on a cheap curl-ish noise field, grows and fades over ~0.8–1.2s.
  - The spawn rate is scaled by the quality tier (section 8).
- Mote rendering by state:
  - **free**: a soft luminous core sprite that continuously sheds lazy wisps. A generic mote's wisps are opal-shifting.
  - **traveling**: a tightening smoke stream spiraling into the target bowl.
  - **held**: the mote itself is hidden; its node's bowl shows the liquid (section 4).
  - **ejecting**: born as a liquid droplet at its spill point that congeals into smoke as it settles at home (ties into section 6).
  - **coasting** (kick/push): a stretched wisp trail.

### 4. Runes as glass — rewrite `src/render/RuneView.ts`
- Tubes (`Graphics`, per frame):
  - An outer glass stroke with a thin highlight line.
  - Inside, colored liquid flowing from each node toward the tube's midpoint in its release color: animated dash segments whose phase advances along the tube. The two halves meet in a small swirling blob at the middle.
  - An **annihilating** node's two tube halves are dull ash, cracked (zigzag fracture line, a missing sliver of glass) and still.
  - A **generic** release flows opalescent.
- Bowls (sprites):
  - A glass base tinted with the catch hue, plus the specular highlight.
  - Liquid fill: a meniscus disc tinted with the held mote's actual color, rising in over ~0.25s when the mote arrives. Traveling motes make it shimmer in anticipation.
- The middle is a frosted glass plate (layered low-alpha fills with an inner edge highlight). The center is a faint etched outline; the insight modes (none/shape/full) keep their meaning in the same material.
- **Full**: liquid glows brighter, the tubes pulse, and a soft outer aura appears.
- Inventory icons use the same renderer at icon scale, with the flow animation slowed.

### 5. Obstacles — rewrite the drawing in `src/render/ObstacleView.ts`
- Obsidian: a faceted polygon (triangles from the center to each edge, alternating deep shades), a sharp rim highlight and a slow specular glint sweep. The black holes (kept from the current version) swirl inside with a faint lensing ring.
- The next-shape outline becomes a ghostly obsidian outline (dark edge with a violet glint). It keeps the shrink-into-place reveal.
- Boss: gilded fractures across the facets, replacing the gold rims.

### 6. Detonation choreography — `src/core/GameScene.ts` `onDetonated`, `src/render/Effects.ts`
Driven from the existing `rune:detonated` `DetonationInfo` (pos, outer layer and angle, held colors, released and annihilated ids, obstacle id). Roughly 0.7s total:
1. Liquid from each bowl pulls inward to the center, forming an orb (~0.15s).
2. The glass implodes: shards rush inward, then burst outward with glints. The tubes break.
3. If linked, the orb flies to the obstacle and splashes on impact (black holes implode as now), with a screen shake. If unlinked, the orb dissolves into smoke.
4. The liquid spilled from the broken tubes congeals into the released motes. The released motes' ejecting animation starts at the tube break points, rendered as droplets, then turns to smoke at their landing spots.
   - Visual only: the sim's `ejecting` timing stays the same, and the view just delays and redirects the drawing.
   - Annihilated liquid fizzles to ash.
- Obstacle layer collapse: the obsidian shatters into dark shards with violet glints before the next-shape outline shrinks in.

### 7. Link thread — `GameScene.drawLinks`
- A thin shimmering thread with small glyph-bead sprites drifting toward the obstacle.
- Brighter and faster when the rune is full.
- The drag preview uses a dimmer version, and turns red when the spot is invalid.

### 8. Quality governor — new `src/render/Quality.ts`
- Tracks the rolling frame time in `GameScene.update`.
- Tier 2 (full) by default. Drops a tier if the average is over ~18ms for 2s; climbs back after a sustained fast stretch.
- Tiers scale smoke spawn rate and caps, star count, and secondary glows.
- `?debug=1` shows the current tier and FPS in the debug panel.

### 9. UI restyle — `src/ui/ui.css`, `Menu.ts`, `LevelSelect.ts`, `HUD.ts`, `GameHud.ts`, `HowToPlay.ts`, `index.html`
- Self-host two OFL fonts in `public/fonts/`, downloaded once and committed, so the live site makes no third-party requests:
  - Cinzel for display.
  - Cormorant Garamond for body text.
- Frosted-glass panels (backdrop blur where supported), thin gilt borders with small corner flourishes (CSS plus inline SVG), and glass-orb HUD buttons with a gilt ring.
- Move `Menu` and `LevelSelect` inline styles into CSS classes.
- Update the How to Play copy and art to the new visual language:
  - bowl color = what a node catches
  - tube color = what the mote becomes
  - cracked grey tube = destroyed

### 10. Audio — `src/audio/Sfx.ts`
Rework each synthesized sound; the music bed is unchanged:

| Event | New sound |
|---|---|
| Catch | Liquid drip into glass: a pitch-dropping sine blip plus a glass ping |
| Rune full | Glass resonance chord |
| Pick up / place | Glass clink |
| Kick | Airy smoke whoosh (band-passed noise sweep) |
| Detonation | Implosion: reverse-swell noise, then a glass shatter (high-passed noise burst plus inharmonic pings), then a low thump |
| Obstacle collapse | Deep obsidian crack |
| Undo | Glass rewind swirl |
| Win / loss | Retuned to match |

### 11. Spec doc
Update the Presentation section and the Color language paragraph (project `e5118dc6…`, read `sinceRev: 21` first).

## Order of work
Each step is committed and pushed separately:
1. Palette + textures + backdrop + blockers
2. Motes / smoke
3. Glass runes
4. Obsidian obstacles + link thread
5. Detonation choreography
6. UI + fonts + How to Play
7. Audio
8. Quality governor + tuning pass

## Verification
- `npm run build` and `npm test` (60 tests) green after every step. The sim is untouched.
- Chrome after each step, driving frames via a temporary `window.__shell` hook (removed before commit): screenshots of a level mid-play, a full rune, a detonation mid-sequence, and endless with generic motes and an annihilating node. Annihilating tubes must be unmistakable next to ruby. No console errors.
- Performance: time `scene.update + app.render` per frame in Chrome with CPU throttling (4x) on the busiest board (level 5 and endless). Confirm the governor drops a tier and recovers.
- The user checks feel and FPS on their iPhone after the pushes. Everything deploys on push, so each step is live.
