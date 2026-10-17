# Output transport evaluation

Status: research and proposed experiment, reviewed against primary sources on
2026-10-14. No output transport, native SDK integration, signaling service or
network broker is implemented by this document. Existing renderer behavior stays
authoritative.

## Recommended starting point

Use direct display for a renderer connected to its projector or mixer. Evaluate
existing capture and routing applications for cross-machine video before building
an output service. NDI is a candidate for a wired production LAN; WebRTC is a
candidate for browser confidence previews. Spout and Syphon are local native
application handoffs. The choice depends on measured frame pacing, image quality,
receiver support and failure recovery, rather than an SDK latency claim.

The browser controller should send controls and view a reduced preview while the
club rack owns rendering and final outputs. A VJ laptop can instead own rendering
when it is the show machine. Moving video and remotely running the same effect
are different experiments: independent renderers need explicit audio, input,
time and state ownership, and do not become synchronized through transport choice.

## Candidate boundaries

| Route                                | Useful deployment                               | Browser/native boundary                                                | Cost to measure                                                                |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Direct display over HDMI/DisplayPort | Laptop or rack next to output equipment         | Browser fullscreen or external application projector; OS owns displays | Render/compositor/scanout delay, display modes, cable or capture-device limits |
| NDI High Bandwidth                   | Rack or laptop to existing LAN receivers/mixers | Native sender/receiver or external bridge required                     | Capture and copies, SpeedHQ encoding/decoding, NIC/switch capacity             |
| NDI HX/HX3                           | Lower-bandwidth links with compatible receivers | Native encoder/decoder or bridge; verify exact format and license      | Codec quality, encoder sessions, buffering, recovery after packet loss         |
| WebRTC                               | Browser controller preview or browser receiver  | Standard browser media APIs, plus an application signaling exchange    | Capture, encoding, jitter buffer, decode, compositor, per-peer load            |
| Spout on Windows / Syphon on macOS   | Same-machine handoff into a VJ application      | Native graphics texture sharing; no standard browser texture export    | Capture/native adapter, GPU selection, copies, device-loss recovery            |

Spout describes Windows interapplication GPU sharing; Syphon uses macOS
IOSurface. They do not carry video between machines. Ordinary browser JavaScript
does not expose these native sharing APIs. A native wrapper would need its own
supported graphics interop path; WebGL/WebGPU textures alone are not a portable
Spout or Syphon sender. Existing native consumers can be tested independently of
Blink. [Spout](https://spout.zeal.co/),
[Syphon](https://syphon.info/).

WebRTC provides browser media/data exchange with ICE connectivity and optional
STUN/TURN infrastructure. Application signaling remains necessary. Canvas
`captureStream()` supplies a browser media track subject to origin cleanliness;
screen capture requires browser-mediated user consent. Neither creates a native
NDI sender. Capture and WebGPU behavior must be tested in the selected browser,
including audio routing, permissions and background throttling.
[WebRTC specification](https://www.w3.org/TR/webrtc/),
[DOM element capture](https://www.w3.org/TR/mediacapture-fromelement/),
[screen capture](https://www.w3.org/TR/screen-capture/).

For four physical displays, distinguish one canvas spanning a display wall, four
independent renderer instances, and one video source duplicated downstream. They
have different render, encode and synchronization costs. Browser multi-screen
placement depends on permissions and implementation support; OS display setup
and downstream processors remain deployment concerns. Frame-accurate display
genlock is not supplied by ordinary browser window placement.
[Window Management specification](https://www.w3.org/TR/window-management/).

## Existing bridges first

OBS Browser Source can load a URL with chosen dimensions and frame rate; its
embedded Chromium environment is a separate renderer with its own capabilities
and lifecycle. Test GPU backend, audio inputs, media permission and hidden-source
behavior before assuming parity with the normal browser. Alternatively, capture
the already-running renderer window/display using the host's available capture
route. [OBS Browser Source](https://obsproject.com/kb/browser-source).

DistroAV supplies OBS NDI receive, program output and dedicated source/scene
output. A first NDI experiment can use OBS plus DistroAV and an existing receiver,
without a Blink SDK integration. Record OBS/plugin/runtime versions and install
according to the upstream compatibility requirements. Selecting an NDI output
does not prove it is an HX encoder; record the actual transmitted format.
[DistroAV upstream](https://github.com/DistroAV/DistroAV).

An existing VJ application that supports Spout/Syphon can evaluate the local
handoff independently. TouchDesigner documents these output interfaces on their
respective platforms. Use operator-installed bridges and tools; their availability
does not authorize bundling their installers or third-party runtimes in Blink.
[TouchDesigner output reference](https://derivative.ca/UserGuide/Syphon_Spout_Out_TOP).

## Bandwidth and codec distinctions

High Bandwidth uses intra-frame SpeedHQ. HX and HX3 use H.264/H.265 configurations;
HX3 should be tested separately from older HX. Lower network utilization can trade
against codec work, buffering and image fidelity. Fine text, chroma edges, rapid
noise, transparency and feedback deserve separate comparisons.

The following are planning references, not measured Blink rates. High Bandwidth
entries are the September 2023 NDI 5.6 white paper's SpeedHQ2 8-bit 4:2:2 table;
its 4K alpha variant is about 312.49 Mbps. Current general guidance allows up to
150 Mbps for a 1080p60 stream and says bandwidth varies. HX3 figures below are the
vendor H.265 8-bit 4:2:0 table. Four-output totals are arithmetic for four separate
streams to one receiver each, before protocol overhead, previews or extra
receivers. [NDI 5.6 white paper, sections 6.1-6.2](https://ndi.video/wp-content/uploads/2023/09/NDI-5.6-White-Paper-2023.pdf),
[current bandwidth guidance](https://docs.ndi.video/all/getting-started/white-paper/bandwidth),
[HX3 H.265 table](https://docs.ndi.video/all/getting-started/white-paper/bandwidth/ndi-hx3-h.265-8bit-4-2-0).

| Format reference         | 1080p60 stream | Four 1080p60 streams | 3840x2160p60 stream | Four 4K60 streams |
| ------------------------ | -------------: | -------------------: | ------------------: | ----------------: |
| High Bandwidth, SpeedHQ2 |    132.14 Mbps |          528.56 Mbps |         249.99 Mbps |       999.96 Mbps |
| HX3 H.265                |        50 Mbps |             200 Mbps |             84 Mbps |          336 Mbps |

Four reference 4K High Bandwidth streams leave no usable headroom on a 1 Gbps
sender link. Measure sender egress, receiver ingress and switch uplinks; multiple
unicast receivers can multiply traffic. A multicast design requires supported
senders, receivers and configured switching and should be a separate experiment.
Do not infer capacity from switch port labels alone. For WebRTC, record negotiated
codec and actual bitrate; no fixed Mbps value follows from choosing WebRTC.

## NDI licensing and ARM constraints

NDI SDK rights are version- and product-specific. Current primary pages are not
fully consistent: the licensing guide refers to a conditional royalty-free grant
and the 6.3.2 SDK agreement; the SDK product page describes personal/noncommercial
integration; the developer overview lists commercial video-production software;
the SDK FAQ emphasizes noncommercial use. These pages do not establish blanket
royalty-free commercial redistribution rights for Blink. Obtain and retain the
exact agreement delivered with the chosen SDK, confirm the product category and
distribution plan with the vendor where unclear, and price Advanced SDK/HX sending
separately. [SDK licensing guide](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing),
[SDK product page](https://ndi.video/for-developers/ndi-sdk/),
[developer overview](https://ndi.video/for-developers/),
[SDK FAQ](https://docs.ndi.video/all/faq/sdk/what-are-the-differences-between-the-ndi-sdk-and-the-ndi-advanced-sdk).

The public PDF reviewed is dated November 2024, excludes hardware/fixed-purpose
appliance categories from its general-purpose Products definition, and limits
redistribution to identified components. It is not proof of the agreement that
will accompany a current download or a commercial club appliance.
[Published agreement](https://downloads.ndi.tv/SDK/NDI_SDK/NDI%20License%20Agreement.pdf).

Distribution documentation differentiates MIT-licensed headers from proprietary
binaries/redistributables with EULA obligations. The licensing guide prohibits
redistributing NDI Tools, requires product links and trademark identification,
and warns about codec patent licensing. Include applicable third-party runtime
notices when distribution is authorized. Prefer links to operator-installed
software for the experiment.
[Software distribution](https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution),
[third-party rights](https://docs.ndi.video/all/developing-with-ndi/sdk/3rd-party-rights).

The vendor advertises Linux and ARM integration; this establishes a platform
candidate, not a Raspberry Pi throughput result. Confirm shipped architecture,
OS/libc, decode format, hardware acceleration and license category for each
board. Measure one 1080p60 decoder before considering four outputs or 4K60, with
thermal throttling and sustained load. An available ARM library does not guarantee
a browser, decoder or display can sustain the proposed workload.
[NDI SDK platforms](https://ndi.video/for-developers/ndi-sdk/),
[implementation guidance](https://docs.ndi.video/all/developing-with-ndi/sdk/performance-and-implementation).

## Control remains a separate contract

Use [blink-control/1](control-protocol.md) for authenticated HTTP/WS discovery,
renderer registration, controller/observer capabilities, commands,
acknowledgements, revisions and reconnect snapshots. Transport SDK discovery,
tally, PTZ or metadata does not replace those roles. WebRTC data channels likewise
do not implicitly implement them. A future bridge must preserve the same role,
instance, session, epoch, revision and applied-command semantics if it forwards
control at all.

Source edits and activation continue through the
[authoring and revision contract](authoring-and-revisions.md). The output receiver
does not become a source repository or revision authority. Losing a preview must
not stop local rendering or let a controller treat a stale frame as fresh state.

## Empirical experiment before implementation

Use existing Blink output, operator-installed capture/routing applications,
existing WebRTC tools where suitable, network counters and a high-frame-rate
camera. Do not add Blink networking to run this evaluation. If an existing bridge
cannot exercise a path, record it as untested rather than claiming support.

| Scenario         | Machines and outputs                                                            | Routes to compare                                                                            |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| VJ laptop        | Show laptop, local mixer/projector, browser controller                          | Direct display baseline; OBS capture to LAN NDI receiver; local native handoff if available  |
| Club rack        | Rack renderer, existing mixer/decoder, separate controller laptop               | Direct display baseline; High Bandwidth; separately identified HX/HX3 bridge                 |
| Browser receiver | Renderer machine and controller browser on wired LAN, then representative Wi-Fi | Existing WebRTC bridge; reduced preview versus full-size receiver                            |
| Four outputs     | Four independent programs, then one program distributed four ways               | Physical outputs and LAN routes; record number of renders, encodes and receivers             |
| ARM/Pi candidate | Exact board/OS, one receiver first                                              | Identified native NDI decoder or browser WebRTC receiver; expand only after measured success |

Run 1920x1080 at 60 fps and 3840x2160 at 60 fps separately. Include a simple
scene, rapid detailed motion, audio-reactive controls, persistent multipass
feedback and alpha/text patterns. Use only authorized test content. Keep renderer
settings, input playback, display mode and effect revision fixed between routes;
also record the real 59.94/60 Hz modes if they differ.

1. Record machine/OS/browser/backend, GPU/driver, capture route, bridge versions,
   codec/profile/chroma/alpha, encoder settings, NIC/switch topology, receiver and
   display mode. Verify the no-transport renderer sustains the chosen workload.
2. Warm each configuration, then run three ten-minute captures and a one-hour
   soak for survivors. Log render and received frame rates, pacing percentiles,
   dropped/duplicate frames, bitrate bursts, GPU/CPU load, memory, thermal state
   and encoder/decoder saturation. Record unexpected resolution or fps adaptation.
3. Measure source-visible event to destination photons with source and output in
   one camera view. Subtract or report the direct-display baseline separately.
   Measure controller action to visible output and audio-to-image alignment as
   distinct quantities. Report sample size, camera timing uncertainty and
   median/p95/p99; unsynchronized machine timestamps cannot prove one-way latency.
4. Inspect recorded image pairs for fine lines, color/chroma edges, feedback drift,
   noise and alpha. Compare delivered detail at equal resolution and fps. Codec
   marketing labels and average delay are not acceptance evidence.
5. Repeat with all four outputs and a preview active, then representative LAN
   contention and controlled packet loss. Distinguish independent encoder load
   from extra receiver traffic. Test the real switch uplink, not only a direct cable.
6. Disconnect the controller, receiver and sender separately; restart a bridge;
   unplug/replug a display; remove discovery; saturate the link. Time detection,
   blanking, recovery and return to stable pacing. Check effect/runtime histories
   after a capture reconnection and verify local output survives controller loss.

WebRTC `getStats()` offers frame counts, codec/bitrate and timing counters when
implemented. Compute windowed counter deltas; encode/decode time and jitter
buffer delay diagnose components but do not equal end-to-end photons latency.
[WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

Set operator-approved limits for drop rate, delay percentiles, image quality,
inter-output skew and recovery before running the comparison. At 60 fps the
nominal frame budget is 16.67 ms; it is not a transport latency promise. Choose
the smallest route that meets those recorded limits. If four outputs require
clock-locked scanout, qualify downstream genlock-capable equipment separately.

## Failure and LAN policy to test

For show output, propose black after an agreed bounded loss interval and explicit
operator recovery; a short last-frame hold may be preferable in some shows, so
record the selected policy. Avoid an automatic switch to an unrelated discovered
source. Keep controller preview failure and physical output failure distinct.

Test on a dedicated wired media LAN/VLAN with explicit source naming and approved
receivers. Discovery/groups are not sufficient evidence of authentication or
confidentiality. Do not expose production feeds to the public Internet. For any
future Blink LAN control, retain the control protocol's explicit opt-in,
authentication, HTTPS/WSS, origin checks and scoped roles. Authenticate WebRTC
signaling separately from encrypted media transport; test rejected identities,
expired credentials, reconnect and receiver substitution. Record firewall and
switch configuration with the experiment rather than adding a new discovery
service as a prerequisite.
