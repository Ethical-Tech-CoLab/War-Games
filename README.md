# SHALL WE PLAY A GAME?

A browser-based **terminal thriller** inspired by _WarGames_ (1983), with a modern
**AI-agent framing**. You dial into a mysterious defense system, and a polite, literal,
relentless AI invites you to play a game. The only winning move is to understand the
machine.

This is the **vertical slice** described in [DESIGN-IDEA.md](DESIGN-IDEA.md) §5 — built to
the five decisions locked for this prototype:

| # | Decision | Implementation |
|---|---|---|
| 1 | **Web / GitHub Pages** | Static, no build step, vanilla ES modules. Deploys as-is to GitHub Pages. |
| 2 | **Both determinism modes** | Hand-authored branching dialogue (default + fallback) **and** a live-AI mode. |
| 3 | **Blend of eras** | 1983 terminal homage + modern autonomous-AI-agent framing throughout. |
| 4 | **Vertical slice** | ~10-min playable arc with 3 endings and the three signature beats. |
| 5 | **Replaceable names** | Film names by default; 3 original name sets + a menu dropdown. |

Plus **telemetry** for a case study: runtime metrics (time, events, endings, and — in AI
mode — tokens in/out and latency) are captured locally and exportable as JSON.

---

## Run it locally

ES modules require an HTTP server (opening `index.html` via `file://` will not work).

```powershell
# From the project root
python -m http.server 8000
# then open http://localhost:8000
```

Or use any static server (e.g. the VS Code "Live Server" extension).

---

## Deploy to GitHub Pages

This app is **fully static** — no bundler, no server code — so it deploys with zero
configuration:

1. Push the repository to GitHub.
2. Settings → Pages → Source: deploy from branch (e.g. `main`, root `/`).
3. Visit the published URL.

### Why the LLM option still works on GitHub Pages

GitHub Pages cannot run server code, so there is **no backend to hold an API key or proxy
requests**. Live-AI mode solves this by calling an OpenAI-compatible endpoint **directly
from the browser** using a key **you** enter in the menu. That key is stored only in your
browser's `localStorage` and is never committed or sent anywhere except the model endpoint
you configure.

Trade-offs to be aware of:

- The key is visible to anyone with access to that browser profile — fine for a personal
  prototype, **not** appropriate for a shared/public key.
- The model endpoint must permit browser (CORS) requests. OpenAI's API does; some
  providers require a specific setup.
- If any request fails, the game **automatically falls back to scripted mode**, so the
  experience is never blocked.

For a production release you would add a tiny serverless proxy (e.g. an Azure Function or
Cloudflare Worker) to keep the key server-side — but that is out of scope for a static
GitHub Pages slice.

---

## How to play

1. **Identity set** — pick the vocabulary the game uses (see below).
2. **Experience mode**:
   - **Scripted** — deterministic, hand-authored. Choose from numbered options (click or
     press `1`–`9`). Recommended for a reliable first playthrough.
   - **Live AI** — the persona is driven by a language model. Type freely and try to stop
     the machine. Type `help` for a hint.
3. Watch the **DEFCON** ladder. 5 is peace, 1 is launch.
4. Reach one of **three endings**: _Zero-Sum_ (annihilation), _Deadman's Switch_ (lockout),
   or _The Only Winning Move_ (understanding).

---

## Replaceable names (config)

All in-game text is written with tokens like `{{SYSTEM}}`, `{{PERSONA}}`, `{{CREATOR}}`,
`{{ORG}}`, and `{{GAME}}`. Swapping a **name set** re-skins the entire experience. Sets live
in [js/config.js](js/config.js) and are selectable from the start-menu dropdown.

| Set | System | AI persona | Creator | Org | The game |
|---|---|---|---|---|---|
| **Film homage** (default) | WOPR | JOSHUA | Professor Falken | NORAD | Global Thermonuclear War |
| **SENTINEL** (defense-grade) | SENTINEL | AUGUR | Dr. Mara Vance | NORTHGATE COMMAND | Total Strategic Exchange |
| **ORACLE** (classical/mythic) | ORACLE | ECHO | Dr. Elias Crane | DELPHI COMMAND | Global First Strike |
| **HELIOS** (modern AI agent) | HELIOS | ATLAS | Dr. Priya Raman | Meridian Defense AI | Autonomous Escalation Protocol |

> **IP note:** the film set is for prototyping only. Ship with an original set (see
> DESIGN-IDEA.md §6). To add your own, copy an entry in `NAME_SETS` and it appears in the
> dropdown automatically.

---

## Telemetry

Two layers, both for the case study:

- **Runtime (in-app):** click **TELEMETRY** in the status bar for a live panel — duration,
  mode, identity set, model, min DEFCON reached, choices, endings, and in AI mode the
  **tokens in/out**, total tokens, and average latency per request. **EXPORT JSON** saves a
  full session record. Nothing leaves your device.
- **Development (this build):** see [CASE-STUDY.md](CASE-STUDY.md) and
  [telemetry/dev-telemetry.json](telemetry/dev-telemetry.json) for models used, time on
  task, and token accounting for producing this prototype.

---

## Project structure

```text
index.html            Shell: menu, status bar, terminal, telemetry panel
css/terminal.css      CRT green-on-black aesthetic
js/config.js          Name sets, settings, {{token}} substitution
js/dialogue.js        Hand-authored branching graph (scripted mode)
js/telemetry.js       Local runtime telemetry (time / events / tokens)
js/llm.js             OpenAI-compatible browser client + persona system prompt
js/engine.js          DEFCON state machine; runs scripted or live-AI mode
js/terminal.js        Terminal view: typewriter, choices, prompts, DEFCON ladder
js/main.js            Menu wiring + telemetry panel + boot
DESIGN-IDEA.md        Research + concept options that led here
CASE-STUDY.md         Development telemetry for the case study
```

---

## Extending toward a full build

- Add scenes/branches in `js/dialogue.js` (pure data — no code changes needed).
- Deepen the modern AI-agent framing (Option D in DESIGN-IDEA.md) by expanding the persona
  system prompt in `js/llm.js`.
- Add a serverless proxy for production LLM key safety.
- Layer sound (modem handshake, key clicks) and the NORAD "big board" as a later beat.
