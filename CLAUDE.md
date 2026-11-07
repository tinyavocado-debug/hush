# Hush

- **Start:** `python3 -m http.server 8766` from the repo root (no build step)
- **Port:** 8766
- **Main URL:** http://localhost:8766/ (rooms: `/still/`, `/ember/`, `/cairn/`)

## Names

- **Hush**: the app. A room picker, then one room per scene.
- **Still**: candlelit pool and breathing dot sphere. Sounds: Ocean, Rain, Silence.
- **Ember**: incense stick that burns down. Sounds: Drone (`temple` in code), Hearth, Silence.
- **Cairn**: a koi pond seen from above (lily pads, lotus, three koi). Sounds: Garden, Rain, Silence.
- **Pace**: Short / Steady / Long, plus **Hold**. Every session starts Steady.

## Settled

- Every soundscape follows the visuals' breath curve (`breathCurve` in `shared/core.js`), so sound and scene rise and settle together.
- Ember's Drone uses **cues**: a high chime as each breath in starts, a low one as each breath out starts, over a gentle bloom of upper tones and air. (Also tried: a wider swing, and separate in/out textures.)
- Ember's stick: the original tip and straight ash, plus a few **sparks** rising from the tip as each breath in starts (with the high chime), and the ash dropping as each breath out starts, so the smoke gives a small jump. Also tried and dropped: smoke rings on each breath out, stirring the smoke by touch, and a glowing coal with curling ash.
- Cairn's scene is the **koi pond** (chosen 2026-11-07; it replaced the stone stack at a lake). A ring spreads from the centre as each breath in starts; rain drops ring the water; each garden chime drops a petal. Also tried: a rainy window that fogs on the breath out, and a bamboo grove that sways.
