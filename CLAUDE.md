# Hush

- **Start:** `python3 -m http.server 8766` from the repo root (no build step)
- **Port:** 8766
- **Main URL:** http://localhost:8766/ (rooms: `/still/`, `/ember/`, `/cairn/`)

## Names

- **Hush**: the app. A room picker, then one room per scene.
- **Still**: candlelit pool and breathing dot sphere. Sounds: Ocean, Rain, Silence.
- **Ember**: incense stick that burns down. Sounds: Drone (`temple` in code), Hearth, Silence.
- **Cairn**: stones at a morning lake. Sounds: Garden, Rain, Silence.
- **Pace**: Short / Steady / Long, plus **Hold**. Every session starts Steady.

## Settled

- Every soundscape follows the visuals' breath curve (`breathCurve` in `shared/core.js`), so sound and scene rise and settle together.
- Ember's Drone uses **cues**: a high chime as each breath in starts, a low one as each breath out starts, over a gentle bloom of upper tones and air. (Also tried: a wider swing, and separate in/out textures.)
