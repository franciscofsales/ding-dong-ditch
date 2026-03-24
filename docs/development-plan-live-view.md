# Development Plan: Live Camera View

> **Generated from:** docs/prd-live-view.md
> **Created:** 2026-03-24
> **Last synced:** 2026-03-24
> **Status:** Active Planning Document
> **VibeKanban Project ID:** f40c2bb3-89c2-41f7-aa66-5a17854a36c5

## Overview

Add real-time live camera viewing to ding-dong-ditch. The server pipes a Ring camera's WebRTC stream through ffmpeg to produce fMP4 chunks, sent over WebSocket to the browser where MediaSource Extensions render them in a `<video>` element. The UI integrates into the existing timeline view with a "Go Live" button, a pulsing live indicator on the timeline, and seamless scrub-to-live transitions.

## Tech Stack

- **Backend:** Node.js + Express (existing) + `ws` WebSocket + Ring SDK + ffmpeg
- **Frontend:** React + TypeScript (existing) + MediaSource Extensions (native)
- **Database:** No changes
- **New Dependencies:** `ws` (server), `@types/ws` (dev)

---

## Completion Status Summary

| Epic | Status | Progress |
|------|--------|----------|
| 1. Server Live Stream Pipeline | Not Started | 0% |
| 2. Client Live Player | Not Started | 0% |
| 3. Timeline Live Integration | Not Started | 0% |
| 4. Scrub ↔ Live Interaction | Not Started | 0% |
| 5. Testing & Polish | Not Started | 0% |

---

## Epic 1: Server Live Stream Pipeline (NOT STARTED)

Set up the server-side infrastructure: WebSocket endpoint, Ring SDK live call management, ffmpeg fMP4 transcoding, session sharing, and auth.

### Acceptance Criteria

- [ ] WebSocket endpoint at `/api/cameras/:id/live` accepts connections and streams fMP4 video
- [ ] Ring SDK `startLiveCall()` → ffmpeg → stdout pipe produces playable fMP4 chunks
- [ ] Multiple clients share a single Ring live call per camera
- [ ] Sessions auto-terminate after 5 minutes of no client connections
- [ ] Auth gate protects the WebSocket endpoint

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 1.1 | Install ws and set up WebSocket server | Install `ws` + `@types/ws`, attach WebSocket server to the existing Express HTTP server | High | S | — | <!-- vk:ad6bc04b-c0a0-47c3-8bbf-2f093fe31c16 --> |
| 1.2 | Live session manager | Create `src/live/session-manager.ts` — manages active live sessions per camera. Starts Ring live call, spawns ffmpeg, tracks connected clients, handles session lifecycle | High | L | 1.1 | <!-- vk:996c717c-9499-4f61-922b-5f17806bb79c --> |
| 1.3 | ffmpeg fMP4 transcoding | Implement the ffmpeg pipeline: `startTranscoding()` with stdout output and fMP4 flags. Fallback to custom ffmpeg spawn with `onVideoRtp`/`onAudioRtp` if stdout not supported | High | L | 1.2 | <!-- vk:251499a3-acb5-46ac-9991-0c8a56a9b639 --> |
| 1.4 | WebSocket endpoint handler | Create `src/api/live.ts` — handles WS upgrade at `/api/cameras/:id/live`, authenticates, joins/creates session via session manager, pipes fMP4 chunks to client | High | M | 1.2, 1.3 | <!-- vk:5da99151-1aaf-4e82-ae2f-4d346dc976ce --> |
| 1.5 | Session sharing and cleanup | Multiple WS clients share one Ring call. When last client disconnects, stop ffmpeg and end Ring call after a grace period (10s). Auto-terminate idle sessions after 5min | High | M | 1.4 | <!-- vk:604aa5e5-f3be-4e12-8264-d3eee56d71fb --> |
| 1.6 | Live status endpoint | `GET /api/cameras/:id/live/status` returns `{ active: boolean, clients: number, uptime: number }` | Medium | S | 1.4 | <!-- vk:06001a62-a871-4e7a-985e-947980248c47 --> |
| 1.7 | Auto-reconnect on Ring disconnect | If Ring live call drops, attempt one automatic reconnect. Notify clients of reconnection state via JSON message on WS | Medium | M | 1.4 | <!-- vk:a994f7bd-8daa-4f1d-acd5-4516e0477252 --> |
| 1.8 | Server pipeline tests | Unit tests for session manager lifecycle: create, join, leave, cleanup. Mock Ring SDK and ffmpeg | High | M | 1.5 | <!-- vk:56000ea4-ba67-4426-a2d2-5cb4ef1cf75c --> |

### Task Details

**1.1 - Install ws and set up WebSocket server**
- [ ] `ws` and `@types/ws` installed in package.json
- [ ] WebSocket server attached to existing HTTP server in `src/index.ts`
- [ ] WS server listens for upgrade requests on `/api/cameras/` path
- [ ] Existing Express routes unaffected

**1.2 - Live session manager**
- [ ] `LiveSessionManager` class exists at `src/live/session-manager.ts`
- [ ] `startSession(cameraId)` creates a Ring live call and ffmpeg process
- [ ] `joinSession(cameraId, ws)` adds a WebSocket client to an existing session
- [ ] `leaveSession(cameraId, ws)` removes a client; stops session if no clients remain after grace period
- [ ] `getSession(cameraId)` returns session status or null
- [ ] Only one session per camera at a time

**1.3 - ffmpeg fMP4 transcoding**
- [ ] Primary: `startTranscoding({ output: ["-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-"] })` pipes to stdout
- [ ] If stdout not supported: fallback spawns `ffmpeg` with `-i pipe:0` reading from `onVideoRtp`/`onAudioRtp`
- [ ] ffmpeg stdout data events are captured and broadcast to connected WebSocket clients
- [ ] H.264 baseline profile output compatible with MSE

**1.4 - WebSocket endpoint handler**
- [ ] WS upgrade handled at `/api/cameras/:id/live`
- [ ] Auth validated from query param (`?token=...`) or cookie before accepting connection
- [ ] Unauthorized connections rejected with 401
- [ ] Initial JSON metadata message sent to client: `{ type: "metadata", codec: "avc1.42E01E", ... }`
- [ ] Subsequent messages are binary fMP4 chunks
- [ ] Client disconnect triggers `leaveSession`

**1.5 - Session sharing and cleanup**
- [ ] Second WS client connecting to same camera joins existing session (no new Ring call)
- [ ] Both clients receive the same fMP4 stream
- [ ] When last client disconnects, 10-second grace period before cleanup
- [ ] New client within grace period reuses session
- [ ] Idle timeout (5 min with no ping) kills session
- [ ] ffmpeg process killed and Ring call stopped on cleanup — verified with `ps aux`

**1.6 - Live status endpoint**
- [ ] `GET /api/cameras/:id/live/status` returns JSON
- [ ] Response includes `active`, `clients` count, `uptimeMs`
- [ ] Returns `{ active: false }` when no session exists
- [ ] Auth-protected like other API endpoints

**1.7 - Auto-reconnect on Ring disconnect**
- [ ] `onCallEnded` observable triggers reconnect attempt
- [ ] Sends `{ type: "reconnecting" }` JSON message to all clients
- [ ] On successful reconnect: sends `{ type: "reconnected" }` and resumes streaming
- [ ] On failed reconnect: sends `{ type: "error", message: "Camera disconnected" }` and closes connections

**1.8 - Server pipeline tests**
- [ ] Test session create → join → leave → cleanup lifecycle
- [ ] Test session sharing: two clients join, first leaves, session stays; second leaves, session ends
- [ ] Test idle timeout triggers cleanup
- [ ] Test auth rejection for unauthorized WebSocket connections
- [ ] All tests pass with `npm test`

---

## Epic 2: Client Live Player (NOT STARTED)

Build the frontend live video player using WebSocket + MediaSource Extensions, with Go Live button, loading states, and error handling.

### Acceptance Criteria

- [ ] "Go Live" button visible in player area, starts live stream on click
- [ ] Live video plays in the same `<video>` element area as recordings
- [ ] Loading states distinguish "Connecting..." from "Buffering..."
- [ ] LIVE badge and camera info overlay visible during streaming
- [ ] Error state with retry on unexpected disconnect

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 2.1 | useLiveStream hook | Create `client/src/hooks/useLiveStream.ts` — manages WebSocket connection, MSE SourceBuffer feeding, connection state machine (idle → connecting → buffering → live → error) | High | L | 1.4 | <!-- vk:a67360f4-a483-49ff-81b0-390f98943586 --> |
| 2.2 | MSE fMP4 player utility | Create `client/src/utils/msePlayer.ts` — initializes MediaSource, creates SourceBuffer for video/mp4 codec, appends incoming binary chunks, handles buffer overflow | High | M | — | <!-- vk:e1f53484-f5ed-4e61-9a88-251b145c60d8 --> |
| 2.3 | Go Live button | Add "Go Live" pill button (red dot + "LIVE" text) to TimelinePlayer. Visible when not in live mode. Clicking calls `useLiveStream.start()` | High | S | 2.1 | <!-- vk:1f2a742e-ad29-42db-97bc-263423abcc64 --> |
| 2.4 | Live player view | Replace recording player with live video when streaming. Show LIVE badge overlay, camera name, current time. Show "End Live" button | High | M | 2.1, 2.2, 2.3 | <!-- vk:a827c5a9-4c40-43d0-a1ee-18ee41a050d0 --> |
| 2.5 | Loading and connection states | Show "Connecting to camera..." with spinner on WS connect. Switch to "Buffering..." when first metadata received but no video yet. Hide on first frame | Medium | S | 2.4 | <!-- vk:0728c27c-945c-427a-a24a-5f7126d31797 --> |
| 2.6 | Error state and retry | On WS disconnect/error: show error message with "Retry" button. On retry: re-initiate connection. Show camera-offline state if retry fails | Medium | S | 2.4 | <!-- vk:1ebef9bc-520a-4355-847f-c2d68484efce --> |
| 2.7 | Exit live mode | "End Live" button closes WebSocket, returns to previously selected recording or empty state. Clean up MSE resources | Medium | S | 2.4 | <!-- vk:84d66ce5-c191-4e78-a2ee-55fd8cd4d2c2 --> |

### Task Details

**2.1 - useLiveStream hook**
- [ ] Hook exports: `{ start, stop, state, error, videoRef }` where state is `'idle' | 'connecting' | 'buffering' | 'live' | 'error' | 'paused'`
- [ ] `start(cameraId)` opens WebSocket to `/api/cameras/:id/live`
- [ ] Parses initial JSON metadata message, then feeds binary frames to MSE via `msePlayer`
- [ ] `stop()` closes WebSocket and cleans up MSE
- [ ] Handles unexpected WS close by transitioning to `error` state

**2.2 - MSE fMP4 player utility**
- [ ] `createMsePlayer(video: HTMLVideoElement, codec: string)` initializes MediaSource and SourceBuffer
- [ ] `appendChunk(data: ArrayBuffer)` queues and appends fMP4 data to SourceBuffer
- [ ] Handles `QuotaExceededError` by removing old buffer data (keep last 30s)
- [ ] `destroy()` cleans up MediaSource and SourceBuffer
- [ ] Works in Chrome, Firefox, Safari, Edge

**2.3 - Go Live button**
- [ ] Pill-shaped button with pulsing red dot and "LIVE" text
- [ ] Positioned in the player area (visible alongside empty state or recording controls)
- [ ] Clicking triggers `useLiveStream.start(selectedCameraId)`
- [ ] Button hidden when live stream is active

**2.4 - Live player view**
- [ ] Video element fills the player area (same dimensions as recording player)
- [ ] "LIVE" badge overlay in top-left corner with red background
- [ ] Camera name and current time overlay in top-right
- [ ] "End Live" button visible below or overlaid on the video
- [ ] No native video controls (live stream, no seeking)

**2.5 - Loading and connection states**
- [ ] "Connecting to camera..." with spinner shown immediately on Go Live click
- [ ] Transitions to "Buffering..." when WS metadata received but no video data yet
- [ ] Both states hidden once first video frame renders
- [ ] Visually distinct from recording loading states

**2.6 - Error state and retry**
- [ ] Error state shows message: "Live stream disconnected" or "Camera unavailable"
- [ ] "Retry" button attempts reconnection
- [ ] After 2 failed retries: show "Camera offline" state with "Try Again Later" message
- [ ] Error state styled consistently with existing error states

**2.7 - Exit live mode**
- [ ] Clicking "End Live" calls `useLiveStream.stop()`
- [ ] Player returns to previously selected recording (if any) or empty state
- [ ] WebSocket closed, MSE resources released
- [ ] Go Live button reappears

---

## Epic 3: Timeline Live Integration (NOT STARTED)

Add a live indicator to the timeline bar and wire it up to the live player.

### Acceptance Criteria

- [ ] Pulsing "LIVE" indicator visible at right edge of timeline
- [ ] Clicking the indicator activates live view
- [ ] Timeline auto-scrolls to live edge when live mode is active

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 3.1 | Live indicator block on timeline | Add a "LIVE" block at the right edge of TimelineBar, after all recording blocks. Styled distinctly (red/pulsing) | High | M | — | <!-- vk:92a61f02-3b30-4a53-8554-e29e5809efa7 --> |
| 3.2 | Click live indicator to go live | Clicking the LIVE indicator on the timeline triggers the same action as the Go Live button | High | S | 3.1, 2.1 | <!-- vk:b5aeb7b3-316e-463c-ab26-75779042ae04 --> |
| 3.3 | Auto-scroll to live edge | When live mode is activated, scroll the timeline to the rightmost position so the live indicator is visible | Medium | S | 3.1, 2.1 | <!-- vk:50ba2b3a-130b-4708-963c-6b7f3cd95707 --> |
| 3.4 | Live indicator active state | When live mode is active, the LIVE indicator on the timeline should show a brighter/solid state (vs pulsing when inactive) | Low | S | 3.1, 2.1 | <!-- vk:7e46e522-d054-425e-af12-983efb1686f5 --> |

### Task Details

**3.1 - Live indicator block on timeline**
- [ ] "LIVE" text or icon rendered at the right edge of the timeline track
- [ ] Positioned after the last recording block (or at the "now" position if no recordings)
- [ ] Red color with CSS pulse animation (`@keyframes pulse`)
- [ ] Does not interfere with recording blocks or existing hover/scrub behavior

**3.2 - Click live indicator to go live**
- [ ] `onClick` on the LIVE indicator calls `onGoLive()` callback (passed as prop to TimelineBar)
- [ ] TimelineView wires this to `useLiveStream.start()`
- [ ] Clicking while already live is a no-op

**3.3 - Auto-scroll to live edge**
- [ ] When `useLiveStream.state === 'live'`, TimelineBar scrolls to its rightmost position
- [ ] Uses smooth scroll animation (same as auto-scroll for recording selection)
- [ ] Re-scrolls if timeline time range changes while live

**3.4 - Live indicator active state**
- [ ] When live: solid red background, no pulse, brighter opacity
- [ ] When not live: semi-transparent red with pulse animation
- [ ] Transition between states is smooth (CSS transition)

---

## Epic 4: Scrub ↔ Live Interaction (NOT STARTED)

Handle the transition between live viewing and recording playback when the user interacts with the timeline.

### Acceptance Criteria

- [ ] Scrubbing/clicking a recording while live pauses the live feed and plays the recording
- [ ] "Return to Live" button appears and resumes the live stream
- [ ] WebSocket stays connected during scrub (no re-connect needed)

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 4.1 | Pause live on timeline interaction | When user clicks a recording or scrubs the timeline while live, transition `useLiveStream` to `paused` state. Switch player to show the selected recording | High | M | 2.1, 2.4 | <!-- vk:06eb6f0c-5ded-44e1-9aab-b3885ed32afc --> |
| 4.2 | Return to Live button | Show a "Return to Live" button in the player area when live is paused. Clicking resumes the live feed from the existing WS connection | High | S | 4.1 | <!-- vk:802f05ec-00e4-47e2-ac46-78d19bc41ab7 --> |
| 4.3 | Handle stale session on return | If the WS has disconnected or session timed out while user was scrubbing, "Return to Live" starts a new session instead of resuming | Medium | S | 4.2 | <!-- vk:b493d201-141e-4a36-9378-53979fe089ef --> |
| 4.4 | Live state in TimelineView | Wire the live/paused/idle state through TimelineView so it can coordinate between TimelinePlayer, TimelineBar, and useLiveStream | High | M | 4.1, 3.2 | <!-- vk:2b3b57de-6cb4-4eda-a77b-32203076fe20 --> |

### Task Details

**4.1 - Pause live on timeline interaction**
- [ ] When `onSelect` fires for a recording while `useLiveStream.state === 'live'`, call `useLiveStream.pause()`
- [ ] `pause()` stops feeding MSE but keeps WebSocket open
- [ ] Player switches to show the selected recording (existing TimelinePlayer behavior)
- [ ] Live state transitions to `'paused'`

**4.2 - Return to Live button**
- [ ] Button visible when `useLiveStream.state === 'paused'`
- [ ] Styled as a prominent pill button: "Return to Live" with red dot
- [ ] Clicking calls `useLiveStream.resume()` which resumes MSE feeding from WS
- [ ] Recording player is hidden, live player shown

**4.3 - Handle stale session on return**
- [ ] If WS is closed when "Return to Live" is clicked, state transitions to `connecting` and starts a new session
- [ ] User sees the normal "Connecting..." flow
- [ ] No error if session expired — transparent reconnection

**4.4 - Live state in TimelineView**
- [ ] TimelineView manages `isLive`, `isLivePaused` state derived from `useLiveStream`
- [ ] Passes `isLive` to TimelineBar for indicator state
- [ ] Passes `onGoLive` callback to both TimelineBar and TimelinePlayer
- [ ] When live: hides recording selection in player, shows live player
- [ ] When paused: shows recording player + Return to Live button

---

## Epic 5: Testing & Polish (NOT STARTED)

Validate the full live view flow, ensure resource cleanup, and polish the UI.

### Acceptance Criteria

- [ ] All existing tests pass (191+)
- [ ] No orphaned ffmpeg processes after live session
- [ ] Recording pipeline works during live view
- [ ] Visual polish matches dark theme

### Tasks

| ID | Title | Description | Priority | Complexity | Depends On | Status |
|----|-------|-------------|----------|------------|------------|--------|
| 5.1 | Integration test: full live cycle | Test: start live → stream plays → end live → resources cleaned up | High | M | 4.4 | <!-- vk:5b0e1506-1167-4ced-8d66-d55cf7ea9143 --> |
| 5.2 | Resource cleanup validation | Verify ffmpeg processes killed, WS closed, Ring call ended after all disconnect scenarios (normal close, browser tab close, network drop) | High | M | 1.5 | <!-- vk:c10deaff-b6e7-40b5-9b78-a5d33b12560d --> |
| 5.3 | Recording pipeline coexistence | Verify motion events still trigger recordings while a live session is active on the same camera | High | S | 1.2 | <!-- vk:cc2a0acc-dbfd-4dd0-86ad-63f084a1889e --> |
| 5.4 | Visual polish | Ensure LIVE button, badge, indicator, loading states, and error states match dark theme. Check contrast, font sizes, animations | Medium | S | 4.4 | <!-- vk:d69bc340-5890-4bcc-981b-372b37c63201 --> |
| 5.5 | Edge cases | Test: camera offline at start, Ring call drops mid-stream, rapid connect/disconnect, multiple tabs sharing session | Medium | M | 4.4 | <!-- vk:b2dd07b6-6a9f-4130-bd3f-5ba835ecf0e6 --> |

### Task Details

**5.1 - Integration test: full live cycle**
- [ ] Test start → metadata received → video frames flowing → stop → cleanup
- [ ] Test with mock WebSocket and mock Ring SDK
- [ ] Verify MSE resources released after stop
- [ ] All assertions pass in `npm test`

**5.2 - Resource cleanup validation**
- [ ] After normal disconnect: 0 orphaned ffmpeg processes
- [ ] After browser tab close (abrupt WS disconnect): cleanup happens within grace period
- [ ] After server restart: no stale sessions persist
- [ ] Ring live call `stop()` called in all cleanup paths

**5.3 - Recording pipeline coexistence**
- [ ] Start live session → trigger motion on same camera → recording still captured
- [ ] Live session and recording use separate Ring live calls (or share safely)
- [ ] No interference between live and recording ffmpeg processes

**5.4 - Visual polish**
- [ ] Go Live button: red dot pulses, pill shape, readable on dark background
- [ ] LIVE badge: solid red, white text, top-left overlay with slight shadow
- [ ] Timeline LIVE indicator: red block, pulse animation, min-width for visibility
- [ ] Loading spinners consistent with existing UI
- [ ] All font sizes >= 12px

**5.5 - Edge cases**
- [ ] Camera offline at start: error state shown within 10 seconds
- [ ] Ring call drops mid-stream: auto-reconnect attempted, client notified
- [ ] Rapid connect/disconnect (5 times in 10 seconds): no leaked sessions or processes
- [ ] Two tabs open same camera live: both receive stream, closing one doesn't kill the other's stream

---

## Dependencies

- Ring SDK `startLiveCall()` and `startTranscoding()` (existing)
- ffmpeg in PATH (existing)
- `ws` npm package (new)
- Browser MediaSource Extensions API (native, all modern browsers)

## Out of Scope

- Two-way audio
- Multi-camera simultaneous live view
- Live recording/clipping from browser
- Push notifications
- PTZ controls
- Mobile-native app

## Open Questions

- [ ] Does Ring SDK's `startTranscoding()` support stdout (`"-"`) as output? If not, fallback to custom ffmpeg with RTP packets.
- [ ] Can a recording and live call coexist on the same camera simultaneously via Ring SDK?
- [ ] What is Ring's rate limit for `startLiveCall()` calls? Need to implement cooldown if aggressive.

## Related Documents

| Document | Purpose | Status |
|----------|---------|--------|
| docs/prd-live-view.md | Product Requirements (Live Camera View) | Current |
| docs/prd.md | Product Requirements (Timeline Playback Enhancements) | Complete |
| docs/development-plan.md | Development Plan (Timeline Enhancements) | Complete |

---

## Changelog

- **2026-03-24**: Generated 31 VibeKanban issues (5 epics + 26 tasks) and linked to plan
- **2026-03-24**: Initial development plan created from PRD
