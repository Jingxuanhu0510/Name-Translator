# Name Translator

Name Translator is an interactive computational art project that explores how names are read, misread, split, translated, and regenerated across language, visual rules, and machine systems.

## Technical Overview

- An overhead camera captures handwritten English names.
- Google Gemini API performs handwriting recognition.
- Current recognition model: `gemini-3.1-flash-lite`.
- Google GenAI package: `@google/genai`.
- Node.js and Express run the server.
- Socket.IO handles real-time communication between the page and server.
- JavaScript and p5.js render the interactive visual system.
- My own rule-based A-Z mapping and square composition system generates the final pseudo-characters.

Gemini only performs the recognition step. The character transformation and generation system is my own rule-based JavaScript / p5.js system.

## Interaction Pipeline

Handwritten name -> Camera image -> Gemini handwriting recognition -> Recognised English text -> Letter cleaning and grouping -> Custom A-Z glyph mapping -> Square composition rules -> Generated pseudo-character -> On-screen result / Residue Archive.

## Installation

Requirements:

- Node.js LTS
- npm
- A browser with camera support
- A camera connected to the computer
- A Google Gemini API key

Install dependencies:

```bash
npm install
```

## API Configuration

Copy `.env.example` to `.env`, then add your own Gemini API key:

```env
GEMINI_API_KEY=your_api_key_here
```

No API key is included in the submission. Do not commit `.env`.

## How To Run Locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3000/exhibition.html
```

For Windows preview only, after running `npm install` and creating `.env`, you may double-click `START_PREVIEW.bat`.

## GitHub

The repository should not include:

- `.env`
- API keys
- `node_modules/`
- `runtime/`
- log files
- pid files

`package-lock.json` should be committed.

## Deploy On Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Environment Variable:

```text
GEMINI_API_KEY
```

Render provides the `PORT` environment variable automatically. The server listens on `0.0.0.0`.

## Main Project Files

- `server.js`: Express server, Socket.IO bridge, static file serving, recognition endpoints.
- `recognition.js`: Google Gemini handwriting recognition wrapper.
- `outputs/exhibition.html`: main exhibition page.
- `outputs/exhibition.js`: exhibition state flow and browser-side interaction logic.
- `outputs/mi_zi_grid_sketch.js`: p5.js visual rendering, A-Z mapping, composition, result, and archive system.
- `outputs/waiting-scene.js`: waiting page glyph animation.
- `outputs/waiting-scene.css`: waiting page styling.
- `outputs/camera-core.js`: camera capture and preview logic.
- `outputs/vendor/p5.min.js`: local p5.js dependency.

## Third-Party Technologies

- Google Gemini API / Google GenAI SDK: handwriting recognition service.
- p5.js: visual rendering.
- Express: Node.js web server.
- Socket.IO: real-time messaging.
- dotenv: local environment variable loading.
- qrcode: QR code generation used by the local tablet/screen server.

## Authorship

- Handwriting recognition model/service: Google Gemini.
- Interaction design: my work.
- A-Z visual mapping: my work.
- Glyph paths: my work.
- Grouping and composition rules: my work.
- Generative rendering system: my work.
- Interface and integration: my project implementation.
