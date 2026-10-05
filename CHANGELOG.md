# Changelog

All notable changes to QuickView for Salesforce are recorded here.

## [0.0.3] — 2026-10-05

- Render extensionless TXT/LOG/MD/XML/YAML files as native text using Type cells and concatenated size/type metadata; text formats never request image renditions. Prefer original raster images at all sizes and larger known thumbnails before small existing thumbnails.
- Add configurable dialog delay (1,000 ms default) and a dialog-preview toggle; expand both delay ranges to 5 seconds. Existing general hover preferences are preserved.
- Exclude checkbox, label, and selection-cell interactions; cancel pending or focused previews immediately on entry or pointer movement.
- Re-read local preferences when activating previews and returning to a Salesforce tab, so settings apply without page reloads even after a missed storage notification.
- Dialog delay overrides the general delay. Recognize additional Salesforce modal containers, wait for stored preferences before activation, and handle change events from settings controls.
- Observe viewport and document resizing as well as window resize events.
- Recognize file-picker types from adjacent metadata when titles omit extensions.
- Scale previews with both window dimensions, preserve media proportions when fitting height, and resize visible previews with the window.
- Update settings, documentation, and release archive to 0.0.3. Picker behavior is covered by local fixtures; live-org confirmation is still needed.

## [0.0.2] — 2026-10-02

### Fixed

- Replace the failing internal Aura preview-provider lookup with a same-origin UI record API request for `ContentDocument.LatestPublishedVersionId`. Validate the document identity and version prefix before requesting a thumbnail; report API status and metadata failures separately. PowerPoint hover previews are confirmed working in the project owner’s org.
- Metadata waits time out, dismissals detach pending listeners, and stale responses cannot replace another file’s preview.

### Added

- Targeted Files diagnostics list all matching record field names and masked reference shapes, avoiding the generic diagnostic’s 40-field display limit.

- First-page Salesforce rendition previews for PowerPoint (`ppt`, `pptx`), Word (`doc`, `docx`), Excel (`xls`, `xlsx`), and PDF; RTF/OpenDocument files attempt the same rendition route.
- CSV table excerpts, formatted JSON, and plain text previews for TXT, LOG, MD, XML, and YAML files. Reads stop at 256 KiB; excerpts are bounded and report truncation.
- Read-only Files-row Aura metadata lookup for a document’s matching latest version; records belonging to other files are ignored.
- Cancellation of pending text loads on dismissal, safe text-only rendering, and regression checks for parsing, byte limits, Office metadata, and archive exclusion.

### Changed

- ZIP and other archive previews are explicitly excluded and never request a rendition or original file.
- Extension manifest, settings version labels, npm package/lockfile, and release archive updated to 0.0.2.

### Limitations

- Office previews require an accessible version reference or existing rendition URL and a generated Salesforce thumbnail. They show the first page only; Office binaries are not parsed locally.
- Text previews require readable authenticated UTF-8 responses; cross-domain restrictions and org download policies can prevent access.
- Regression fixtures cover Office and text paths. PowerPoint hover previews are also confirmed in the project owner’s org; other Office formats still need live-org confirmation.

## [0.0.1] — 2026-10-02

### Fixed

- Resolve the confirmed Salesforce Feed email schema: `data.capabilities.emailMessage.attachments[index].attachment.id` and `aura:iteration` items with wrapper filenames and nested ContentVersion references. Preserve filename/index matching and use the resolved version for thumbnails.

- Aura attachment lookup discovers declared metadata attribute names through exported component-definition methods and inspects both owner and value-provider branches. Diagnostics now include component types and attribute names even when no values are readable.

- Distinguish unresolved attachment references from failed image loads; add explicit local Aura diagnostics that report metadata structure and load stage without email text, filenames, or full record IDs.

- Settings sample now uses the original screenshot viewport rather than resized asset pixels; card size, text, borders, and padding scale together using the same size calculation as live previews.
- Recognize Aura Feed email attachment tiles with `javascript:void(0)` links and `data-index`; resolve component-held file identifiers through a read-only page adapter, verify filenames, and show an unavailable state when metadata cannot be accessed. Confirmed working for separately listed email image attachments in the project owner’s Salesforce Lightning org.

### Added

- Settings live preview with selectable masked Salesforce Files and Feed screenshots and a separate interactive preview overlay.

- Single 50–500% preview-size slider (100% default) replacing width/height controls, with migration of existing preferences, larger viewport-fitted previews, and original-image preference when enlarged.

- Sticky settings header and footer with theme-aware fades as content scrolls behind them; the live preview stays below the header.

- README Feed email illustration based on the user-provided, pre-masked Salesforce screenshot, with a labeled dummy hover preview above an attachment.

- Git ignore rules for dependencies, release archives, test reports, coverage, local environment files, caches, and editor/OS artifacts.

- Refreshed README Cases → Files illustration using the user-provided, pre-masked screenshot, preserving logo, case-number, and Source masks and adding a labeled dummy QuickView preview.

- Feed → Email attachment-card previews for links and buttons, including recognized legacy raster-image attachments; inline email images are excluded.
- README screenshots captured from a working Salesforce-style demo with fictional case and email data.

- Optional fade, fall-in, scale-up, and scale-down preview animations, with no animation by default; reduced-motion support and settings replay control.

- Chrome Manifest V3 extension for Salesforce Lightning file links.
- Hover and keyboard-focus image previews with viewport-aware placement.
- Salesforce thumbnail support when a version ID or existing rendition URL is exposed in the DOM.
- Image-only original-file fallback and an unavailable state for unsupported or inaccessible files.
- Hover delay, preview dimensions, corner radius, border width/color, shadow, and file-name controls.
- Settings page with live sample preview, operating-system theme, explicit light/dark selection, automatic local saves, and default reset.
- Temporary native tooltip suppression with title restoration.
- Dynamic-row handling, stale-load protection, load timeout, and dismissal on Escape, scrolling, clicks, blur, and navigation removal.
- Local Salesforce-style demo, unit and browser checks, and reproducible ZIP packaging.
- Attribution to @jorgestocker for the concept and original console prototype; extension implementation written independently.

### Known limitations

- Files-tab and Feed email image previews are confirmed in the project owner’s org; broader org configurations and file types have not all been verified.
- Salesforce’s internal preview endpoints may change or fail under cross-domain policies.
- Document thumbnails require discoverable version metadata; original-file fallback is limited to recognized raster images.
- Native browser titles can be suppressed; Salesforce’s custom tooltips may still appear.
- Legacy non-image attachments, custom-domain Experience Cloud sites, and closed shadow DOM file links are not supported.
