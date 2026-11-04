# Hush

*A room for rest.*

Hush is a breath-led meditation timer for your phone. Choose a room, set how long you want to rest, and let the scene and sound breathe with you while the time passes.

**Try it:** https://tinyavocado-debug.github.io/hush/ (add it to your home screen for a full-screen timer)

## The rooms

- **Still**: a candlelit pool at night. Turn the stone around the dial; each full hour adds a ring. Ocean, rain or silence.
- **Ember**: a single stick of incense that burns down as you rest. Drag it to its length. Drone, hearth or silence.
- **Cairn**: morning at a still lake. Stack a stone for every five minutes and watch them return to light. Garden, rain or silence.

## A session

A singing bowl, a moment of stillness, then one large "breathe in". The countdown begins on your first breath out. Breathing is paced at four seconds in and six out, with the visuals and soundscape rising and settling on each breath. Three bells close the session, followed by a gentle note for coming back.

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
still/ ember/ cairn/  one folder per room (page, styles, scene)
manifest.webmanifest  home-screen install
```
