# SF Permission Set Comparator

A Chrome extension that compares a Salesforce **Permission Set** side by side
between any two orgs you're logged into — no API tokens, no Connected App
setup, no copy-pasting XML. Click the toolbar icon, pick two orgs and a
permission set, and get a full diff broken out by category.

## Why

Comparing a permission set between sandbox and production (or between two
sandboxes) usually means exporting metadata, diffing XML by hand, or
manually clicking through the Setup UI page by page. This extension reads
the sessions you already have open in Chrome and does the comparison for
you in a couple of clicks.

## Features

- **Zero-setup org detection** — finds every Salesforce org you're
  currently logged into (production and sandboxes) by reading session
  cookies already in the browser, validates each session against the REST
  API, and labels it with the org name and type.
- **Full permission set diff**, covering:
  - App Permissions vs. System Permissions (split automatically — see
    [`app-permissions.js`](#app-permissionsjs))
  - Object permissions — Create / Read / Edit / Delete / View All / Modify All
  - Field-level security — Read / Edit
  - Tab visibility settings
  - Assigned Apps and Connected Apps
  - Apex Class and Visualforce Page access
  - Flow access
  - Named Credentials / External Credentials
  - Custom Permissions
  - Custom Metadata Types and Custom Settings
  - Data Category visibility, Service Presence Statuses, Org-Wide Email
    Addresses, and other Setup Entity Access grants
- **Matrix view** — one row per item, both orgs' values side by side, with
  differing cells shaded so they're easy to scan.
- **Show differences only, or everything** — toggle between a diff-only
  view and a full listing of every grant in both orgs.
- **Live search/filter** across all result tables.
- **Standalone HTML export** — download a self-contained report (styling
  included) to share or archive.
- **Handles Salesforce API quirks under the hood**: paginated queries,
  batching `Permissions*` field lists to avoid URL-length limits, resolving
  IDs to names via multiple fallback objects (including the Tooling API),
  and disambiguating permission sets that share a name across namespaces.

## Privacy & security

The extension only reads the `sid` session cookie for domains matching
`*.salesforce.com`, `*.force.com`, and `*.cloudforce.com`, and uses it to
call the Salesforce REST API directly from your browser tab. Nothing is
sent anywhere except Salesforce's own servers — there's no backend, no
analytics, and no storage of credentials.

## Installation (unpacked / developer mode)

1. Clone or download this repository.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Log into the Salesforce orgs you want to compare in other tabs, as
   usual.

## Usage

1. Click the extension's toolbar icon — it opens the comparator in a new
   tab.
2. Choose two orgs from the dropdowns (every logged-in org is detected
   automatically; click **Refresh orgs** if you log into a new one after
   opening the tab).
3. Start typing a permission set name and pick it from the list.
4. Click **Compare permission set**.
5. Use the search box to filter results, toggle **Show everything** to see
   non-differing grants too, and click **Download report** to export a
   standalone HTML copy.

## Project structure

```
.
├── manifest.json          Extension manifest (MV3)
├── background.js          Opens comparator.html in a new tab on icon click
├── comparator.html         UI shell
├── comparator.js           Org detection, REST calls, comparison logic, rendering
├── app-permissions.js       Classifies permissions as "App" vs "System"
├── label-overrides.js       Manual label corrections for legacy fields
└── icons/                  Toolbar icons (16/48/128px)
```

## Customization

### `app-permissions.js`

Salesforce's Setup UI splits permissions across two pages — "App
Permissions" and "System Permissions" — but the API exposes them as one
flat list. This file decides which permissions are treated as App
Permissions (everything else falls under System Permissions), matched by
either the display label or the API name. Entries that don't exist in your
org are simply ignored, so it's safe to keep a superset here.

### `label-overrides.js`

The extension shows Salesforce's own field labels by default, which match
the Setup UI almost everywhere. If you find a legacy field whose label
deviates from what Setup shows, add a correction here:

```js
const LABEL_OVERRIDES = {
  EditPublicFilters: "Manage Public List Views",
};
```

## Requirements

- Chrome (Manifest V3)
- `cookies` permission, and host permissions for `*.salesforce.com`,
  `*.force.com`, and `*.cloudforce.com`

## Limitations

- Only compares **Permission Sets** that aren't owned by a profile
  (`IsOwnedByProfile = false`); Profile-based comparisons aren't supported.
- Relies on active browser sessions — if a session has expired, log back
  into that org in another tab and click **Refresh orgs**.
- Some Setup Entity types don't have a directly queryable name field and
  are resolved via fallback objects or the Tooling API; in rare cases a
  grant may display as its raw ID if none of the fallbacks resolve it.

## License

Add a license of your choice (e.g. MIT) before publishing this
repository publicly.
