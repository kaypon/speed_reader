# Speed Reader

Read anything one flash at a time, lined up on a red focus letter so your eyes never move. Starfield background, Next.js app.

## Features

- **Library**: saved texts with progress and resume, stored in the browser (IndexedDB).
- **Import**: paste text, pull an article from a link (`/api/extract`, Readability), or open `.txt`, `.md`, `.pdf` and `.epub` files.
- **Settings**: speed (100 to 1500 wpm), words per flash (1 to 5), warm-up ramp, countdown, sentence/comma/paragraph pauses, smart timing (common words faster, rare words slower), font, size, focus color and position, guide lines, context line, starfield density and motion, loop.

## Keys

| Key | Action |
| --- | --- |
| Space | play / pause |
| ← → | back / forward (Shift: 10) |
| ↑ ↓ | speed ±25 wpm |
| `[` `]` | words per flash |
| R | restart |
| L or T | library / add text |
| S | settings |
| F | fullscreen |

## Develop

```bash
npm install      # also copies the pdf.js worker into public/
npm run dev
npm run build
```
