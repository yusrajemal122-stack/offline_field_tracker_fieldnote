# Offline Field Issue Tracker

A field reporting app for infrastructure teams. It saves reports in the browser first, so a weak or missing connection does not prevent a worker from recording an issue.

## What is included

- Report capture with category, description, location, priority, status, and date/time.
- Local IndexedDB storage and an installable Progressive Web App shell.
- Automatic synchronization when the browser is online, plus a manual retry action.
- A SQLite-backed Express API with idempotent report IDs, status validation, and activity history.
- Dashboard counts, report list, and an activity timeline.
- Automated API storage and status-transition tests.

## Run it locally

Use Node.js 24 or newer and pnpm.

1. Install workspace dependencies:

   ```sh
   pnpm install
   ```

2. Generate the typed API clients and validators:

   ```sh
   pnpm --filter @workspace/api-spec run codegen
   ```

3. Start the API in one terminal:

   ```sh
   pnpm --filter @workspace/api-server run dev
   ```

4. Start the web app in a second terminal:

   ```sh
   pnpm --filter @workspace/offline-field-tracker run dev
   ```

The development API stores data in `data/offline-field-issue-tracker.sqlite` from the project root. Set `FIELD_TRACKER_DB_PATH` to use a different file. Keep the database file private; it is excluded from source control and the published code bundle.

Run the basic automated tests with:

```sh
pnpm --filter @workspace/api-server run test
```

The workspace type check is:

```sh
pnpm run typecheck
```

## How synchronization works

1. The browser creates a UUID and commits the report and its “created” activity to IndexedDB before showing it as saved.
2. A connection event or a manual retry starts synchronization. Each attempt is recorded locally first.
3. The browser sends the report to `PUT /api/reports/{id}/sync`. SQLite makes the report UUID a primary key, so repeating a request cannot create a second report or overwrite an already stored report.
4. Once the server confirms the report, the browser marks it synchronized locally. If a request fails, its report and failure history remain on the device and can be retried later.
5. Report status changes use `PATCH /api/reports/{id}/status`. The server checks every transition and records the change in the activity table.

The service worker caches the app shell and static files for offline reopening; report data itself stays in IndexedDB. API responses are not used as the only copy of a report.

## Assumptions and limitations

- Location is entered as text; GPS capture and maps are not required.
- Categories are a practical starter list and can be adjusted for a particular organization.
- Status changes follow Draft → Submitted → Assigned → In Progress → Resolved. Rejected is allowed from Submitted, Assigned, or In Progress. Resolved and Rejected are final. Status changes require a connection; report creation does not.
- This starter has no user accounts, team permissions, attachments, or multi-device conflict resolution.
- SQLite supports this starter's single API process. For a published deployment, configure the database path to a persistent writable volume; an ordinary app filesystem may be replaced during redeployment or scaling.
- PWA installation and service workers require HTTPS (or localhost). Browser storage can be cleared by the user or evicted by the browser, so keep the app open until the pending count reaches zero when possible.

## Manual test checklist

- [ ] Open the app once while online, then reload and confirm the shell loads.
- [ ] Add a report and confirm it appears in the list and activity history.
- [ ] Turn on airplane mode, create another report, refresh the page, and confirm it is still present as pending.
- [ ] Turn connectivity back on and confirm the report becomes synchronized without creating a duplicate.
- [ ] Stop the API while connected, create or retry a report, and confirm it is marked failed rather than disappearing; restart the API and retry.
- [ ] Try each allowed status transition and confirm the final statuses cannot move backward.
- [ ] Confirm the dashboard totals reflect all locally stored reports and their sync states.
- [ ] Open the app at tablet width and confirm the form, list, and controls remain usable.
- [ ] On an Android tablet, open the app over HTTPS in Chrome and use the browser's install option; verify an already loaded app can reopen offline.
