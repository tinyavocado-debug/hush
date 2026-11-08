# Hush

- **Start:** `python3 -m http.server 8766` from the repo root (no build step)
- **Port:** 8766
- **Main URL:** http://localhost:8766/ (rooms: `/orbit/`, `/ember/`, `/pond/`; `/still/` and `/cairn/` redirect to their new names)

## Names

- **Hush**: the app. A room picker, then one room per scene.
- **Orbit** (was Still): deep space and the breathing dot sphere. Sounds: Ocean, Rain, Silence.
- **Ember**: incense stick that burns down. Sounds: Drone (`temple` in code), Hearth, Silence.
- **Pond**: a koi pond seen from above (lily pads, lotus, three koi). Was **Cairn** (stones at a lake) until 2026-11-07. Sounds: Garden, Rain, Silence.
- **Pace**: Short / Steady / Long, plus **Hold**. Every session starts Steady.

## Settled

- Every soundscape follows the visuals' breath curve (`breathCurve` in `shared/core.js`), so sound and scene rise and settle together.
- Ember's Drone uses **cues**: a high chime as each breath in starts, a low one as each breath out starts, over a gentle bloom of upper tones and air. (Also tried: a wider swing, and separate in/out textures.)
- Ember's stick: the original tip and straight ash, plus a few **sparks** rising from the tip as each breath in starts (with the high chime), and the ash dropping as each breath out starts, so the smoke gives a small jump. Also tried and dropped: smoke rings on each breath out, stirring the smoke by touch, and a glowing coal with curling ash.
- Pond's scene is the **koi pond** (chosen 2026-11-07; it replaced Cairn's stone stack at a lake, and the room was renamed Pond). A ring spreads from the centre as each breath in starts; rain drops ring the water; each garden chime drops a petal. Also tried: a rainy window that fogs on the breath out, and a bamboo grove that sways.
- Orbit's look: the picker card is a violet-blue glow on near-black with twinkling stars; the room is a diagonal blue-to-plum gradient (`orbit/orbit.css`) with glimmering stars. The sphere keeps its stone colours. Also tried: Moon, Spring, Stone and a light baby-blue Sky as other names and palettes for this room, and a spiral galaxy behind the dial.
