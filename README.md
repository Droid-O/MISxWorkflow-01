# Concept Studio — Sela Venues

An AI concept generator built around my real creative workflow as Creative Account Manager / Art Director at MIS, managing the Sela venue accounts (Kingdom Arena, The Venue, RECC, Jeddah Superdome).

It plugs into my process at **two decision points**:

- **Stage 1 — Directions (before Pinterest):** Pick a venue, post type, and occasion. It returns 2–3 distinct creative directions — each with a clear visual direction, a "venue as hero" vs "event as hero" call, and final bilingual (EN + AR) headline and caption. I walk into the reference-gathering session with intent instead of browsing blindly.
- **Stage 2 — Build on references (after Pinterest):** Drop in the references I gathered (images or notes). It reads them, then produces one production-ready brief that adapts the reference to the right venue's identity and rules — visual direction, designer notes, and final copy in both languages, all in one place. No more rewriting copy after the handoff.
- **Monthly Plan — a full month of posts:** Pick a venue and month (and list any known events). It proposes the whole month's content as a calendar table — date, post type, concept, and the final EN/AR captions and hashtags for each — mapped to the fields in the venue's presentation template. Export as CSV to drop straight into the deck.

Each venue's tone profile and its real do's and don'ts are baked into the model's instructions (`venues.js`), so the output respects the rules that actually matter — e.g. Kingdom Arena never shows Al Hilal branding and keeps the arena (not the team) as the hero; Jeddah Superdome stays premium and zero-error; RECC stays formal and business-minded; The Venue takes the most creative risk.

---

## Use it

1. Open the app (locally or via the hosted link).
2. Click **⚙ Settings** and paste your Anthropic API key. It's stored only in your browser (localStorage) and sent directly to Anthropic — it never touches any other server. Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).
3. Pick a stage, a venue, fill in the brief, and **Generate**.

Default model is **Claude Opus 4.8** (best quality); switch to **Claude Sonnet 4.6** in Settings for faster, cheaper runs.

## Run locally

It's plain static files — no build step. Either:

- Open `index.html` directly in a browser, or
- Serve the folder: `python3 -m http.server` then visit `http://localhost:8000`.

## Host it (free, opens on phone or laptop)

Using GitHub Pages:

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose this branch and the `/ (root)` folder, save.
4. Your app is live at `https://<user>.github.io/<repo>/`.

The `.nojekyll` file is included so Pages serves the files as-is.

## Files

| File | What it is |
|------|------------|
| `index.html` | App structure |
| `styles.css` | Editorial dark theme |
| `app.js` | Form logic, image upload, streaming Claude calls, rendering |
| `venues.js` | The "brain" — venue knowledge, do's/don'ts, and the system prompt |

To tune the output as the accounts evolve, edit the venue rules and `SYSTEM_PROMPT` in `venues.js`. That single file is the creative IP.

## Notes

- Built with the Anthropic Messages API directly from the browser (`anthropic-dangerous-direct-browser-access`), which is appropriate for a personal, single-user tool. For a team/multi-user version, the API call should move behind a small backend so the key isn't in the browser.
- Stage 2 uses Claude's vision to read reference images; the images are sent only with that request and are not stored anywhere.
