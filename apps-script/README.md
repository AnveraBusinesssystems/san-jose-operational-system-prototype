# Apps Script Backend

Copy `Code.gs` from this folder into your Google Apps Script project, then replace `PASTE_YOUR_SPREADSHEET_ID_HERE` with your real Google Sheet ID.

Important: `google.script.run` only works when the frontend is hosted by Apps Script HTML Service. If the frontend stays on GitHub Pages, use a deployed Apps Script Web App endpoint and a different fetch-based adapter.

Setup summary:

1. Open your Google Sheet.
2. Go to Extensions > Apps Script.
3. Create or replace `Code.gs` with the backend code.
4. Set `SPREADSHEET_ID`.
5. Save.
6. Run a small function once, such as `listProducts`, and approve permissions.
7. Deploy as a Web App if you want Apps Script to host the app.
