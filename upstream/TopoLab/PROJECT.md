# TopoLab — Project Master Document

**Living document.** Everything about what this project is, how it works, which
decisions are locked and *why*, what is built, what is broken, and what is left.
Written so a session with no memory of the past can pick it up cold.

- **What it is:** an interactive network topology simulator — build a network,
  switch between the six classic topologies, route live packets, break things,
  and see which topology survives.
- **Purpose:** placement/resume project. Sequel to the Pathfinding Visualizer,
  chosen because Computer Networks is asked directly in interviews.
- **Stack:** plain HTML + CSS + JavaScript. No libraries, no build step.
- **Last updated:** 27 August 2026

---

## 1. Mental model — read this first

Three ideas explain almost every design decision in the codebase:

| Idea | What it means |
|---|---|
| **The network is a graph** | device = vertex, cable = edge. A dead device or a cut cable is simply removed from the graph before any algorithm runs. Every visual (red glow, split banner, resilience score) is the output of a real graph algorithm, not a hardcoded rule. |
| **Layout lives in "world" coordinates** | Device positions are independent of the canvas size. The layout is sized by *device count*, so a 16-device tree is genuinely wider than the viewport. The **view** (scale + offset) then zooms it to fit. |
| **`graph.js` never touches the DOM** | It takes arrays of devices and links and returns numbers. That is why the algorithms can be unit-tested in Node without a browser. |

---

## 2. Running it

Open `index.html` directly — there is no build step. Or, for development:

```bash
node serve.js
```

Then `http://127.0.0.1:5180`.

**Use `serve.js`, not `python -m http.server`.** Python's server sends caching
headers, and a cached copy of the JS will silently keep running after you edit a
file. This cost a lot of time once already (see §6). `serve.js` sends `no-cache`
on every response, and every asset in `index.html` carries a `?v=N` query string
— **bump that number whenever you change a JS or CSS file.**

---

## 3. File map

```
TopoLab/
├── index.html          markup + ?v= asset versions
├── styles.css
├── serve.js            ~40-line no-cache static server
└── js/
    ├── graph.js        algorithms only — no DOM
    ├── topologies.js   the six generators, layouts, IP/MAC assignment
    ├── render.js       canvas drawing, view transform, hit testing
    ├── sim.js          packet flights, ARP, CSMA/CD, routing tables
    └── app.js          state, events, panels, compare mode, context menus
```

Comments throughout the code are in Hinglish (deliberate — they explain
reasoning to the author). **Everything user-facing is English.** Keep it that
way: UI strings, log messages, banners, tooltips, README.

---

## 4. Locked decisions and why

### Algorithms

- **Tarjan's articulation points + bridges**, one DFS pass, explicit stack (not
  recursion, so large networks can't blow the call stack). This is what drives
  the red SPOF glow and the amber "critical cable" dashes.
- **Resilience = N-1 contingency analysis.** Every single failure is actually
  simulated — kill each device in turn, cut each cable in turn — and the worst
  outcome is reported.
- **Survival is measured against the devices that *remain*, not the total.**
  Killing a device obviously removes that device; that is the failure, not the
  damage. The damage is whether the *others* got cut off from each other.
  Denominator = `n - 1` for device failures, `n` for cable failures.
- **`worst` is only set when a failure actually splits the network.** Ring and
  Mesh therefore report "no weak point", which agrees with the banner above it.
- **Already-broken networks return `alreadySplit: true`** and no `worst`. Asking
  "what would break this?" is meaningless once it is already in pieces.

### Layout and view

- **Minimum spacing `MIN_GAP = 104` between neighbouring devices.** The widest
  label is the IP at ~68px, so this leaves ~33px of clearance. Layouts grow
  beyond the canvas when they must; the view zooms to fit.
- **World→screen transform lives in `render.js`.** All app logic — hit testing,
  dragging, link previews — works in world coordinates. `view.toLocal(evt)`
  converts a mouse event to world space, so clicks stay correct at any zoom.
- **Canvas edges are faded** (`destination-out` gradients) so clipped content
  dissolves instead of ending in a hard slice.

### Networking behaviour

- **Collisions only happen on a shared medium** — that is, a cable with
  `shape === 'bus'`. Two paths merely sharing a link is *not* enough: a switch
  is store-and-forward, so it buffers the first frame and queues the second.
  Bus collides, star does not. This contrast is the best teaching moment in the
  app; do not "simplify" it away.
- **Packet speed is pixels-per-second, not per-cable**, so a long cable really
  does take longer to cross — which is what makes Dijkstra's "long cable = more
  latency" visible.
- **ARP runs for real:** cache miss triggers a rippling broadcast, then a unicast
  reply, then the send. A second send to the same host skips the broadcast.

### UI

- **Add tool does two jobs** — click empty canvas for a device, drag between two
  devices for a cable. There used to be a separate Cable tool; it was a pointless
  extra step, since you always wire a device up right after placing it.
- **A device can tap into an existing cable**, not just into another device.
  Click straight onto a cable with the Add tool, drop a dragged cable onto one,
  or use the cable's right-click menu. Cable `A—B` becomes `A—N` and `N—B`, and
  the bus `shape`/`busY` carry over, so a bus tap renders as a real backbone tap
  and the chain semantics survive (cut anywhere, network splits in two). Without
  this there was no way at all to join a bus backbone — you could only connect to
  a device that was already on it.
- **Right-click gives context menus** on devices, cables and empty canvas, so no
  action requires switching tools first.
- **Repair / Reset live in the stage bar**, top-right, directly under the topbar
  and ending exactly where the right panel begins. The banner shares that row as
  its flexible left half.
- **The stage bar, canvas and send bar are all in normal flow** (a flex column),
  never absolutely positioned over the canvas. Overlaying them caused devices to
  hide behind the legend once already.
- **The stage bar is two side-by-side blocks, not a flat row.** Left is the
  banner; right is `.stage__controls`, a *column* holding the legend on top and
  a `.stage__controls-row` (zoom + Repair/Reset) beneath it.

  Three rules hold it together, and each one exists because of a specific bug:
  - `align-items: stretch` on the bar — banner and controls column are always
    the same height, which is what guarantees **Repair never sits below the
    banner's bottom edge**. Without it, at a wide viewport the banner is one
    line (37px) while the controls column is 70px, and Repair hangs 33px below.
  - `gap: 8px` on the column, and nothing else — no `space-between`, no inner
    `stretch`. Those were what opened the empty strip between the legend and
    the zoom row (the "red gap" in the user's screenshots).
  - The banner is `flex: 1 1 auto; min-width: 220px`, the column is
    `flex: 0 0 auto`. The 220px floor exists because without it `nowrap` once
    crushed the banner to ~50px wide and ~500px tall and destroyed the canvas.

  A long detour was spent trying to make this a flat one-line row instead:
  `nowrap` + `flex-end`, a banner `max-width` budget, a `@container` query to
  hide the legend, a JS `fitLegend()` measuring `scrollWidth` vs `clientWidth`,
  and finally dropping the "Healthy" legend entry to buy width. `fitLegend()`
  hid the legend at *every* width — even with 300px of measured spare room — a
  layout-read race that neither a forced reflow (`void el.offsetWidth`) nor
  calling it from `handleResize` fixed. The flat row also cannot fit
  banner + legend + zoom + actions at 854px without something being removed.
  **All of it was reverted. Do not attempt the flat row again** — the column is
  the shape the user asked for, and it is the only one that satisfies both
  "no empty strip" and "Repair flush with the banner" at every width.

  Verified at 1536×864, 1200×800 and 854×700, across banner warn / network-split
  / hidden, and across both panels open, left closed, right closed, both closed
  and reopened: bar height 77–82px, `Repair.bottom − banner.bottom` between
  −2.8 and 0 in every case, legend→zoom gap exactly 8px, no overflow, all five
  legend entries visible.

- **Every device has a port count, and cables consume ports.** Defaults come
  from `TYPES` in `topologies.js` (PC 2, server 4, switch/hub 8, AP/router/
  firewall 4). Presets do not get stuck on those defaults: after generating,
  `fitPorts()` rounds each device up the real hardware ladder
  `[1,2,4,8,16,24,48]` until its cables fit — mesh needs 7 cables per device,
  so those devices come out as 8-port hardware. **Enforcement only applies to
  cables the user draws by hand**, which is why presets can never be born
  invalid. A dead cable still occupies its port: it is still plugged in.

- **Devices remember the last 8 packets that passed through them** (`d.seen`,
  written by `sim.js`, capped by `SEEN_LIMIT`). Each entry is a real frame
  sketch — source and destination label/IP/MAC, size (1500 for data, 64 for
  ARP), hop *n* of *m*, and TTL. **TTL is decremented at routers only** —
  switches and hubs are layer-2 and never touch it, which is exactly why
  traceroute works. This is what makes "Inspect this device" worth clicking.

- **Device details are editable** (right-click → *Edit details…*, or the button
  in the inspector). Validation is on real rules, not just "not empty": unique
  name, valid + unique IPv4, well-formed + unique MAC, and ports can never drop
  below the number of cables already plugged in. Gateways that hold an address
  on more than one subnet have their IP field locked, because one text box
  cannot express `192.168.1.1` *and* `192.168.2.1`.

- **Inspecting a device pulls the Inspector to the top of the right panel.**
  Done with flex `order: -1` under a `.is-inspecting` class, so the DOM order
  (Resilience > Metrics > Inspector) never changes — screen readers and the
  document outline stay correct, only the paint order moves. Two details that
  are easy to get wrong if this is ever touched: the Inspector drops its
  `flex: 1` while it is on top (otherwise it stretches and leaves a hole
  between itself and Resilience), and the bottom borders swap, because
  `.panel .group:last-child` keys off DOM order and would otherwise leave the
  visually-last group with a border and the visually-first without one.
  The panel scrolls to top **only when the selected device changes** — the
  inspector re-renders on every arriving packet, and scrolling there would
  yank the user's own scroll position upward repeatedly.

- **Firewall, hub and access point are no longer decorative.** Each got the
  behaviour that actually distinguishes it from a switch:

  - **Firewall** carries an ordered rule list (`d.rules`) and knows **which
    sides it separates**. `firewallZones()` removes the firewall from the graph
    and BFSes out from each neighbour; each component it finds is one zone
    (inside / outside / DMZ in real terms). Two neighbours that can still reach
    each other without the firewall collapse into *one* zone, which is correct —
    if there is a way around it, it is not separating them. This works the same
    whether the firewall sits between two devices or at a junction with five
    cables. A rule endpoint is `'any'`, a device id, or `'zone:<neighbourId>'`.
    Rules are read top to bottom and **the first match wins**; anything matching
    no rule is allowed. An `allow` match means "past *this* firewall" — it does
    not excuse the packet from a firewall further down the path.

    **Every path that puts traffic on the wire must ask the firewall.** There
    are three, and there were only two for a while: `sendPacket`'s data stage,
    the ARP stage (reached from *both* `sendPacket` and the standalone **ARP
    resolve** button), and the collision demo. `doArp()` was missing the check
    entirely, so an ARP-blocking rule did nothing when the user pressed the
    button — and worse, the resolved MAC landed in the cache, so the *next*
    Send packet skipped ARP and sailed through too. `firewallCheck()` itself was
    correct the whole time; the bug was a missing call site, which no unit test
    of the logic can catch. Test section 14 now reads `app.js` as text and
    asserts each of those functions calls `firewallCheck` — verified to fail
    when the fix is removed.

    **The data check lives inside `deliver()`, not before it.** Real hosts ARP
    first and send data second, so a rule that blocks only data must let the ARP
    through and stop the frame afterwards. When the check sat above the ARP
    step, "block data" and "block ARP" produced identical output and the whole
    protocol distinction was invisible. Do not move it back up.
    Default-allow is deliberate — dropping a firewall onto a network should not
    silently kill it. A blocked packet is **not** cancelled quietly: it flies to
    the firewall and dies there with a blast, a log line naming the rule, and a
    `Blocked` entry in that firewall's packet list. A dead firewall enforces
    nothing.
  - **Hub** is a repeater, not a switch: `floodShared()` copies every frame that
    passes through it onto *every other port*, so bystanders get a `Heard` entry
    explaining why. Two devices sending through one hub **do** collide, because
    a hub is a single collision domain — the collision demo no longer needs a
    shared bus cable to fire.
  - **Access point** is the same shared medium in the air, but with CSMA/CA
    instead of CSMA/CD: a radio cannot listen while transmitting, so collisions
    are *avoided* rather than detected. The demo shows the second sender waiting
    for a clear channel instead of colliding.

  `Topologies.isSharedMedium()` / `isWireless()` are the single source of truth
  for this — do not scatter `type === 'hub'` checks around.

- **Phone gets a topology picker window, not a scroll strip.** Six chips never
  fit across a 375px topbar — the old strip showed Bus and half of Star, and the
  rest were behind a horizontal scroll nobody would find. Below 901px the chips
  are hidden and a single button showing the current topology opens a dialog
  listing all six as cards, each with its icon and one-line description from
  `META`. Both paths call the same `regenerate()`, so there is no second code
  path to keep in sync.

- **The stage bar stacks on phone instead of being clipped.** Banner takes the
  full width, controls sit under it, and the zoom/Repair/Reset row wraps and
  centres. Previously Repair and Reset were simply off-screen at 375px.
  Undo/Redo stay visible on phone; only the two panel-toggle buttons hide,
  because a single-column layout has no panels to collapse.

- **The responsive media queries live at the very END of `styles.css`, and must
  stay there.** Equal-specificity rules are resolved by source order — being
  inside a media query buys no extra weight. The responsive block used to sit in
  the middle of the file, so every component style written after it silently
  beat its overrides. That is exactly why the mobile topology button never
  appeared on the first attempt: its base `display: none` was written *below*
  the media query that was supposed to show it.

- **The advisor measures; it does not have opinions baked in.** `advisor.js`
  builds all six topologies at the user's device count with the real generators,
  runs them through `graph.js`, min-max normalises each axis across those six,
  and applies the user's weights (low = 0, medium = 1, high = 3). Nothing is
  hard-coded — change a generator and the advice changes with it. Two details
  worth keeping:
  - `cablesPerNewDevice` is **measured, not assumed**: generate at `n` and at
    `n+1` and diff the cable count. Star gives 1, ring 2, mesh n.
  - Everything "low" means total weight 0. That is treated as *weigh everything
    equally* rather than dividing by zero, which would have made every score
    `NaN`.
  Like `graph.js`, it has no DOM references, so the whole engine is tested in
  Node — 648 recommendations across every one of the 81 preference combinations.

- **The active topology chip is driven by `state.kind`, never by a click
  handler.** `syncTopoUi()` is called from `regenerate()`. Setting the class
  inside the chip's own click handler meant any *other* route to a topology
  change — the advisor's "Build this", the phone picker — left the old chip
  lit: a ring on the canvas with Star highlighted above it.

- **All three device sliders share one range (3–24).** The main one was capped
  at 16 while the advisor allowed 24, so building a 20-device network from the
  advisor left the topbar slider stuck at 16 and reading the wrong number.

- **Every device type now does the thing that actually defines it.** Nothing
  here is a label on a picture; each one changes what the simulation does:

  - **Switch — MAC address table.** It learns the *source* MAC of every frame
    it forwards and remembers which neighbour it came from. A frame for a MAC
    it has not learned goes out of every port (unknown-unicast flooding); once
    learned, only out the right one. A one-way stream therefore floods forever,
    because the destination never speaks — exactly like real hardware. The ARP
    reply is what usually teaches it, so after a normal ARP exchange the
    flooding stops. Both halves are tested.
  - **Router — edge of the broadcast domain.** `sendArp`'s BFS stops at any
    router rather than expanding through it, so a broadcast reaches the router
    and dies there. This is the whole reason routers are used to split large
    networks, and it forces the next point.
  - **Hosts ARP for their gateway, not for a far host.** `arpTargetFor()`
    returns the destination when it shares a subnet and the gateway otherwise.
    It falls straight out of the previous rule: the far host's ARP could never
    arrive, so asking for it would be wrong. This is the single most commonly
    misdrawn thing in network diagrams.
  - **Hosts listen on ports.** Each type has a service list (server 80/443/22,
    printer 9100/631, NAS 445/2049, PC 445, hub none). A data packet targets the
    destination's first service; a device listening on nothing refuses the
    connection. Firewall rules gained an optional port, and its dropdown is
    built from the services actually present in the network.

  `Topologies.isSwitch/isSharedMedium/isWireless/isRouter/servicesFor` are the
  single source of truth for all of this — do not scatter `type === '...'`
  checks around.

- **Capacity and cheapest-wiring run on demand, not every frame.** `flow.js`
  holds both, DOM-free like `graph.js`:
  - **Max-flow / min-cut** (Edmonds-Karp). Every cable has capacity 1, so the
    max-flow between two devices *is* the number of routes between them that
    share no cable, and the min-cut is the smallest set of cables that would
    separate them. BFS-based augmenting paths (not DFS) keep it O(V·E²).
    The cut is drawn on the canvas in pink.
  - **Minimum spanning tree** (Kruskal + union-find with path compression and
    union by rank), drawn as a green dashed overlay. It is deliberately framed
    as a *yardstick, not a suggestion*: an MST has no redundancy at all — every
    one of its cables is a bridge — so "you could have used less cable" is only
    half the story, and the UI says so.

- **PNG export redraws the world onto a fresh, larger canvas** rather than
  calling `toDataURL` on the live one. The live canvas is transparent and only
  as big as the pane, so a direct export would be dim and cropped to whatever
  was on screen. `toPNG()` swaps the renderer's `ctx`/`W`/`H`/view onto an
  offscreen canvas, draws at 2x with a solid background, and restores in a
  `finally`. **`ctx` is `let`, not `const`, only because of this** — the
  alternative was threading a context parameter through every draw function.

- **There is exactly one pixels-to-metres definition**, `Topologies.metresBetween()`.
  It used to be written twice — 4 px/m in `topologies.js` and 40 px/m in the
  advisor — so the app once showed "Cable used 2136 m" and "Your layout 214 m"
  side by side for the same network. Lengths are also kept unrounded and rounded
  once at display time; rounding each cable first made the same two numbers
  disagree by 2–3 m. If a new feature needs a length, call that function.

- **Undo/Redo sit in `.stage__history`, directly under Reset but OUTSIDE
  `.stage__bar`.** A separate right-aligned row after the bar, so they line up
  under Reset without joining the legend/zoom column and inflating its height.
  Icon-only buttons keep the row ~35px — the cost of two buttons, not of a full
  control line. **PNG export lives in the topbar, before Advise.**

- **`.banner` is a flex container, so its content must sit in exactly one
  child** (`.banner__text`, written by `setBanner()`). Flex turns every bare
  text node *and* every element into its own flex item laid out in a row — so
  `⚠ <b>NETWORK SPLIT</b> — …` became three items side by side, "NETWORK SPLIT"
  broke across two lines, and the rest of the sentence sat indented next to it.
  The other two banners looked fine only because they had no `<b>` in them.
  This is a trap the flex change introduced silently: write a new banner with
  any inline markup and it breaks again unless it goes through `setBanner()`.

- **Canvas input goes through Pointer Events, not mouse events.** One set of
  handlers covers mouse, finger and pen, because `PointerEvent` carries the same
  `clientX/clientY/button` the old `MouseEvent` code already read — the body of
  every handler was left untouched. Touch needed three things on top: pinch-zoom
  from two live pointers, a 500ms long-press standing in for right-click, and
  `setPointerCapture` so a drag survives the finger leaving the canvas.

  **`touch-action: none` on `#canvas` is required, not cosmetic.** Without it the
  browser claims the gesture for page scroll/zoom and our pointer events never
  arrive — which is precisely why the canvas was dead on phones. The page still
  scrolls, just not from on top of the canvas.

  The long-press origin is stored in `longPress = {x, y, timer}`, deliberately
  **not** read back out of the `pointers` map: that map is rewritten on every
  move, so measuring drift against it always gives zero and the menu pops open
  mid-drag.

- **The layout is a flex column, not `calc(100vh - var(--topbar-h))`.** That
  calc treated the topbar height as a fixed 48px, which is why the topbar could
  never be allowed to wrap — wrapping made it taller and the workspace height
  went wrong. So above 900px it was `nowrap` with a hard height, and between
  **901px and ~1250px its contents needed 1209px** (brand + six chips + slider +
  PNG + Advise + Compare + panel toggles) and simply ran off the right edge.
  That band is exactly tablet landscape, and the whole page scrolled sideways
  there. `body` is now `display: flex; flex-direction: column`, the topbar is
  `flex-wrap: wrap` with `min-height`, and `.workspace` is `flex: 1` with
  `min-height: 0`. No magic number, and the topbar can be any height.

  Verified by loading the app in an iframe at **29 widths from 320 to 1600** and
  asserting nothing sticks out past `documentElement.clientWidth`. That sweep is
  how the 901–1250 band was found; testing a handful of favourite widths had
  missed it entirely.

- **A page cannot remove the browser's own toolbar** — `manifest.webmanifest`
  with `display: standalone` is the only real answer, and it applies once the
  app is launched from the home screen. Note `serve.js` had to learn the
  `.webmanifest` MIME type: Chrome silently ignores a manifest served as
  `application/octet-stream`, so installability fails with no error anywhere.

- **Phones get their own breakpoint at 620px, separate from the 900px one.**
  The 900px rules are the tablet layout and it looks right there. At 375px the
  topbar was collapsing into four rows (206px) with Compare and the topology
  picker each stranded alone, and the diagram did not start until 347px down an
  812px screen. The phone rules fix the order (`.topo-pick` had `order: 2`,
  which pushed it past `.topbar__right`), drop the brand subtitle as it just
  repeats the picker, and tighten the control sizes. Topbar 206 → 95px, chrome
  above the diagram 347 → 215px. `input[type=range]` needs an explicit width
  there — its ~129px default content width was what pushed Compare onto its own
  line.

- **Anything measuring layout overflow must compare against
  `document.documentElement.clientWidth`, not `innerWidth`.** Under viewport
  emulation those two disagree, and an `innerWidth` comparison reported "no
  horizontal scroll" while the mobile topbar was in fact 429px wide inside a
  375px viewport with Compare hanging off the edge. `.topbar__right` now wraps
  below 901px.

---

## 5. What the tool reports (8 devices)

| Topology | Cables | Diameter | Redundancy | Worst-case survival | Resilience |
|---|--:|--:|--:|--:|--:|
| Star | 7 | 2 | 0% | 14% | 8 |
| Bus | 7 | 7 | 0% | 50% | 19 |
| Tree | 7 | 4 | 0% | 50% | 19 |
| Hybrid | 8 | 3 | 38% | 57% | 37 |
| Ring | 8 | 4 | 100% | 100% | 75 |
| Mesh | 28 | 1 | 100% | 100% | 100 |

If these numbers change after an edit, something in `graph.js` changed — check
whether it was intentional, and update this table and the README together.

---

## 6. Bugs already fixed — do not re-introduce

These were expensive to find. The root causes are non-obvious.

| Symptom | Root cause |
|---|---|
| The whole app looked like the compare overlay; Close button did nothing | `.compare { display: flex }` (author stylesheet) beats the browser's `[hidden] { display: none }` (UA stylesheet), so the `hidden` attribute did nothing and the overlay covered everything from page load. Fixed by `[hidden] { display: none !important }` in the reset. **This one bug explained three separate complaints.** |
| Diagram cut off at the bottom; the view never re-fitted | `ResizeObserver` was watching `.stage`, a fixed grid cell whose size never changes. The **canvas** is what resizes (banner appearing, bar/legend wrapping). Now it observes the canvas. |
| A thin coloured line above the legend that took the diagram's colours | Content was hard-clipped at the canvas edge with no edge treatment. Fixed with the edge fade. |
| Bottom and right edges not fading while top and left did | `createLinearGradient` was given identical start and end points — a zero-length gradient paints nothing. |
| Compare mode opened completely blank | `openCompare` deferred `buildCompare` to a `requestAnimationFrame` callback, and the canvases were only drawn from the rAF loop. Now it builds and draws synchronously, with a per-frame safety net. |
| Fixes appearing not to work at all | Browser served a cached `index.html`, so the old script URLs loaded. Fixed by no-cache meta tags, `serve.js`, and `?v=N`. |
| Bus/Star/Tree all scored 0, so compare mode was useless | Old fault-tolerance formula multiplied by `(1 - bridgePenalty)`, which is exactly 0 whenever every cable is a bridge. Replaced by N-1 contingency analysis. |
| "Cable used" changed when you resized the window | Resize used to rescale every device position proportionally. World coordinates are now fixed; only the view refits. |
| The banner sat 12px too high, overlapping the topbar | Its `dropIn` keyframes started at `translateY(-12px)`. If the animation cannot run (reduced motion, hidden tab, paused compositing) the element stays at that start offset forever. The animation now fades opacity only — no transform, so position can never be wrong. **This fix survived the stage-bar revert; keep it.** |

### Theories that turned out to be WRONG — don't chase these again

- **"`clearRect(0,0,W,H)` misses the last bitmap row when the box height is
  fractional."** Tested in isolation: it does not. The clear was always
  complete. (The device-space clear in `drawBackground` was kept anyway — it is
  marginally more robust — but it fixed nothing.)
- **"Stale pixels accumulate at the canvas edge."** Also false. Verified: zoom in
  so content reaches the edge, then Fit — the row clears completely. What looked
  like a stuck colour was live content, with a different part of the diagram
  crossing the same edge each time you panned.

---

## 7. Status

**Built and verified.** Six topologies, 3–24 devices. Ten device types, each
with the behaviour that actually defines it — switch MAC table, hub flooding,
access-point CSMA/CA, router as broadcast-domain edge, firewall rules and zones.
Build tools, right-click menus, device editing, ports, packet routing with BFS
and Dijkstra, ARP (including gateway ARP across subnets), CSMA/CD, routing
tables, listening ports, per-device packet records, chaos mode with live
reroute, resilience scoring with weakest-point detection, undo/redo, compare
mode, the advisor, zoom/pan/fit, and a mobile layout.

**Test coverage: 236 assertions, all passing.** Plain Node, no framework:

```bash
node tests/graph.test.js && node tests/sim.test.js && node tests/advisor.test.js
```

| File | Assertions | Covers |
|---|--:|---|
| `graph.test.js` | 34 | SPOF detection, diameter, chaos, routing, resilience |
| `sim.test.js` | 153 | delivery, packet speed, ARP, mid-flight failure, CSMA/CD, routing tables, packet records with TTL, port sizing, firewall rules + zones + ports, hub/switch/AP behaviour, MAC learning, broadcast domains, gateway ARP |
| `advisor.test.js` | 49 | 648 recommendations across all 81 preference combinations and eight network sizes |

Run these after touching anything in `js/`. If the resilience numbers in §5
shift, the tests will say so.

Two of those suites contain checks that are not about logic at all:

- `sim.test.js` §14 reads `app.js` **as text** and asserts that every path which
  puts traffic on the wire calls `firewallCheck`. That exists because a real bug
  was a *missing call site*, which no test of the logic could ever catch. It has
  been verified to fail when the fix is removed.
- `advisor.test.js` restates the scoring axes independently rather than
  importing them, so a change to `AXES` in `advisor.js` shows up as a
  disagreement instead of quietly passing.

### Left to do

- [ ] Record a GIF for the README — Star, then kill the switch and watch it
      shatter. Still the single highest-value addition for a recruiter, and the
      one thing that has to be captured on a real screen.
- [ ] Touch support: context menus are right-click only, so there is no
      long-press equivalent on mobile. Everything reachable from the right-click
      menu is also reachable from the inspector, so nothing is unreachable — it
      is just slower.

### Done

- [x] `_chat_history/` set up (2 September 2026). **The slug is `D--Projects`,
      not `D--Projects-TopoLab`**, because every session so far was opened from
      `D:\Projects` rather than from the project folder. If a session is ever
      started inside `TopoLab/`, add that second slug to `SRC` in
      `backup_chats.py` or those transcripts will be missed. `raw/` and
      `turns_*.txt` are git-ignored; only the script and its README are committed.

### Known cosmetic issues (not bugs)

- **Hybrid at 8 devices:** only 2 clusters are created, and the SW-1↔SW-2 backup
  cable is drawn exactly behind the SW-1→R-CORE→SW-2 line, so it is invisible.
  The metrics are correct (R-CORE is not flagged as a SPOF, and those links are
  not bridges). At 10+ devices there are 3 clusters and the ring is clearly
  visible as a triangle.
- **Hybrid cannot be built below 5 devices** — it needs a router and two
  switches. The advisor says so rather than hiding it.
- Compare mode renders static diagrams — no packet animation there by design.

---

## 8. Changelog

**10 September 2026 (latest)** — Fixed horizontal overflow across the whole
901–1250px band (tablet landscape) by dropping the fixed-topbar-height
assumption; added a web app manifest and icon so the app can be installed and
run without browser chrome. Width sweep across 29 viewports added as the way to
check this.

**10 September 2026 (later)** — Touch support and a phone layout pass. Canvas
input moved to Pointer Events with pinch-zoom and long-press; a dedicated 620px
phone breakpoint cut the chrome above the diagram from 347px to 215px.

**10 September 2026** — Undo/redo row made `height: 0` so it floats over the
canvas instead of reserving a full line (canvas 537 → 572px at 1301px). Fixed
the NETWORK SPLIT banner breaking mid-phrase — `.banner` is a flex container, so
its `<b>` became a separate flex item; content now always goes through
`setBanner()` and its single `.banner__text` child. The ad-hoc pre-branch sweep
was promoted into the repo as `tests/sweep.test.js` (41 assertions) so it can be
re-run by anyone rather than living in a scratch file.

**2 September 2026 (branch `feature/network-analysis`)** — Max-flow/min-cut
capacity analysis, Kruskal cheapest-wiring comparison, and PNG export of the
diagram. `js/flow.js` + `tests/flow.test.js` (46 assertions, including
max-flow = min-cut verified across every pair in every topology). Two real
inconsistencies surfaced while wiring it up and were fixed at the source: the
pixels-per-metre scale was defined twice with a 10x difference, and cable
lengths were rounded per-cable before being summed.

**2 September 2026 (main)** — Full bug sweep before branching for new work:
1412 headless checks (every topology at every size from 3 to 24, every host pair
sending a packet, every device and cable killed in turn, firewall zones computed
from every device, ARP target for every pair, routing tables everywhere) plus a
UI sweep driving every button on every topology and changing one device through
all ten types. **One real bug found and fixed:** hosts in router-less topologies
(bus, star, ring, mesh) were given `gateway: 192.168.1.1`, an address no device
owned — the inspector showed a gateway that did not exist and the routing table
carried a fake `0.0.0.0/0` default route. A flat LAN with no router has no
default gateway, and now it does not claim one. Regression tests added (§20).
Everything after this point was branched off here.

**2 September 2026** — Housekeeping. `_chat_history/` set up with the
right slug and git-ignored. README's measured numbers re-verified against the
engine (unchanged), its stale bits fixed — including one Hinglish string that
had survived in a user-facing file — and its "things to try" extended to cover
the newer behaviour. Removed dead code (`Sim.zoneOf`, an unused `ruleMatches`
export, and a `new Map() : new Map()` ternary). A scan of every user-facing
string confirmed nothing but comments is still in Hinglish.

**31 August 2026** — Gave the remaining device types real behaviour:
switch MAC-address table with unknown-unicast flooding, router as a broadcast
domain boundary, hosts ARPing for their gateway across subnets, and listening
ports on every device with port-aware firewall rules and "connection refused"
for devices that listen on nothing. Inspector shows the MAC table and the
service list. One existing test had to change — it asserted a switch never
floods, which was the old simplification; the real rule is that it floods until
it has learned the MAC.

**31 August 2026 (earlier)** — Advisor added (`js/advisor.js` + `tests/advisor.test.js`):
say how many devices you have and how much uptime, speed, cost and growth matter,
and every topology is built at that size, measured, and ranked with the reasons
spelled out — plus a one-click "build this". Found and fixed two things while
testing it: the active topology chip was set by the chip's own click handler so
any other route to a topology change left it stale, and the topbar device slider
capped at 16 while the advisor went to 24. All three sliders are now 3–24. The
advisor also says out loud when a topology cannot be built as small as asked
(hybrid needs 5).

**31 August 2026 (earlier)** — Mobile pass. Topology chips replaced on phone by
a picker dialog listing all six with descriptions; stage bar stacks instead of
running off-screen; Undo/Redo now reachable on phone. Moved the responsive media
queries to the end of `styles.css` after finding that later component styles were
silently overriding them.

**31 August 2026 (earlier)** — The **ARP resolve** button bypassed the firewall
completely: no `firewallCheck` call in `doArp()`, so ARP-blocking rules did
nothing there and the cached MAC then let the following Send packet through as
well. Fixed, plus the collision demo now honours firewall rules, and a cache hit
under an ARP-blocking rule says out loud why the rule did not apply. Added a
structural test that reads `app.js` and fails if any traffic-sending path stops
asking the firewall.

**31 August 2026 (earlier)** — Firewall dialog behaviour: pressing **Done**
with an unsaved selection now adds that rule, pressing **Add rule** and then
Done does not add it twice, and opening and closing without touching anything
adds nothing. That is one `fwDirty` flag, cleared on open and after every
successful add. Add rule is now a primary button like Done, and a newly added
rule flashes so it is obvious something happened. A refused rule keeps the
dialog open with the reason shown inside it. The data-side firewall check moved
inside `deliver()` so ARP runs first (see the firewall note above). Firewall
behaviour is now covered by an exhaustive 54-combination × 5-traffic matrix.

**31 August 2026 (earlier)** — Firewall is now zone-aware: it detects the sides
it separates (two devices, or every branch of a junction) and rules are written
between sides, not just between single devices. The dialog shows those sides
with their members, pre-selects one side on each end, and offers a one-click
"block everything between these two sides". A refused rule now says why inside
the dialog instead of only in the event log behind it.
`firewallCheck()` signature changed to `(devices, links, path, kind)` because
zones need the links.

**31 August 2026 (earlier)** — Firewall rules (ordered, first-match-wins,
default-allow) enforced on every send, with the packet dying at the firewall
rather than vanishing; a rules dialog on right-click and in the inspector. Hub
now floods every frame out of every port and forms one collision domain; access
point does the same over one radio channel but avoids collisions with CSMA/CA.
`isSharedMedium()` / `isWireless()` added to `topologies.js`.

**31 August 2026 (earlier)** — Inspector jumps to the top of the right panel the
moment a device is inspected, and the panel scrolls up with it. Removed the
"Send a packet" title from the send row: with the fixed-width endpoint selects
the row missed fitting on one line by 1.5px at a 1301px viewport, and that title
only repeated the button sitting directly above it.

**31 August 2026 (later)** — Ports, packet records and device editing.
`fitPorts()` sizes preset hardware up a real port ladder; hand-drawn cables are
refused when a device is full. Every device keeps its last 8 packets with
from/to IP + MAC, frame size, hop number and TTL, shown as expandable cards in
the inspector, and the inspector re-renders itself while packets are in flight.
Right-click → *Edit details…* opens a validated dialog for name, type, IP, MAC,
gateway and ports. `window.TopoLab` added as a read-only debug hook.

**Fixed the same day:** killing a device reflowed the whole page. The
source/destination `<select>` options gain a " (down)" suffix when a device
dies; an auto-width select grew, the send row wrapped to two lines, and the
canvas lost that height — so one click on *Kill it and see* shrank the diagram.
`#srcSelect, #dstSelect` are now a fixed 124px (measured: "SRV-1 (down)" needs
122px), so option text can never move the layout again. **Do not put content-
sized controls in that row.**

That fix cost 24px, and on a 1301px-wide viewport the row was already within
1.5px of wrapping — so it wrapped anyway. The redundant "Send a packet" title
was removed from the row (96px): the row directly below a large "▶ Send packet"
button does not need a label repeating it. Measured spare afterwards: 1536px →
339px, 1301px → 103px, 1200px → 3px. Below roughly 1190px the row wraps by
design. **The real lesson: this project's user runs at ~1301 CSS px, not 1536 —
verify layout there.**

**31 August 2026 (earlier)** — Stage bar restored to the two-block shape the
user asked for: banner on the left, `.stage__controls` column on the right with
the legend above a zoom + Repair/Reset row. `align-items: stretch` keeps Repair
flush with the banner's bottom edge; a plain `gap: 8px` inside the column keeps
the empty strip from coming back. The "Healthy" legend entry is back (five
entries). The flat one-line row and the `fitLegend()` JS were both removed for
good. Undo/Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, 60-step snapshot history)
added to the topbar, deliberately outside the stage so they cost no canvas space.
Select tool has no button any more — it is the default state, and Chaos/Delete
plus the device chips are toggles. The Add button is gone; the device list is
always visible. Send bar split into two rows (actions on top, source/destination
below).

**27 August 2026 (latest)** — Devices can tap into an existing cable (three ways:
Add-click on the cable, drop a dragged cable onto it, or the cable's right-click
menu). Manually added devices now take the next free host number in the subnet
instead of `.100 + count`. Panel-collapse rules scoped to wide screens — at the
mobile breakpoint `.stage { order: -1 }` combined with the three-column override
put the stage in a 0px column and the canvas width collapsed to zero.

**27 August 2026 (later)** — Ten device types instead of four (PC, Laptop,
Server, NAS, Printer, Switch, Hub, Access point, Router, Firewall), each with a
hand-drawn 3D icon. Device behaviour now comes from a single `TYPES` registry in
`topologies.js` — add a row there plus an icon in `render.js` and everything else
follows. Cable added as a chip inside Add. Legend moved into the stage bar (one
line, short labels). "Send a packet" moved out of the left panel into a full-width
bar under the canvas. Left and right panels are collapsible (`[` and `]`), and
the diagram refits itself when they open or close.

**27 August 2026** — Edge fade on the canvas so clipped content dissolves instead
of being sliced. `ResizeObserver` moved from `.stage` to the canvas. Canvas
bitmap now maps exactly onto its fractional CSS box. Cable tool merged into Add.
Right-click context menus for devices, cables and empty canvas. Test scripts
moved into the repo as `tests/`. Written this document.

**26 August 2026** — Zoom / pan / fit with a world→screen transform. Layouts
resized by device count (`MIN_GAP`) to stop labels overlapping at 16 devices.
Repair/Reset moved to the stage bar; banner shares that row; event log enlarged.
All user-facing strings converted to English (comments left in Hinglish).
`[hidden]` reset fix. Resilience rewritten as N-1 contingency analysis with three
distinct weakest-point states. `serve.js` + cache busting.

**20 August 2026** — First build: six topology generators, graph engine (BFS,
Dijkstra, Tarjan, components), canvas renderer, packet simulation with ARP and
CSMA/CD, chaos mode, metrics panel, compare mode, README.
