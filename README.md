# Calendar Weekly Time Report Chrome Extension

A Manifest V3 Chrome extension that connects to Google Calendar, reads one week's events, and turns them into a weekly time report.

## What it does
- Authenticates the user with Google using `chrome.identity`
- Calls the Google Calendar API `events.list` endpoint for the selected week
- Categorises time into meetings, focus, admin, health, travel, breaks, and all-day events
- Highlights total scheduled hours, meeting share, busiest day, longest event, and category context switches
- Lets the user define custom keyword rules such as `learning: course, study`
- Stores the last generated report locally and supports JSON export

## Files
- `manifest.json`: Extension manifest
- `background.js`: Auth, Calendar API calls, report generation, weekly alarm
- `popup.html` / `popup.js`: Extension UI
- `options.html`: Setup instructions

## How to run
1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder
4. Copy the extension ID
5. In Google Cloud Console, enable the Calendar API and create a Chrome Extension OAuth client
6. Paste the OAuth client ID into `manifest.json` under `oauth2.client_id`
7. Reload the extension and click **Connect Google Calendar**

## Privacy
The current version keeps data in the browser via Chrome storage and calls Google Calendar directly from the extension.

## Development note: stable extension ID

This project uses the `key` field in `manifest.json` so the unpacked extension keeps a stable ID across devices.
This is important because the Google OAuth client for a Chrome extension is tied to the extension ID.

Important:
- Keep the private key file local only.
- Do not commit `extension-key.pem`.
- Only the public key value belongs in `manifest.json`.

## Known limitations

- Version 1 currently works in Google Chrome.
- The extension currently focuses on weekly reporting rather than flexible date analysis.
- Category detection is rule-based and still fairly simple, so some events may be grouped imperfectly.
- Cross-browser support (for example Comet and other Chromium-based browsers) is not fully supported yet because the current authentication flow relies on Chrome-specific browser sign-in behavior.

## Planned improvements

### V2
- Custom date selection beyond the current 1-week view.
- Better reporting categories, including work, meetings, focus time, health, travel, admin, and personal events.

### Long-term roadmap
- Add tagging by colour, attendees, location, or working hours
- Comparison reporting, such as selected period vs previous period.
- Improved visual summaries and charts in the popup.
- More robust cross-browser support beyond Google Chrome.
- Push weekly digest emails or save snapshots in IndexedDB / backend storage
