# Dial AI - Bolo: AI assistant over a call

Tap Talk and speak Hindi, Hinglish or English. One Sarvam voice agent does two jobs:
- **Questions:** asks Claude Haiku 5.5 (with web search) and reads out the answer.
- **Ather test ride:** asks only for what is missing, finds the nearest of 26 Bengaluru showrooms and saves a
  **mock** booking.

## How it fits together
```
judge's browser ── code from QR link ──► Railway (30-call limit, adds key) ──► Sarvam signed URL
judge's browser ◄──────────────── live audio over WebSocket ────────────────► Sarvam agent
                                                                                   │ API tools
                                     Railway /tools/* (Sarvam IPs only) ◄──────────┘
                                       ├─ /tools/ask             Claude + web search
                                       ├─ /tools/find-showroom   docs/bengaluru-showrooms.json
                                       └─ /tools/book-test-ride  mock bookings on the /data volume
```

## Deploy
Railway project `dial-ai-bolo`, service `bolo`, volume at `/data`.
- Deploy: `railway up --service bolo --ci`
- Variables: `SARVAM_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, `ANTHROPIC_API_KEY`, `ACCESS_CODE`,
  `DATA_DIR=/data`, `COUNTER_ROUND`
- Reset the 30-call and 300-question counters: `railway variable set COUNTER_ROUND=<a new value> --service bolo`
- Change the code: set a new `ACCESS_CODE`, put the same value in `data/access-code`, run
  `node scripts/make-qr.js <the Railway URL>`, then republish the presenter page.

## On a laptop
`npm start` serves the Talk page at http://localhost:3000. The agent's tools run on Railway, so the page's result
cards stay empty locally. Never tunnel port 3000: it has no code or limit.

## Files
| Path | What |
|---|---|
| `server/guard.js` | code and limits for the public link |
| `server/server.js` | listeners (one on Railway, three on a laptop), key-hiding route, tool access control |
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
