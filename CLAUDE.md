# Hush

- **Start:** `python3 -m http.server 8766` from the repo root (no build step)
- **Port:** 8766
- **Main URL:** http://localhost:8766/ (rooms: `/orbit/`, `/ember/`, `/pond/`)
- **Usage stats:** http://localhost:8766/stats/ reads GoatCounter (tinyavocado.goatcounter.com) with a read-only API token kept in that browser. GoatCounter rate-limits its API (429), so the page spaces its calls, retries, and caches each range for 5 minutes. Events are sent from `shared/analytics.js` (`begin/<room>/<sound>/<breath>/<min>m`, `finished|ended-early/<room>/<min>m`); localhost visits aren't counted.

## Names

- **Hush**: the app. A room picker, then one room per scene.
- **Orbit** (was Still): deep space and the breathing dot sphere. Sounds: Float, Voyage, Silence (`float` and `voyage` in code; since 2026-11-15 star-pad music in the spirit of the loving-kindness app, in D. They were ocean and rain before: `ocean` is still in core.js, and Pond keeps `rain`).
- **Ember**: incense stick that burns down. Sounds: Drone (`temple` in code), Hearth, Silence.
- **Pond**: a koi pond seen from above (lily pads, lotus, three koi). Was **Cairn** (stones at a lake) until 2026-11-07. Sounds: Garden, Rain, Silence.
- **Breath menu**: a button at the top right (setup screen, and with the session controls) showing the current choice; it opens a menu with **Your own pace** (Short / Steady / Long, plus **Hold**) and the one-word **techniques** below (`Spa.TECHNIQUES` in `shared/core.js`: Balance, Recovery, Concentration, Stillness, Discipline, Control, Advanced, Alertness, Body, Movement, Senses, Activating). Hold a technique to favorite it: an outline draws round it and it moves to the top. The choice and favorites are shared by all rooms and remembered; first visit starts Steady. Still being tried (2026-11-08).

## Settled

- Every soundscape follows the visuals' breath curve (`breathCurve` in `shared/core.js`), so sound and scene rise and settle together.
- Ember's Drone uses **cues**: a high chime as each breath in starts, a low one as each breath out starts, over a gentle bloom of upper tones and air. (Also tried: a wider swing, and separate in/out textures.)
- Ember's stick: the original tip and straight ash, plus a few **sparks** rising from the tip as each breath in starts (with the high chime), and the ash dropping as each breath out starts, so the smoke gives a small jump. Also tried and dropped: smoke rings on each breath out, stirring the smoke by touch, and a glowing coal with curling ash.
- Pond's scene is the **koi pond** (chosen 2026-11-07; it replaced Cairn's stone stack at a lake, and the room was renamed Pond). A ring spreads from the centre as each breath in starts; rain drops ring the water; each garden chime drops a petal. Also tried: a rainy window that fogs on the breath out, and a bamboo grove that sways.
- Orbit's look: the picker card is a violet-blue glow on near-black with twinkling stars. The room ("Glow") is a high-contrast violet glow behind the dial fading fast to near-black, with glimmering stars and a faint haze; the sphere keeps its warm stone-and-gold dots, and the Begin button and dial arc stay cream. Also tried: Moon, Spring, Stone and a light baby-blue Sky as other names and palettes; a spiral galaxy behind the dial; and Drift, Blend (Drift with a blue halo round the sphere), Blend Dark, Nebula (a pink-white bloom with sparkle stars and streaks), Halo (near-black with a blue halo) and Ultraviolet room styles.
