# Development Plan: Timeline Review Interface

> **Generated from:** prd/timeline-review.md
> **Created:** 2026-03-21
> **Last synced:** 2026-03-21
> **Status:** Active Planning Document
> **VibeKanban Project ID:** f40c2bb3-89c2-41f7-aa66-5a17854a36c5

## Overview

Build a time-based recording review interface for ding-dong-ditch, replacing the default paginated grid with a horizontal timeline where recordings are plotted as colored blocks. Users select a camera, choose a time range, and scrub through a continuous timeline to review motion and doorbell events with inline video playback. The existing grid view is preserved as a "View All" screen.

## Tech Stack

- **Backend:** Express + TypeScript (existing, extended with 2 new endpoints)
- **Frontend:** React 19 + TypeScript + Vite (new components in existing SPA)
- **Database:** SQLite with better-sqlite3 (existing schema, no migrations)
- **Styling:** CSS (existing dark theme, extended)

---

## Completion Status Summary

| Epic | Status | Progress |
|------|--------|----------|
| 1. API & Data Layer | Not Started | 0% |
| 2. Timeline Component | Not Started | 0% |
| 3. Inline Video Player | Not Started | 0% |
| 4. Filters & Top Bar | Not Started | 0% |
| 5. Hover Previews | Not Started | 0% |
| 6. Navigation, Routing & Deep-Linking | Not Started | 0% |
| 7. Keyboard & Accessibility | Not Started | 0% |
| 8. Responsive & Polish | Not Started | 0% |

---

## Epic 1: API & Data Layer (NOT STARTED)

Add lightweight API endpoints optimized for timeline rendering and event counting, avoiding the overhead of full recording metadata for the timeline view.

### Acceptance Criteria

- [ ] Timeline endpoint returns lightweight recording metadata for a given camera and time range
- [ ] Counts endpoint returns motion/doorbell/total counts for the current filter
- [ ] Both endpoints respect existing auth middleware
- [ ] Existing API endpoints remain unchanged

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 1.1 | Timeline DB query | Add `queryTimelineRecordings()` to `src/db/recordings.ts` — returns id, timestamp, event_type, snapshot_key for a camera + time range, ordered by timestamp | High | S | — | <!-- vk:04bb9e5f-bc69-40e6-8eb8-97b90e00913c --> |
| 1.2 | Counts DB query | Add `countRecordingsByType()` to `src/db/recordings.ts` — returns `{ motion, doorbell, total }` for a camera + time range | High | S | — | <!-- vk:7d7daca2-b530-4661-8de0-2135cc886689 --> |
| 1.3 | Timeline API endpoint | Add `GET /api/recordings/timeline` with query params: camera, from, to, eventType. Returns array of lightweight recording objects | High | M | 1.1 | <!-- vk:977cebfa-8ea8-4674-9a22-1cae5188e703 --> |
| 1.4 | Counts API endpoint | Add `GET /api/recordings/counts` with query params: camera, from, to. Returns counts object | High | S | 1.2 | <!-- vk:4cc1fd79-84f7-428d-b7d1-ad7bf8872987 --> |
| 1.5 | API tests | Unit tests for both new DB queries and integration tests for both new endpoints | High | M | 1.3, 1.4 | <!-- vk:22a81899-2c86-4277-852c-9c796afae83b --> |

### Task Details

**1.1 - Timeline DB query**
- [ ] Function `queryTimelineRecordings(camera, from, to, eventType?)` exists in `src/db/recordings.ts`
- [ ] Returns only `id`, `timestamp`, `event_type`, `snapshot_key`, `path` (no description, size, etc.)
- [ ] Results ordered by `timestamp ASC`
- [ ] Optional `eventType` filter works correctly

**1.2 - Counts DB query**
- [ ] Function `countRecordingsByType(camera, from, to)` exists in `src/db/recordings.ts`
- [ ] Returns `{ motion: number, doorbell: number, total: number }`
- [ ] Counts are accurate against manual SQL verification

**1.3 - Timeline API endpoint**
- [ ] `GET /api/recordings/timeline?camera=X&from=ISO&to=ISO` returns 200 with array
- [ ] Missing `camera` or `from`/`to` returns 400
- [ ] Auth middleware protects the endpoint
- [ ] Response payload is lightweight (no description or size fields)

**1.4 - Counts API endpoint**
- [ ] `GET /api/recordings/counts?camera=X&from=ISO&to=ISO` returns 200 with `{ motion, doorbell, total }`
- [ ] Missing params returns 400
- [ ] Auth middleware protects the endpoint

**1.5 - API tests**
- [ ] DB query tests cover: empty results, motion-only filter, doorbell-only filter, mixed results
- [ ] Endpoint tests cover: valid requests, missing params, auth enforcement
- [ ] All tests pass with `npm test`

---

## Epic 2: Timeline Component (NOT STARTED)

Build the core horizontal timeline bar that renders recording events as colored blocks on a continuous time axis, with scrolling, scrubbing, and click-to-select.

### Acceptance Criteria

- [ ] Horizontal timeline bar renders at the bottom of the screen
- [ ] Recording blocks are color-coded by event type (motion vs doorbell)
- [ ] Timeline is scrollable/draggable horizontally
- [ ] Clicking a block selects that recording
- [ ] Clicking empty space shows an empty state (no jump to nearest)
- [ ] A "now" indicator is visible on the timeline
- [ ] Time markers are labeled adaptively based on the visible range

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 2.1 | TimelineBar component shell | Create `TimelineBar.tsx` with fixed-bottom layout, time axis rendering with adaptive markers, and "now" indicator | High | L | — | <!-- vk:d2cfad8d-32d2-4ab2-a987-c583ba23d683 --> |
| 2.2 | Recording blocks rendering | Render recording events as colored blocks (motion=blue/gray, doorbell=orange) with minimum visible width, positioned by timestamp on the time axis | High | L | 2.1 | <!-- vk:ad324620-9785-489b-8cd6-a2aae575b95c --> |
| 2.3 | Timeline scrolling & dragging | Implement horizontal scroll and mouse-drag to navigate the timeline, with momentum/inertia | High | M | 2.1 | <!-- vk:5738e1f2-1d72-483d-9fdc-1bda9321d2ae --> |
| 2.4 | Click-to-select interaction | Clicking a recording block selects it and emits selection event; clicking empty space clears selection | High | M | 2.2 | <!-- vk:5489b95d-cc8f-43f7-a0f8-d2731a2d4e8e --> |
| 2.5 | Scrubber line | Vertical indicator line showing the currently selected recording's position on the timeline | Medium | S | 2.4 | <!-- vk:c35428b7-a961-40ac-9ddb-0e46b091f0e5 --> |
| 2.6 | useTimeline hook | Create `useTimeline.ts` hook that fetches timeline data from API, manages time range state, selected recording, and provides computed block positions | High | L | 1.3 | <!-- vk:55ad2bd0-5f4c-4bbe-b983-574750014c5e --> |
| 2.7 | Adaptive zoom | Timeline zoom level adjusts automatically based on the selected time range (1h vs 24h vs 7d) with appropriate marker intervals | Medium | M | 2.1, 2.6 | <!-- vk:08c9d9b5-7696-4e22-9635-790b33f05169 --> |

### Task Details

**2.1 - TimelineBar component shell**
- [ ] Component renders a fixed-bottom bar with dark theme styling
- [ ] Time axis shows labeled markers (e.g., "7:00 AM", "7:30 AM") at appropriate intervals
- [ ] "Now" indicator (vertical line or marker) renders at the current time position
- [ ] Bar has appropriate height (~80-100px) and spans full width

**2.2 - Recording blocks rendering**
- [ ] Blocks render at correct positions based on timestamp relative to the time range
- [ ] Motion events use a distinct color from doorbell events
- [ ] Blocks have a minimum width (e.g., 8px) so short clips are visible and clickable
- [ ] Overlapping/adjacent blocks don't merge — each is individually identifiable

**2.3 - Timeline scrolling & dragging**
- [ ] Mouse wheel scrolls the timeline horizontally
- [ ] Click-and-drag pans the timeline
- [ ] Scrolling stays within the bounds of the selected time range
- [ ] Interaction feels smooth (no jank or lag with 100+ blocks)

**2.4 - Click-to-select interaction**
- [ ] Clicking a recording block calls `onSelect(recording)` callback
- [ ] Clicking empty space calls `onSelect(null)` — clear selection
- [ ] Selected block has a visual highlight (border, glow, or brightness change)

**2.5 - Scrubber line**
- [ ] Vertical line appears at the selected recording's timestamp position
- [ ] Line is visually distinct from the "now" indicator
- [ ] Line disappears when no recording is selected

**2.6 - useTimeline hook**
- [ ] Fetches from `/api/recordings/timeline` with current camera, from, to, eventType
- [ ] Exposes: `recordings`, `loading`, `error`, `selectedRecording`, `setSelectedRecording`, `timeRange`, `setTimeRange`
- [ ] Re-fetches when camera, time range, or event type filter changes
- [ ] Computes block positions (x-offset, width) based on time range and container width

**2.7 - Adaptive zoom**
- [ ] 1-hour range → markers every 5 minutes
- [ ] 24-hour range → markers every 1 hour
- [ ] 7-day range → markers every 6 hours or every day
- [ ] Marker density adjusts to avoid overlapping labels

---

## Epic 3: Inline Video Player (NOT STARTED)

Replace the modal-based video playback with an inline player in the main content area, showing metadata and navigation controls.

### Acceptance Criteria

- [ ] Video plays inline in the main content area (no modal)
- [ ] Auto-plays when a recording is selected
- [ ] Shows recording metadata (camera, timestamp, event type, AI description, size)
- [ ] Previous/next navigation steps through recordings sequentially
- [ ] Delete removes the recording and returns to empty state
- [ ] Empty state shows instructional prompt when no recording is selected

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 3.1 | TimelinePlayer component | Create `TimelinePlayer.tsx` — large inline video player with HTML5 video element, auto-play on source change | High | M | 2.4 | <!-- vk:178703ae-b5b4-4547-b46e-37c86918865d --> |
| 3.2 | Recording metadata panel | Display camera name, timestamp, event type badge, AI description, and file size alongside the video | High | S | 3.1 | <!-- vk:289f3292-c731-4669-b83b-2d41c0d0a52b --> |
| 3.3 | Previous/Next navigation | Buttons to step through recordings sequentially based on the timeline data | High | M | 3.1, 2.6 | <!-- vk:76f2fdea-9085-49a6-acb6-d5775f41a9ff --> |
| 3.4 | Delete with confirmation | Delete button with confirmation dialog; on delete, removes recording from timeline and returns to empty state | High | M | 3.1, 2.6 | <!-- vk:503fe16d-c9d5-4bcd-af91-0098c11442c3 --> |
| 3.5 | Empty state / Instructions | Show a prompt ("Select a recording from the timeline below to start reviewing") when no recording is selected | Medium | S | 3.1 | <!-- vk:1c9ae676-cbed-4203-bdcb-37b32b6cb414 --> |

### Task Details

**3.1 - TimelinePlayer component**
- [ ] Video element fills the main content area proportionally
- [ ] Video auto-plays when `selectedRecording` changes (new source loaded)
- [ ] Standard browser controls visible (play/pause, volume, fullscreen)
- [ ] Handles missing/errored video gracefully (error state with message)

**3.2 - Recording metadata panel**
- [ ] Camera name displayed prominently
- [ ] Timestamp shown in human-readable format (e.g., "Mar 21, 2026 at 7:45 AM")
- [ ] Event type badge (doorbell/motion) with distinct styling
- [ ] AI description shown if available, hidden if null
- [ ] File size displayed in human-readable format (KB/MB)

**3.3 - Previous/Next navigation**
- [ ] "Previous" button selects the recording before the current one (by timestamp)
- [ ] "Next" button selects the recording after the current one
- [ ] Buttons disabled at the boundaries (first/last recording in range)
- [ ] Timeline scrubber updates to reflect the new selection

**3.4 - Delete with confirmation**
- [ ] Clicking delete shows a confirmation dialog (not just browser confirm — styled)
- [ ] Confirming delete calls `DELETE /api/recordings/:date/:camera/:file`
- [ ] Recording is removed from the timeline data
- [ ] Player returns to empty/instructions state after deletion
- [ ] Error handling for failed deletes (toast or inline error)

**3.5 - Empty state / Instructions**
- [ ] Renders when no recording is selected (initial load, after delete, after clearing selection)
- [ ] Shows an icon and instructional text
- [ ] Consistent with existing dark theme

---

## Epic 4: Filters & Top Bar (NOT STARTED)

Build the top bar with camera selector, time range presets, and event type filter with live counts.

### Acceptance Criteria

- [ ] Camera selector shows all available cameras and switches the timeline
- [ ] Time range presets (Last Hour, Last 24h, Last 7 Days, Custom) update the timeline
- [ ] Event type filter (All, Doorbell, Motion) filters timeline blocks and shows counts
- [ ] Last-selected camera is persisted in localStorage

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 4.1 | TimelineTopBar component | Create `TimelineTopBar.tsx` shell with layout for camera selector, time range, event filters | High | S | — | <!-- vk:2e97e381-b5d6-4e70-8cf9-ae94c29d1099 --> |
| 4.2 | Camera selector | Dropdown that fetches cameras from `/api/recordings/cameras`, persists selection in localStorage | High | M | 4.1, 2.6 | <!-- vk:40a4baf9-eeb3-44c7-856c-2733bf5c7410 --> |
| 4.3 | Time range presets | Buttons/chips for Last Hour, Last 24h, Last 7 Days, Custom (with date-time picker) | High | M | 4.1, 2.6 | <!-- vk:8cc7edce-686b-4cfd-adb1-d5f30e4e9b16 --> |
| 4.4 | Event type filter with counts | Filter tabs (All, Doorbell, Motion) that show counts from `/api/recordings/counts` and filter the timeline | High | M | 4.1, 1.4, 2.6 | <!-- vk:014b2fb9-3d37-447f-83fd-6ec884814ebf --> |
| 4.5 | Active filter chips | Visual chips showing currently active filters, consistent with existing FilterBar styling | Low | S | 4.2, 4.3, 4.4 | <!-- vk:2848608a-8c80-4a0a-b511-c1f9d44d36dd --> |

### Task Details

**4.1 - TimelineTopBar component**
- [ ] Renders a top bar with slots for camera selector, time range, and event filters
- [ ] Dark theme styling consistent with existing app header
- [ ] Responsive layout (items wrap on smaller screens)

**4.2 - Camera selector**
- [ ] Fetches camera list from `/api/recordings/cameras` on mount
- [ ] Displays current camera name
- [ ] Dropdown allows switching; triggers timeline data reload
- [ ] Persists last-selected camera in `localStorage`; restores on page load
- [ ] Defaults to first camera if no localStorage value

**4.3 - Time range presets**
- [ ] Four preset buttons: Last Hour, Last 24 Hours (default), Last 7 Days, Custom
- [ ] Active preset has visual highlight
- [ ] Custom opens a date-time range picker (from/to)
- [ ] Selecting a preset updates `timeRange` in `useTimeline` hook and triggers re-fetch

**4.4 - Event type filter with counts**
- [ ] Three tabs/chips: All, Doorbell, Motion
- [ ] Each shows count from `/api/recordings/counts` for current camera + time range
- [ ] Selecting a filter updates the timeline to show only matching events
- [ ] Counts refresh when camera or time range changes

**4.5 - Active filter chips**
- [ ] Shows chips for non-default filters (e.g., "Camera: Front Door", "Doorbell Only")
- [ ] Each chip has a dismiss/clear button
- [ ] Clearing a chip resets that filter to default

---

## Epic 5: Hover Previews (NOT STARTED)

Add tooltip popups when hovering over recording blocks on the timeline, showing snapshot thumbnails and metadata.

### Acceptance Criteria

- [ ] Hovering a timeline block shows a preview popup above the timeline
- [ ] Preview includes snapshot thumbnail (or fallback), timestamp, event type, and description snippet
- [ ] Preview appears/disappears smoothly with a debounce delay

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 5.1 | HoverPreview component | Create `HoverPreview.tsx` — positioned tooltip showing snapshot, timestamp, event type, description | Medium | M | 2.2 | <!-- vk:67d56e12-de52-4cd0-a473-18e842014f88 --> |
| 5.2 | Snapshot thumbnail loading | Load snapshot image from `/api/recordings/:date/:camera/:file` (snapshot_key), with placeholder fallback for missing snapshots | Medium | M | 5.1 | <!-- vk:813a85c7-eb54-43d7-ac49-97735711776d --> |
| 5.3 | Debounced show/hide | Add hover delay (~200ms) before showing preview, immediate hide on mouse leave, prevent flicker on rapid mouse movement | Medium | S | 5.1 | <!-- vk:372921ac-1a8d-455c-a7d1-4c29ee3cde99 --> |

### Task Details

**5.1 - HoverPreview component**
- [ ] Renders a tooltip-style popup positioned above the hovered block
- [ ] Shows: thumbnail area, timestamp, event type badge, description text (truncated to ~100 chars)
- [ ] Popup stays within viewport bounds (doesn't overflow screen edges)
- [ ] Dark theme styling with subtle shadow/border

**5.2 - Snapshot thumbnail loading**
- [ ] Loads snapshot image using the recording's `snapshot_key`
- [ ] Shows a placeholder icon (camera or event type icon) when `snapshot_key` is null
- [ ] Handles image load errors gracefully (falls back to placeholder)

**5.3 - Debounced show/hide**
- [ ] Preview appears after ~200ms hover delay (not instant)
- [ ] Preview disappears immediately on mouse leave
- [ ] Rapid mouse movement across blocks doesn't cause flickering
- [ ] Only one preview visible at a time

---

## Epic 6: Navigation, Routing & Deep-Linking (NOT STARTED)

Wire up the timeline view as the default recordings screen, preserve the grid view as "View All", and support URL deep-linking to specific recordings.

### Acceptance Criteria

- [ ] `#/recordings` loads the timeline view (new default)
- [ ] `#/recordings/all` loads the existing grid view
- [ ] "View All" button in timeline view navigates to grid view
- [ ] Selecting a recording updates the URL hash for deep-linking
- [ ] Loading a deep-link URL selects and auto-plays the referenced recording

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 6.1 | Route setup | Update hash router: `#/recordings` → TimelineView, `#/recordings/all` → existing RecordingsTab | Medium | M | 2.1, 3.1, 4.1 | <!-- vk:02bbe67a-159c-4bf0-a8e2-210cca24c3b1 --> |
| 6.2 | View toggle button | Add "View All" button/link in timeline top bar to navigate to grid view | Medium | S | 6.1 | <!-- vk:ee2bc217-d5da-447e-bae1-f49a70830918 --> |
| 6.3 | Deep-link selected recording | Update URL hash when selecting a recording (e.g., `#/recordings?id=123`); on page load, parse hash and auto-select/play that recording | Medium | M | 6.1, 2.6 | <!-- vk:1e6a8d1b-6b8e-4e6b-af9b-32d7a00e6568 --> |
| 6.4 | Shared filter state | Camera and time range selections sync between timeline and grid views via URL params or shared state | Low | M | 6.1, 4.2, 4.3 | <!-- vk:dde145b8-a046-4ac5-8444-d1a939fbc7d9 --> |

### Task Details

**6.1 - Route setup**
- [ ] `#/recordings` renders the new `TimelineView` component
- [ ] `#/recordings/all` renders the existing `RecordingsTab`
- [ ] Navigation between views works without full page reload
- [ ] Default tab/link in the app navigation points to `#/recordings`

**6.2 - View toggle button**
- [ ] "View All" button visible in the timeline top bar
- [ ] Navigates to `#/recordings/all`
- [ ] Grid view has a "Timeline" button to navigate back to `#/recordings`

**6.3 - Deep-link selected recording**
- [ ] Selecting a recording updates the URL (e.g., `#/recordings?id=123`)
- [ ] Clearing selection removes the `id` param
- [ ] Loading page with `?id=123` auto-fetches that recording's data, scrolls timeline, and auto-plays
- [ ] Invalid or deleted recording ID shows empty state gracefully

**6.4 - Shared filter state**
- [ ] Camera selection persists when switching between timeline and grid views
- [ ] Time range / event type filter is reflected in URL params where applicable
- [ ] Switching views doesn't lose the user's current filter context

---

## Epic 7: Keyboard & Accessibility (NOT STARTED)

Add keyboard navigation and ARIA support for screen readers and power users.

### Acceptance Criteria

- [ ] Left/Right arrows navigate between recordings
- [ ] Space plays/pauses the video
- [ ] Escape clears selection
- [ ] Timeline blocks have ARIA labels
- [ ] Focus indicators are visible on all interactive elements

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 7.1 | Keyboard shortcuts | Left/Right arrows for prev/next recording, Space for play/pause, Escape for deselect | Medium | M | 3.3 | <!-- vk:cf8a8d42-a0dd-4327-b3ec-1575db9c8c3f --> |
| 7.2 | ARIA labels & roles | Add ARIA labels to timeline blocks, buttons, and regions; role="slider" for timeline, role="region" for player | Medium | M | 2.2, 3.1 | <!-- vk:6bd3e254-23f8-456a-9a6c-d45c8817f109 --> |
| 7.3 | Focus management | Visible focus indicators on all interactive elements; focus moves logically (top bar → player → timeline) | Medium | S | 7.2 | <!-- vk:739b74f2-fd6f-48bf-b49d-65f5e8b6d961 --> |

### Task Details

**7.1 - Keyboard shortcuts**
- [ ] Left arrow selects previous recording; Right arrow selects next
- [ ] Space toggles video play/pause
- [ ] Escape clears the selected recording (returns to empty state)
- [ ] Shortcuts only active when timeline view is focused (don't conflict with other inputs)

**7.2 - ARIA labels & roles**
- [ ] Each timeline block has `aria-label` (e.g., "Motion event at 7:45 AM")
- [ ] Timeline bar has `role="slider"` or appropriate landmark role
- [ ] Player region has `role="region"` with `aria-label="Video player"`
- [ ] Filter buttons have descriptive labels

**7.3 - Focus management**
- [ ] Focus ring visible on all interactive elements (buttons, blocks, controls)
- [ ] Tab order follows logical flow: top bar → main content → timeline
- [ ] Focus does not get trapped in any component

---

## Epic 8: Responsive & Polish (NOT STARTED)

Ensure the timeline view works well across screen sizes, add smooth animations, and handle edge cases.

### Acceptance Criteria

- [ ] Timeline view is usable on screens down to 768px width
- [ ] Animations are smooth (block transitions, preview show/hide, selection changes)
- [ ] Empty time ranges show a friendly message
- [ ] Loading states are clear and non-jarring
- [ ] Touch drag works on tablet devices

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 8.1 | Responsive layout | Timeline bar and top bar adapt to narrower screens; metadata panel stacks below video on small screens | Low | M | 2.1, 3.1, 4.1 | <!-- vk:2465f4a0-9fa3-4a73-9eb2-c9c2cf1afc6a --> |
| 8.2 | Smooth animations | CSS transitions for block hover states, selection changes, preview show/hide, and filter transitions | Low | M | 2.2, 5.1 | <!-- vk:ec92a058-b8c0-43b3-bad3-89590274602d --> |
| 8.3 | Empty & loading states | Skeleton/spinner for timeline loading; friendly empty state for time ranges with no recordings | Medium | S | 2.6 | <!-- vk:b50a17d8-86d5-46a4-a9bc-d623a12e853a --> |
| 8.4 | Touch support | Touch drag for timeline scrolling on tablets; tap-to-select works correctly | Low | M | 2.3 | <!-- vk:50111128-1d50-4cb7-bd3c-fef2274f4b9c --> |
| 8.5 | Error handling | Graceful handling of API errors, video load failures, and network issues with user-visible feedback | Medium | S | 2.6, 3.1 | <!-- vk:256cf5cd-9c4b-4418-83f1-f259a25c37ac --> |

### Task Details

**8.1 - Responsive layout**
- [ ] At 768px width, all elements remain usable (no horizontal overflow or overlapping)
- [ ] Metadata panel moves below video on narrow screens
- [ ] Top bar filters wrap rather than overflow
- [ ] Timeline bar maintains full width with adjusted marker density

**8.2 - Smooth animations**
- [ ] Block hover: subtle scale or brightness change (~150ms)
- [ ] Selection change: scrubber line animates to new position
- [ ] Preview popup: fade in/out (~200ms)
- [ ] No animations cause layout shifts or jank

**8.3 - Empty & loading states**
- [ ] Timeline shows a skeleton or spinner during data fetch
- [ ] Empty time range shows "No recordings in this time range" with suggestion to adjust filters
- [ ] Loading-to-loaded transition is smooth (no flash of empty state)

**8.4 - Touch support**
- [ ] Touch drag scrolls the timeline on touch devices
- [ ] Single tap on a block selects the recording
- [ ] No conflict between scroll and tap gestures
- [ ] Touch drag feels natural with momentum

**8.5 - Error handling**
- [ ] API fetch error shows inline error message with retry button
- [ ] Video load failure shows error state in player area
- [ ] Network timeout handled gracefully (not silent failure)

---

## Dependencies

- Existing recordings API (`GET /api/recordings`, `GET /api/recordings/cameras`, `DELETE /api/recordings/:date/:camera/:file`)
- Existing snapshot infrastructure (`snapshot_key` field and serving endpoint)
- Existing auth middleware (password-based, cookie auth)
- Existing dark theme CSS variables and patterns

## Out of Scope

- Live camera streaming
- Continuous recording playback (only event-based clips)
- Multi-camera side-by-side comparison
- Recording annotation or editing
- Push notifications
- "Reviewed" marking (deferred — no DB column)
- Bulk operations in timeline view (kept in grid view only)

## Open Questions

- [ ] Should recording `duration` be extracted from video metadata in a future phase for richer timeline blocks?
- [ ] Should the timeline support pinch-to-zoom on touch devices, or are the presets sufficient?

## Related Documents

| Document | Purpose | Status |
|----------|---------|--------|
| prd/timeline-review.md | Product Requirements | Current |
| view.png | Frigate NVR reference screenshot | Reference |

---

## Changelog

- **2026-03-21**: Generated 43 VibeKanban issues (8 epics + 35 tasks) and linked to plan
- **2026-03-21**: Initial development plan created from PRD
