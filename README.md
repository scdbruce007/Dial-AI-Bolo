# Bolo: AI assistant over a call

Tap Talk and speak Hindi, Hinglish or English. One Sarvam voice agent does two jobs:
- **Questions:** asks Claude Haiku 5.5 (with web search) and reads out the answer.
- **Ather test ride:** asks only for what is missing, finds the nearest of 26 Bengaluru showrooms and saves a
  **mock** booking.

## How it fits together
```
judge   ──signed-URL request──► cloudflared ──► localhost:3002 (code + 30-call limit, adds key) ──► Sarvam
this Mac──signed-URL request──► localhost:3000 (no code, not counted, adds key) ───────────────► Sarvam
browser ◄────────────────── live audio over WebSocket ─────────────────► Sarvam agent
                                                                             │ API tools
                      localhost:3001 ◄── cloudflared (Sarvam IPs only) ◄─────┘
                        ├─ /tools/ask             Claude + web search
                        ├─ /tools/find-showroom   docs/bengaluru-showrooms.json
                        └─ /tools/book-test-ride  data/bookings.jsonl
```

## Run
1. `npm start`
2. `tools/cloudflared-download/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001`
3. **The tunnel URL changes on every restart.** Ask Claude Code to "update the tool URLs to <new URL>": it has to
   update find_showroom, book_test_ride and ask_claude on the agent, then commit a new version.
4. `tools/cloudflared-download/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3002`, then
   `node scripts/make-qr.js <that URL>`. The QR is `data/bolo-qr.png`, the link `data/bolo-link.txt`.
   Then ask Claude Code to republish `data/bolo-qr-page.html` to https://claude.ai/artifact/6c9EzyqbqJYr6gCZgC51ug, the page to show judges.
5. On this Mac, use http://localhost:3000

Never point a tunnel at port 3000: it has no code or limit.

## Public link limits
- 30 calls and 300 Claude questions, counted in `data/usage.json`. Reset with
  `echo '{"calls":0,"answers":0}' > data/usage.json` (no restart needed).
- A call is counted when it starts, even if it drops straight away.
- To cut off everyone who has the QR: delete `data/access-code`, restart the server, run `make-qr.js` again.

The Mac must be awake and online.

## Files
| Path | What |
|---|---|
| `server/guard.js` | code and limits for the public link |
| `server/server.js` | the three listeners, key-hiding route, tool access control |
| `server/answer.js` | Claude prompt, search, timeouts |
| `server/booking.js`, `server/areas.json` | nearest showroom, dates, hours, mock booking |
| `public/` | Talk page |
| `agent/prompt.md` | copy of the Sarvam prompt. Editing it does not change the live agent |
| `agent/agent.json` | Sarvam agent id |
| `data/` | logs and bookings, git-ignored |

`npm test` runs the booking tests.

## Limits
- Locality coordinates are approximate and distances are straight-line.
- Calls end after 5 minutes, or after three unanswered silence nudges.
