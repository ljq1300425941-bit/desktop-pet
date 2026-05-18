# Desktop Pet

A tiny transparent Electron desktop pet for Windows, built with Electron, Vite, React, and TypeScript.

## Version

Current release: **v2.0.0**

v2 adds real weather awareness. The pet can now use IP-based location, fetch live weather from Open-Meteo, and switch between weather-specific moods while keeping the existing desktop companion interactions.

## Features

- Transparent, frameless, always-on-top Electron window
- Small draggable desktop pet
- Browser-safe React renderer using `window.electronAPI`
- Local pet state machine with interaction priority
- Left click view switching with a light bounce animation
- Double click surprised / wake behavior
- Hover-to-shy interaction
- Right-click pet menu with Sleep, Peek, Feed, Weather, and Clear actions
- Peek mode that snaps the pet to the right screen edge
- Real weather integration:
  - IP-based location
  - Open-Meteo current weather
  - 30-minute refresh interval
  - Weather modes for sunny, cloudy, rainy, and hot conditions

## Weather Modes

The v2 weather layer maps current weather into pet mood images:

- `sunny_happy`
- `sunny_sunbathe`
- `cloudy_quiet`
- `rain_sad`
- `rain_sleep`
- `hot_wilted`

User interactions still take priority. Dragging, feeding, sleeping, peeking, shy, and surprised states temporarily override the weather display, then the pet returns to the current weather mood.

## Development

Install dependencies:

```powershell
npm install
```

Run the app in development:

```powershell
npm run dev
```

Build the renderer:

```powershell
npm run build
```

Start Electron directly:

```powershell
npm run start
```

## Project Structure

```text
electron/
  main.js       Electron window, IPC, tray, weather fetching
  preload.cjs   Safe renderer API bridge

src/pet/
  DesktopPet.tsx  Pet state machine and UI
  styles.css      Transparent window and pet animations
  assets/         Pet images and weather mood images
```

## Notes

- The renderer must not import `electron`, `ipcRenderer`, `path`, or `fs` directly.
- Weather fetching runs in the Electron main process.
- `ipapi.co` is tried first for location; if it is rate-limited, the app falls back to `ip-api.com`.
- Network failures are non-fatal. The pet keeps its current state if weather refresh fails.
