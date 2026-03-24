# PRD: Live Camera View

> **Author:** Francisco Sales
> **Created:** 2026-03-24
> **Status:** Draft

## Problem Statement

Homeowners using ding-dong-ditch can only review recorded clips — there's no way to see what's happening right now. When a motion or doorbell event triggers, the user must wait for the recording to finish and upload before reviewing. A real-time live view lets users immediately check their camera, providing instant situational awareness and peace of mind.

## Goals

1. **Instant live view** — provide a "Go Live" button in the player area that starts a real-time video feed from the selected camera, replacing the recording player.
2. **Seamless timeline integration** — the timeline bar should visually indicate "live" at the right edge, and scrolling/scrubbing the timeline should pause the live feed and resume when returning to live.
3. **Low-latency streaming** — deliver the live feed via WebSocket with ffmpeg transcoding from the Ring camera's RTP stream for minimal latency.

## Non-Goals (Out of Scope)

- Two-way audio (speaker activation)
- Multi-camera simultaneous live view
- Live view recording/clipping from the browser
- Push notifications when live events occur
- PTZ (pan/tilt/zoom) controls
- Mobile-native app support

## Target Users / Personas

### Persona 1: Homeowner
- **Description:** A homeowner using ding-dong-ditch to monitor their Ring doorbell camera.
- **Needs:** Quickly check the live camera feed when they hear a noise, get a delivery notification, or just want to see what's happening outside.
- **Pain points:** Currently must wait for a motion-triggered recording to finish before they can see anything. No way to proactively check the camera.

## Functional Requirements

### FR-1: Live Stream Server Pipeline

- The server SHALL expose a WebSocket endpoint at `/api/cameras/:id/live` for live video streaming.
- On WebSocket connection, the server SHALL use Ring SDK's `startLiveCall()` to establish a WebRTC connection to the camera.
- The server SHALL use Ring SDK's `startTranscoding()` with stdout output (`"-"`) and fMP4 flags (`-movflags frag_keyframe+empty_moov+default_base_moof`) as the primary approach. Fallback: spawn a custom ffmpeg process consuming `onVideoRtp`/`onAudioRtp` packets if `startTranscoding()` does not support stdout.
- ffmpeg output SHALL be streamed chunk-by-chunk over the WebSocket as binary frames.
- The server SHALL send an initial metadata message (JSON) with stream info (codec, resolution) before video data.
- The WebSocket endpoint SHALL be protected by the same auth gate as the REST API (auth token via query parameter or initial handshake message).
- The server SHALL gracefully handle client disconnect by stopping ffmpeg and ending the Ring live call.
- The server SHALL automatically terminate idle sessions after 5 minutes of no WebSocket ping.
- Only one Ring live call per camera SHALL be active at a time. Additional WebSocket clients SHALL share the same ffmpeg output stream.
- The server SHALL expose `GET /api/cameras/:id/live/status` to check if a live session is currently active.

### FR-2: Live Stream Client Player

- The timeline player area SHALL display a "Go Live" button when no live session is active.
- The button SHALL appear prominently in the player area (pill-shaped button with a red dot indicator and "LIVE" text).
- Clicking "Go Live" SHALL:
  - Open a WebSocket connection to the server.
  - Replace the recording player with a live video player.
  - Show a loading indicator while the stream initializes.
  - Use MediaSource Extensions (MSE) to feed incoming WebSocket binary data to a `<video>` element for playback.
- The live player SHALL display a "LIVE" badge/indicator overlay during active streaming.
- The live player SHALL show the camera name and current time overlay on the live feed.
- The live player SHALL show distinct visual states for "connecting to camera" (spinner + "Connecting...") vs "buffering video" (spinner + "Buffering...").
- The live player SHALL show an "End Live" or "Back to Recordings" button to exit live mode.
- When exiting live mode, the player SHALL close the WebSocket and return to the previously selected recording (or empty state).
- If the WebSocket disconnects unexpectedly, the player SHALL show an error message with a "Retry" option.

### FR-3: Timeline Live Indicator

- The timeline bar SHALL display a "LIVE" block/indicator at the right edge (after all recordings), visually distinct from recording blocks.
- The live indicator SHALL pulse or animate to convey real-time activity.
- Clicking the live indicator on the timeline SHALL activate the live view (same as clicking "Go Live").
- When the live view is active, the timeline SHALL auto-scroll to keep the live indicator visible at the right edge.

### FR-4: Timeline Scrubbing ↔ Live View Interaction

- When the user scrubs or clicks a recording on the timeline while live view is active, the live view SHALL pause (WebSocket stays open but video is paused).
- The player SHALL switch to the selected recording for playback.
- A "Return to Live" button SHALL appear in the player area to resume the live feed.
- Clicking "Return to Live" SHALL resume the live stream without re-initiating the Ring call (if the WebSocket is still connected).
- If the WebSocket has disconnected, "Return to Live" SHALL start a new session.

### FR-5: Auto-Live on Initial Load

- On initial timeline view load, the "Go Live" button SHALL be prominently visible in the player area alongside the auto-jump-to-latest behavior.
- The timeline SHALL scroll to the rightmost position (live edge) when live view is activated.

## Non-Functional Requirements

- **Latency:** Live feed should be viewable within 2-4 seconds of clicking "Go Live". Target lowest practical latency with WebSocket streaming.
- **Performance:** Live streaming must not impact the server's ability to record motion events. The recording pipeline has priority over live viewing.
- **Reliability:** If the Ring camera connection drops, the server should attempt one automatic reconnect before reporting failure to the client.
- **Resource Management:** ffmpeg processes SHALL be cleaned up on session end. No orphaned processes.
- **Browser Support:** MSE/WebSocket supported in all modern browsers (Chrome, Firefox, Safari, Edge).
- **Concurrency:** Multiple browser tabs/clients can share a single live session for the same camera.

## Tech Stack

- **Backend:** Node.js + Express (existing) + `ws` WebSocket library, Ring SDK `startLiveCall()` + ffmpeg for fMP4 transcoding
- **Frontend:** React + TypeScript (existing), MediaSource Extensions API for WebSocket video playback
- **Streaming:** WebSocket binary frames with fMP4 (fragmented MP4) segments from ffmpeg
- **New Dependencies:** `ws` (server-side WebSocket), no new client dependencies (MSE is native)

## Architecture

```
Ring Camera
    ↓ (WebRTC via Ring SDK)
Server: startLiveCall()
    ↓ (RTP packets via StreamingSession)
Server: ffmpeg [RTP → fMP4 fragmented output on stdout]
    ↓ (binary chunks piped to WebSocket)
WebSocket: /api/cameras/:id/live
    ↓ (binary frames)
Browser: WebSocket → MediaSource API → <video> element
```

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Time to first frame | < 4 seconds from button click | Manual testing |
| Stream stability | No drops in 5-minute session | Manual testing |
| Resource cleanup | 0 orphaned ffmpeg processes after disconnect | `ps aux | grep ffmpeg` after session |
| Recording pipeline unaffected | Motion events still captured during live view | Trigger motion during live session |
| All existing tests passing | 191/191 pass | `npm test` |

## Dependencies

- Ring SDK `startLiveCall()` must be working (already used for recording)
- ffmpeg must be available in PATH (already a runtime dependency)
- `ws` npm package for WebSocket server (new dependency)
- Browser MediaSource Extensions API (supported in all modern browsers)

## Risks & Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-------------------|
| Ring rate-limits live calls | High | Implement session sharing so multiple clients reuse one stream; add cooldown between session starts |
| ffmpeg fMP4 transcoding adds CPU load | Medium | Use copy codec where possible (avoid re-encoding); limit concurrent live sessions to 1 per camera |
| Ring SDK live call duration limits | Medium | Ring sessions typically timeout after ~10 minutes; implement auto-reconnect with exponential backoff |
| MSE codec compatibility | Medium | Use H.264 baseline profile + AAC which has universal MSE support; test across browsers |
| ffmpeg startup time affects latency | Low | Pre-warm ffmpeg process on first request; send keyframe request to Ring camera on connect |

## Timeline / Milestones

| Milestone | Target Date | Description |
|-----------|-------------|-------------|
| MVP | 2026-03-24 | Full live view with WebSocket streaming, Go Live button, timeline integration |

### Implementation Order (suggested)

1. **FR-1: Server-side WebSocket pipeline** — Ring SDK → ffmpeg → fMP4 chunks → WebSocket
2. **FR-2: Client live player** — Go Live button, MSE integration, loading/error states
3. **FR-3: Timeline live indicator** — Visual indicator at right edge, click to go live
4. **FR-4: Scrub ↔ live interaction** — Pause live on scrub, return to live button
5. **FR-5: Auto-live on load** — Scroll to live edge on activation
