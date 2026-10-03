# Photon test results (Round 1)

Setup: Spectrum Cloud, Free plan (shared number pool). `spectrum-ts` 12.10.1. Team phones registered as project users.
Each person texts a **different Photon number**, assigned from the pool.

| Feature | Status | Notes |
|---|---|---|
| Text in → reply out | ✅ works | Tested from 2 phones |
| Tapback (`message.react`) | ✅ works | Shows on the phone |
| Typing indicator (`space.responding`) | ✅ works | Shows on the phone |
| Receive a photo | ✅ works | Arrives as `type: "attachment"`, `image/heic` |
| **Text first** (`im.space.create(im.user(phone))`) | ✅ works | Scene 2 re-check is possible |
| **Send an image** (`attachment(path)`) | ✅ works | ~4.5s for a 400KB PNG |
| Several messages in a row | ✅ works | |
| Receive a location pin | ✅ works | Arrives as **text**, not an attachment: `https://maps.apple.com/place?coordinate=42.449927,-76.481858&name=Dropped%20Pin&span=…`. Parse it with `/coordinate=(-?[\d.]+),(-?[\d.]+)/` |
| Reply time | ~3.5s per echo | The tapback + typing + reply calls add up. Send the tapback first, without waiting on anything else |

Other things we noticed:
- `"read"` events (read receipts) also arrive through `app.messages`. Ignore anything that isn't `text`/`attachment`.
- `claude-sonnet-5` responses start with a `thinking` block. Read blocks where `type === "text"`, not `content[0]`.
