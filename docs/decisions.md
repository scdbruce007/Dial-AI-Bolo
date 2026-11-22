# Decisions (22 Nov 2026)
Imported from the claude.ai project "TPF Buildathon Nov 2026" and the Claude Code session that followed.

- Chose problem #2 (voice assistant) over #1 (cross-country landed-price comparison for iPhones): stronger live
  demo, data under our control.
- The claude.ai chat built a clinic agent (Sehat Saathi: Vapi, Twilio, Deepgram, GPT-4o-mini) before the use case
  was agreed. Dropped by Suyash; zip and README deliberately not imported.
- Suyash has Sarvam credits, so Sarvam is the voice stack. LiveKit was considered and rejected by Suyash.
- Browser calling is acceptable if it runs on the judge's own device. Present a phone number as the next step.
- Earlier note "Indian numbers need company KYC" was too broad: Sarvam also lists individual KYC. Not needed today.
- Test-ride booking is a mock for now (no public Ather booking API known): save it, show it on screen, and call it
  a mock in the pitch.
- Showrooms are Bengaluru only, as exhaustive as possible: 23 in the city plus 3 on the outskirts (Devanahalli,
  Hoskote, Bidadi), in `docs/bengaluru-showrooms.json`. "Nearest" is matched from the caller's area.
- Public link (Suyash, 22 Nov): secret code in the QR link and a 30-call limit. Calls end at 5 minutes.

## Sarvam docs
- MCP: https://docs.sarvam.ai/voice-agents/mcp.md
- Web SDK: https://docs.sarvam.ai/voice-agents/deploy/sdks/web.md
- API tool: https://docs.sarvam.ai/voice-agents/build/tools/https-tool.md
