# QuickView for Salesforce

**See the attachment. Stay on the case.**

QuickView is a Chrome extension that adds a floating preview when you hover over a Salesforce file name. It is designed for the Files tab and related Files lists in Lightning, including the Service Console. Separately listed attachments under **Feed → Email** use the same hover preview.

**Version 0.0.1 · First development release · Manifest V3**

The concept and original browser-console prototype came from [@jorgestocker](https://github.com/jorgestocker), who gave permission to develop the idea into an extension. This repository contains a new implementation; it does not include or derive from his original JavaScript.

## In action

![Edited Salesforce Files screenshot with company logo, case numbers, and Source values masked, showing an illustrative QuickView hover preview](docs/images/quickview-salesforce-redacted.png)

*Cases → Files: based on the user-provided, pre-masked Salesforce screenshot. The company-logo, case-number, and Source masks are preserved. The added QuickView preview contains dummy data; this is an edited illustration.*

![Edited, pre-masked Salesforce Feed screenshot illustrating a QuickView preview above an email attachment named image.png](docs/images/quickview-salesforce-feed-redacted.png)

*Feed → Email: based on a user-provided Salesforce screenshot with existing privacy masks preserved. The added preview uses dummy data and appears above the attachment near the bottom of the viewport. This is an edited illustration; inline email-body images are excluded.*

---

## Get started

1. Download this repository, or extract the [release archive](dist/quickview-for-salesforce-0.0.1.zip) created by `npm run package`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the upper-right corner.
4. Click **Load unpacked** and select the **`extension/`** directory. If using the archive, select its extracted directory, which contains `manifest.json`.
5. Refresh your Salesforce tab. Open a case’s **Files** tab or **Files** related list, or an email’s attachment cards under **Feed**, and hover over a file name.
6. Pin QuickView in Chrome’s Extensions menu. Click its icon to open settings.

No Salesforce package, administrator installation, API token, or build step is required. Your existing Salesforce login supplies file access. Your organization may restrict browser extensions or file downloads.

## What it does

- Shows image previews on hover without changing the file link’s click behavior.
- Supports keyboard focus on recognized file links. Press **Esc**, move away, scroll, or change focus to dismiss.
- Positions the preview near the pointer and keeps it within the viewport.
- Recognizes dynamically inserted rows and email attachment cards, including attachments revealed by **Show all attachments**.
- Temporarily removes native `title` tooltips from the hovered row, then restores them.
- Saves preferences locally and applies changes to open Salesforce tabs.

### Preview support

| File / available metadata | Behavior |
| --- | --- |
| PNG, JPEG, GIF, WebP, BMP, AVIF identified by name or an image-type icon | Displays a Salesforce thumbnail if a version ID is available; otherwise loads the original image through your authenticated Salesforce session. |
| Salesforce-generated document thumbnail with a `068…` version ID in the row | Attempts the thumbnail. Its availability depends on Salesforce’s rendition generation. This includes PDF and other documents with an available image rendition. |
| Only a `069…` document ID and no recognized image type | Displays “Preview unavailable.” Click to open Salesforce’s normal viewer. |
| ZIP, CSV, or other files without a thumbnail | Displays the same fallback; does not download them to generate a preview. |
| Legacy `Attachment` records (`00P…`) identified as raster images | Attempts the original image through Salesforce’s legacy file-download route. Other legacy file types show the fallback. |
| SVG, video, audio | Original-file preview is not implemented. A supported existing thumbnail can still be displayed. |

**Live-org status:** Files-tab image previews and separately listed Feed → Email image attachments have been confirmed working in the project owner’s Salesforce Lightning org. Automated checks cover local fixtures, including the observed Aura attachment structure. Lightning markup varies between releases and org configurations; previews require a file reference in a recognized link, DOM attribute, or accessible Aura attachment metadata.

Salesforce’s Shepherd rendition URLs are **internal, unsupported endpoints** and may change. Salesforce also documents cross-domain authentication limitations for them. See [Salesforce’s guidance on internal rendition URLs](https://help.salesforce.com/s/articleView?id=005227037&language=en_US&type=1). QuickView uses these preview routes because private case attachments are not public CMS assets. It does not bypass permissions or create public sharing links.

Image-only fallback can load the **full original image**, so large images consume bandwidth and browser memory. Files are loaded only after the hover delay; there is no prefetching. Images are not copied into extension storage. Salesforce response caching follows the browser’s normal rules.

### Feed → Email attachments

Hover or keyboard-focus the name of a separately listed attachment. QuickView recognizes file links, attachment buttons, and IDs on the individual card. Each attachment is resolved independently; cards with missing metadata do not use a neighboring file’s ID. Normal attachment clicks and **Show all attachments** behavior are preserved.

Modern Files (`069…` / `068…`) follow the preview rules above. Older image attachments (`00P…`) use Salesforce’s file-download route. Inline body images do not activate a preview. Aura email tiles that expose only a filename and `data-index` use a read-only component adapter. It supports Feed capability attachment lists and Aura iteration entries where the wrapper contains `fileName` and the nested `attachment` contains the file ID. It checks the indexed attachment’s filename before accepting its file ID. If Salesforce restricts component access or uses an unsupported metadata shape, the card shows “Attachment reference unavailable”; it never guesses a neighboring attachment.

## Settings

Open the extension’s toolbar icon, or choose **Extension options** from its menu.

| Setting | Default | Available values |
| --- | --- | --- |
| Hover previews | On | On / off |
| Theme | System | System / Light / Dark |
| Preview size | 100% | 50–500%; 100% = 520 × 380 px |
| Hover delay | 250 ms | 0–1,500 ms |
| Preview animation | None | None / Fade in–out / Fall in / Scale up / Scale down |
| Corner radius | 12 px | 0–32 px |
| Border width | 1 px | 0–6 px |
| Border color | `#D5DBE7` | Any RGB color |
| Soft shadow | On | On / off |
| Show file name | On | On / off |
| Hide browser tooltips | On | On / off |

Animations are off by default. Fade, fall-in, and scale options animate both arrival and dismissal. Use **Replay animation** in settings to try the selected effect. The system’s reduced-motion preference disables these effects.

Settings save automatically. **Restore defaults** resets every preference. System theme follows your operating system. The live sample uses selectable masked Salesforce Files and Feed screenshots with an interactive dummy preview layered above them. These background assets are bundled locally. The sample uses the original 2560 px screenshot viewport as its reference and scales the entire card, including its text, padding, and borders; live previews scale from 520 × 380 px at 100% up to 2,600 × 1,900 px at 500%, limited to the viewport. Existing width/height preferences are converted to a percentage. Images preserve their aspect ratio and are never cropped.

Tooltip suppression applies to native browser `title` attributes. Salesforce-created popovers are separate UI elements and may still appear. Accessible labels and file clicks remain intact.

## Privacy & permissions

QuickView has no analytics, remote scripts, telemetry, backend, or third-party file uploads.

- **`storage`** stores preferences in `chrome.storage.local`, not synced storage.
- **Content script access** is limited to HTTPS Lightning (`*.lightning.force.com`), My Domain (`*.my.salesforce.com`), and `*.salesforce.mil` pages. It reads rendered file links and metadata and displays the preview.
- File requests go to Salesforce using your current browser session. The extension does not read cookies, access tokens, or Salesforce API credentials.
- It does not store file contents, names, or record IDs. No background file processing is performed.

The preview runs in Chrome’s [isolated content-script environment](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts). A small bundled adapter runs in the page world to read attachment metadata from the hovered Aura email component using Salesforce’s [component value-provider methods](https://github.com/forcedotcom/aura/blob/master/aura-impl/src/main/resources/aura/component/Component.js). Only validated file identifiers cross into the preview script; email contents and component objects are not copied or saved. Preview styles live in a shadow root to avoid interfering with Salesforce styles. No Salesforce JavaScript is patched or intercepted.

Custom Experience Cloud domains, Classic Visualforce file lists, closed shadow DOM components, and non-matching Salesforce hostnames are outside this release’s scope. A matching hostname does not guarantee compatible file markup.

## Try it locally

Requires Node.js 20+ and Python 3 for packaging or rebuilding icons.

```sh
npm install
npm run demo
```

Visit:

- `http://127.0.0.1:4173/` — Files and Feed email demo, including failed previews, unsupported files, dynamic rows, and attachment expansion.
- `http://127.0.0.1:4173/extension/settings.html` — Settings design with working local preferences.

The demo serves a sample illustration for Salesforce file URLs. It does not contact Salesforce. Its storage adapter is excluded from the extension package, and the extension manifest does not grant localhost access.

## Development & verification

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:extension
npm run package
```

To use an installed Chrome executable for browser checks:

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
```

The unit suite checks settings validation, file-ID parsing, safe preview URL selection, and manifest assets. The browser suite checks hover and focus behavior, tooltip restoration, failed loads, unsupported files, inserted/removed rows, stale requests, viewport placement, preferences, themes, and narrow layouts. It also checks Feed attachment cards, keyboard access, click preservation, expansion, legacy images, missing metadata, and inline-image exclusion. It writes settings screenshots to `test-results/`.

Recreate the local demo screenshots with `npm run screenshots` (or set `CHROME_PATH` as above). This captures the actual hover preview against fictional fixture data and writes PNGs to `docs/images/`. The edited Salesforce Files and Feed illustrations are separate curated assets and are not regenerated by this command.

The browser suite injects the production scripts into a fixture using a demo storage adapter. A separate `test:extension` smoke check loads the unpacked extension in Playwright Chromium, verifies real extension storage and options-page assets, and exercises manifest injection on locally fulfilled Salesforce-host fixture routes, including nested Aura attachment references, filename/index matching, and masked diagnostics; the automated tests do not contact a Salesforce org. Manual testing in the project owner’s org confirmed Files-tab and Feed email image previews. Other org configurations and file types still need their own validation.

`npm run package` creates `dist/quickview-for-salesforce-0.0.1.zip` containing only extension runtime files, ready to extract and load unpacked. It is not a signed Chrome Web Store package. Rebuild icon assets with `python3 scripts/icons.py`.

### Repository layout

```text
extension/     Manifest, content script, settings, toolbar action, bundled assets
demo/          Local Salesforce-style fixture and sample dashboard illustration
tests/         Unit checks and Playwright interaction checks
scripts/       Local server, reproducible packaging, icon renderer
docs/images/   README screenshots
```

## Troubleshooting

**No preview appears:** Confirm previews are enabled, reload the Salesforce page after installing/reloading the extension, and check that the file link is on a supported hostname. Hover the title, rather than the row background. Unsupported markup or a file link with no discoverable ID will not activate QuickView.

**“Attachment reference unavailable”:** QuickView recognized the Feed attachment tile but could not resolve its file ID from the component metadata. Use the diagnostic below to identify the available structure.

**“Image could not be loaded”:** QuickView resolved a reference but could not load a preview. The file may not have a rendition, its image type may not be discoverable, or your session/permissions may block loading. Click the file to use Salesforce’s viewer. If Salesforce’s own viewer fails, resolve that access issue first.

**Preview is blurry:** Enlarged raster-image previews prefer the original image, with a Salesforce thumbnail as fallback when version metadata is available. Document thumbnails are requested at 720 × 480. Scaling a thumbnail enlarges its pixels without adding detail.

**The tooltip still appears:** QuickView suppresses native browser titles; it does not disable Salesforce’s custom tooltip components.

**Settings changed but behavior did not:** Reload the extension and Salesforce tab. Changes normally update open tabs immediately. Existing content scripts become stale when an unpacked extension is reloaded.

For Aura Feed attachment troubleshooting, hover the failing attachment, then run `quickViewDiagnoseAttachment()` in the Salesforce page’s DevTools Console. The opt-in result reports component types, declared attribute names, readable metadata structure, attachment index, resolution status, and image-load stage. It masks string values and full record IDs and is never sent or saved automatically. Paste that result with a bug report to distinguish inaccessible metadata from a failed image request.

When reporting an issue, include Chrome version, Salesforce interface (Files tab, related list, or Feed email attachments), file type, and the link’s markup with sensitive values redacted. Do not include customer attachments, session cookies, access tokens, or case details.

## Project status

QuickView is an independent project, not affiliated with or endorsed by Salesforce. The name is provisional. See [CHANGELOG.md](CHANGELOG.md) for version history.

No distribution license has been selected yet; this repository does not currently grant an open-source license.
