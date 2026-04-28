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

## Suggested improvements
- Add charts with Chart.js in the popup
- Compare this week vs previous week
- Generate natural-language summaries via Gemini/OpenAI through a backend
- Push weekly digest emails or save snapshots in IndexedDB / backend storage
- Add tagging by colour, attendees, location, or working hours

## Privacy
The current version keeps data in the browser via Chrome storage and calls Google Calendar directly from the extension.
