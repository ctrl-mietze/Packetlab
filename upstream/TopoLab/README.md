# TopoLab — Network Topology Simulator

Build a computer network on a canvas, switch it between the six classic
topologies, route live packets through it — then start breaking things and
watch which topology survives.

Plain **HTML, CSS and JavaScript** — no libraries, no build step. Open
`index.html` and it runs.

---

## What it does

Most topology diagrams are pictures. This one is a working model: every
device has an IP and a MAC, every cable has a length that costs latency, and
every failure is recomputed from scratch against the real graph.

| | |
|---|---|
| **Build** | Drop devices on the canvas, drag cables between them, or load one of six topology presets and watch it animate into formation |
| **Route** | Pick a source and destination, choose BFS (fewest hops) or Dijkstra (lowest latency), and watch the packet travel the actual path |
| **Break** | Chaos tool — click any device or cable to kill it. The network reroutes live, or splits into islands |
| **Measure** | Live resilience scoring, single-point-of-failure detection, diameter, average hops, cable cost |
| **Compare** | Two topologies side by side with a metric-by-metric scoreboard and a verdict |
| **Advise** | Say how many devices you have and what matters — uptime, speed, cost, ease of growth — and get all six ranked, with the reasoning and a one-click build |
| **Analyse** | Capacity between two devices (how many routes share no cable, and which cables would have to be cut), and the cheapest possible wiring compared against yours |
| **Export** | Save the diagram as a PNG, redrawn full-size rather than screenshotted |
| **Inspect** | Click any device for its IP, MAC, ports, ARP cache, routing table — and the last 8 packets that passed through it, frame by frame |
| **Edit** | Right-click any device to change its name, type, IP, MAC, gateway and port count, with real validation |

---

## The algorithms

This is the part that matters. Nothing here is faked — the visuals are
driven by real graph algorithms running against the live network.

| Algorithm | Where it runs | What it answers |
|---|---|---|
| **BFS** | Packet routing, all-pairs stats | Fewest-hop path between two devices |
| **Dijkstra** | Packet routing | Cheapest path when cable length costs latency |
| **Tarjan's articulation points** | Every structural change | Which *devices* are single points of failure |
| **Tarjan's bridges** | Every structural change | Which *cables* split the network if cut |
| **Connected components** | Chaos mode | Did the network just break into islands? |
| **N-1 contingency analysis** | Resilience score | Simulates every single failure in turn to find the worst one |
| **Edmonds-Karp max-flow / min-cut** | Capacity analysis | How many routes between two devices share no cable, and the smallest set of cables that separates them |
| **Kruskal MST + union-find** | Cheapest wiring | The shortest possible way to connect these devices, as a yardstick against the current layout |
| **Weighted multi-criteria scoring** | Advisor | Which topology best fits *these* devices and *these* priorities |

Tarjan runs in a single DFS pass and finds cut vertices *and* cut edges at
once — implemented with an explicit stack rather than recursion so large
networks don't blow the call stack.

---

## What the numbers say

Every topology, built at 8 devices, measured by the tool itself:

| Topology | Cables | Diameter | Redundancy | Worst-case survival | Resilience |
|---|--:|--:|--:|--:|--:|
| **Star** | 7 | 2 | 0% | 14% | **8** |
| **Bus** | 7 | 7 | 0% | 50% | 19 |
| **Tree** | 7 | 4 | 0% | 50% | 19 |
| **Hybrid** | 8 | 3 | 38% | 57% | 37 |
| **Ring** | 8 | 4 | 100% | 100% | 75 |
| **Mesh** | 28 | 1 | 100% | 100% | **100** |

"Worst-case survival" asks: after the single worst failure, what fraction of
the devices that *remain* can still reach each other? Ring and Mesh both hit
100% — no single failure disconnects anybody — which is exactly what having
zero articulation points and zero bridges means.

The trade-off falls straight out of the data: Mesh is unbreakable by any
single failure but needs **four times** the cable of Star. Ring buys the same
survivability for one extra cable, paying for it in hop count. Star has the
best latency of the cheap options and the worst failure mode in the table —
kill the hub and only 14% of the survivors can still talk.

Two contrasts worth running yourself:

- **Star vs Ring** — one extra cable takes redundancy from 0% to 100%.
  Ring survives any single cut; Star has a hub that takes everything with it.
- **Bus vs Star** — identical cable count, wildly different behaviour. Bus
  splits in half when cut anywhere; Star loses one machine per cut, unless
  the cut is the hub.

---

## Protocol layer

Beyond the graph, the simulation models what actually happens on the wire:

- **Addressing** — every device gets an IP and a stable MAC. Router-based
  topologies (Tree, Hybrid) put each switch on its own `/24` subnet.
- **ARP** — sending to an unknown host triggers a real broadcast that ripples
  outward hop by hop, followed by a unicast reply. The MAC lands in the
  sender's ARP cache, and the next send to that host skips the broadcast.
- **Routing tables** — routers compute next-hop per subnet from the live
  graph. Kill a switch and its subnet flips to `unreachable`.
- **Ports** — every device has a real port count (a PC has 2, a switch 8), and
  cables consume them. Presets size their hardware up the ladder real gear
  comes in — 1, 2, 4, 8, 16, 24, 48 — so a mesh node with 7 cables is an
  8-port box. Draw a cable into a full device and it is refused. A cut cable
  still occupies its port, because it is still plugged in.
- **Frame inspection** — every device remembers the last 8 packets that passed
  through it: source and destination IP *and* MAC, frame size (1500 bytes for
  data, 64 for ARP), which hop of the route it was, and the TTL. TTL drops at
  routers and not at switches, which is the whole reason traceroute works.
- **Firewall zones** — a firewall works out for itself which parts of the
  network it separates: pull it out of the graph, and each piece that falls
  apart is one side. Between two devices that is two sides; at a junction it is
  one side per branch; and if there is a path around the firewall, those
  neighbours correctly count as the same side. Rules are then written side to
  side, not just device to device.
- **Firewall rules** — an ordered list, read top to bottom, first match wins,
  anything unmatched allowed. Block a pair and the packet flies as far as the
  firewall and dies there, naming the rule that stopped it.
- **Hub vs switch** — a hub repeats every frame out of every other port and is
  one big collision domain. A switch instead builds a **MAC address table**: it
  learns which port each MAC lives behind and, once it knows, sends the frame
  only there. Until it knows, it floods — so the first frame to a silent device
  goes everywhere and later ones do not. Both are visible in the inspector.
- **Routers bound the broadcast domain** — an ARP broadcast reaches a router and
  stops. That is why a host talking to another subnet never ARPs for the far
  machine: it asks for its **gateway's** MAC and hands the frame to the router.
- **Listening ports** — a server answers on 80/443/22, a printer on 9100/631, a
  NAS on 445/2049, a hub on nothing at all. Traffic goes to the destination's
  service, firewall rules can name a single port, and sending to something that
  listens on nothing is refused.
- **Access point** — one radio channel shared by everyone on it. Because a
  radio cannot listen while it transmits, Wi-Fi avoids collisions (CSMA/CA)
  rather than detecting them: the second sender waits for a clear channel.
- **CSMA/CD** — on a Bus, two simultaneous senders collide. Both send a jam
  signal, back off for randomised intervals, and retry. On a switched
  topology the same two senders *don't* collide — the switch buffers the
  first frame and queues the second, because every port is its own collision
  domain.

---

## Running it

```bash
git clone <repo-url>
cd TopoLab
```

Open `index.html` in a browser. That's the whole setup.

Or serve it locally — `serve.js` is a ~40-line static server with no
dependencies. It exists because `python -m http.server` sends caching
headers, and a cached copy of the JS will silently keep running after you
edit a file:

```bash
node serve.js
```

Then open `http://127.0.0.1:5180`.

### Tests

The algorithms carry no DOM references, so they run headless in Node — no
browser, no test framework:

```bash
node tests/graph.test.js
node tests/sim.test.js
node tests/advisor.test.js
node tests/flow.test.js
node tests/sweep.test.js
```

34 assertions on the graph engine (SPOF detection, diameter, chaos, routing,
resilience) and 158 on the simulation (packet delivery, speed proportional to
cable length, ARP resolution, mid-flight failure, CSMA/CD on bus vs switch,
routing tables, per-device packet records with TTL, port sizing across all six
topologies, hub/switch/access-point behaviour, MAC learning, broadcast domains,
gateway ARP, listening ports, firewall zones, and two exhaustive firewall
matrices — every combination of block/allow x protocol x
anyone/device/side, checked against five kinds of traffic). The advisor adds 49
more, covering all 81 preference combinations across eight network sizes — 648
recommendations checked for sane, ordered, non-degenerate output, and `flow.js`
another 46 — max-flow checked against known answers, then verified to equal the
min-cut for every pair of devices in every topology.

`sweep.test.js` is the odd one out: instead of testing a unit, it builds every
topology at every size from 3 to 24 and asserts the invariants that must hold
everywhere — no duplicate IPs or MACs, no device short of ports, no gateway
pointing at an address nothing owns, a packet actually arriving between all 712
host pairs, no NaN after killing any device or cable in turn, and one single
definition of length shared by every module. A sweep like that is what caught
the phantom-gateway bug.

### Shortcuts

| Key | Action |
|---|---|
| `V` / `X` / `D` | Select · Chaos · Delete |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Space` | Send a packet |
| `F` | Fit the whole network in view |
| `+` / `−` | Zoom in / out |
| `[` / `]` | Show or hide the left / right panel |
| `Esc` | Close whatever is open — compare, advisor, or a dialog |

Right-click any device, cable, or empty canvas for the actions that apply to
it — inspect it, edit its name/IP/MAC/ports, set a packet's source or
destination, kill or repair it, delete it, drop a new device where you clicked.
Right-clicking a firewall also opens its rule list.

Pick a device type from the left panel and click empty canvas to drop one; pick
**Cable** and drag between two devices to wire them, or drop the cable onto an
existing cable to tap a device into it. Clicking the same chip again returns to
select mode. Ten device types are available — PC, laptop,
server, NAS and printer as end devices; switch, hub, access point, router and
firewall as network gear. They are not interchangeable skins: a switch keeps a
MAC table, a hub floods everything, an access point shares one radio channel, a
router ends the broadcast domain, and a firewall filters. Any device's type can
be changed later from its edit dialog.

On a phone the layout collapses to one column, the six topology chips become a
picker dialog listing each one with a short description, and the stage controls
stack rather than running off the edge.

The canvas is driven by pointer events, so it works the same with a finger as
with a mouse: drag a device to move it, drag empty space to pan, pinch with two
fingers to zoom, and hold a device for half a second to get the menu that a
right-click gives on desktop.

On a phone or tablet, **Add to Home screen** launches it full screen with no
browser toolbar — the manifest declares `display: standalone`.

Scroll to zoom at the cursor, and drag empty canvas to pan. Layouts are
sized by device count rather than by the canvas, so a 24-device tree is
wider than the viewport by design — the view zooms to fit instead of
squeezing nodes together until their labels collide.

---

## Things to try

1. Load **Star**, hit **☠ Kill it and see** on the weakest-point card.
   The switch dies and the network shatters into 7 isolated islands.
2. Load **Ring**, send a packet, then cut a cable *on the active route*.
   The traffic reroutes the other way around the ring and the log tells you
   the new hop count.
3. Cut a second ring cable. Now it splits.
4. Load **Mesh** and try to break it. You can't — with one cut, nothing
   changes.
5. Load **Bus**, hit **Collision demo**, then switch to **Star** and hit it
   again. Same two senders, completely different outcome.
6. Load **Tree** and send a packet across the two subnets. Read the log: the
   sender does not ARP for the far machine at all — it asks for its gateway,
   because the router never let the broadcast through.
7. Inspect a switch, send a packet, and inspect it again — its MAC address
   table now has entries. Change that switch to a **Hub** from its edit dialog
   and send again: every device on it now hears traffic meant for someone else.
8. Right-click a router, change its type to **Firewall**, open its rules, and
   press *Block everything between these two sides*. The packet now flies as far
   as the firewall and dies there, naming the rule that stopped it.
9. Open **🎯 Advise**, set Cost to High and Staying up to Low, then flip them.
   Watch the ranking invert — every number in that table was measured, not
   assumed.
10. Load **Ring**, pick two devices on opposite sides, and hit **⇉ Capacity**.
    Two routes, and the two cables that would have to be cut light up in pink.
    Cut one of them and press it again — one route left.
11. Load **Mesh** and hit **⌇ Cheapest wiring**. The green dashed overlay is the
    shortest tree that still connects everything, using 7 cables instead of 28 —
    and with no spare route anywhere, which is the point.

---

## Project structure

```
TopoLab/
├── index.html
├── styles.css
├── manifest.webmanifest   installable, opens without browser chrome
├── icon.svg
└── js/
    ├── graph.js       algorithms only — BFS, Dijkstra, Tarjan, components, N-1
    ├── topologies.js  the six generators, layouts, IP/MAC assignment
    ├── render.js      canvas drawing + hit testing
    ├── sim.js         packet flights, ARP, CSMA/CD, firewall rules, routing tables
    ├── advisor.js     measures all six and ranks them against your priorities
    ├── flow.js        Edmonds-Karp max-flow/min-cut and Kruskal MST
    └── app.js         state, events, panels, compare mode
```

`graph.js` has no DOM references at all — it takes arrays of devices and
links and returns numbers, which is why the algorithms are testable on their
own.

---

## Concepts covered

Graph theory (connectivity, cut vertices, cut edges, shortest paths,
graph diameter) · network topologies and their trade-offs · fault tolerance
and N-1 contingency analysis · ARP resolution · IP subnetting and routing
tables · CSMA/CD and collision domains · Canvas rendering, HiDPI scaling and
hit testing.
