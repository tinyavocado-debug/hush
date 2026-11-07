# Hush

*A room for rest.*

Hush is a breath-led meditation timer for your phone. Choose a room, set how long you want to rest, and let the scene and sound breathe with you while the time passes.

**Try it:** https://tinyavocado-debug.github.io/hush/ (add it to your home screen for a full-screen timer)

## The rooms

- **Still**: a candlelit pool at night. Turn the stone around the dial; each full hour adds a ring. Ocean, rain or silence.
- **Ember**: a single stick of incense that burns down as you rest. Drag it to its length. Drone, hearth or silence.
- **Pond**: a koi pond seen from above. Lily pads drift, the fish circle, and each breath sends a ring across the water. Rain rings the surface; a garden chime drops a petal. Garden, rain or silence.

## A session

A singing bowl, a moment of stillness, then one large "breathe in". The countdown begins on your first breath out. The visuals and soundscape rise and settle on each breath.

Every session starts at a **Steady** pace (4 seconds in, 6 out). Tap during a session to change it: **Short** (3 in, 5 out) or **Long** (5 in, 8 out), and **Hold** to pause after each breath in and each breath out (2, 3 or 4 seconds, matching the pace). The new rhythm starts with your next breath. Three bells close the session, followed by a gentle note for coming back.

All sound is generated live in the browser with the Web Audio API, with no audio files. The screen stays awake during a session.

## Running it locally

There's no build step. Serve the folder with any static server and open it in a browser:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project layout

```
index.html            room picker
shared/core.js        session engine: timing, breathing clock, generative audio, wake lock
shared/base.css       shared layout and controls
still/ ember/ pond/   one folder per room (page, styles, scene)
manifest.webmanifest  home-screen install
```
