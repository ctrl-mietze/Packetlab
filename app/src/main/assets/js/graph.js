/* =========================================================
   TopoLab — graph.js
   Network ka "dimaag". Yahan koi UI code nahi hai — sirf pure
   graph algorithms jo devices + links ko ek graph maan ke chalte hain.

   Network ko graph me kaise dekhte hain:
     device  ->  vertex (node)
     cable   ->  edge
     dead device / cut cable  ->  wo vertex/edge graph se hata do

   Sections:
   1. Adjacency build          4. Connectivity (components)
   2. Shortest path (BFS)      5. Tarjan — SPOF (articulation points + bridges)
   3. Shortest path (Dijkstra) 6. All-pairs stats (diameter, avg hops)
   ========================================================= */

const Graph = (() => {

  /* ---------------------------------------------------------
     1. ADJACENCY BUILD

     Har baar algorithm chalane se pehle hum live network ka
     adjacency list banate hain. "Live" matlab: mare hue devices
     aur kate hue cables ko chhod do — wo exist hi nahi karte.
     --------------------------------------------------------- */
  function build(devices, links) {
    const adj = new Map();
    const alive = new Set();

    for (const d of devices) {
      if (d.dead) continue;
      alive.add(d.id);
      adj.set(d.id, []);
    }

    for (const l of links) {
      if (l.dead) continue;
      // dono sire zinda hone chahiye, warna cable bekaar hai
      if (!alive.has(l.a) || !alive.has(l.b)) continue;
      adj.get(l.a).push({ to: l.b, linkId: l.id, cost: l.cost });
      adj.get(l.b).push({ to: l.a, linkId: l.id, cost: l.cost });
    }

    return adj;
  }

  /* ---------------------------------------------------------
     2. BFS — sabse kam HOPS waala raasta

     Network me "hop" matlab ek device se agle device tak ek chhalang.
     BFS level-by-level chalta hai isliye jo pehli baar destination
     pe pahuncha wahi minimum-hop raasta hai.

     visitedOrder animation ke liye hai — kis kram me network explore hua.
     --------------------------------------------------------- */
  function bfs(adj, src, dst) {
    if (!adj.has(src) || !adj.has(dst)) return null;

    const prev = new Map([[src, null]]);
    const prevLink = new Map();
    const visitedOrder = [];
    const queue = [src];
    let head = 0;                     // shift() O(n) hota hai, pointer se O(1)

    while (head < queue.length) {
      const cur = queue[head++];
      visitedOrder.push(cur);
      if (cur === dst) break;

      for (const edge of adj.get(cur)) {
        if (prev.has(edge.to)) continue;
        prev.set(edge.to, cur);
        prevLink.set(edge.to, edge.linkId);
        queue.push(edge.to);
      }
    }

    if (!prev.has(dst)) return null;  // pahunch hi nahi sakte
    return Object.assign(trace(prev, prevLink, dst), { visitedOrder });
  }

  /* ---------------------------------------------------------
     3. DIJKSTRA — sabse "sasta" raasta

     Yahan har cable ka ek cost hai (hum uski asli lambai use karte
     hain — lamba cable = zyada latency). Dijkstra hamesha abhi tak
     ke sabse saste node ko expand karta hai.

     Binary heap ki jagah simple linear-scan min nikala hai kyunki
     network me nodes 60 se zyada nahi hote — O(V^2) yahan bilkul
     theek hai aur code padhne me saaf rehta hai.
     --------------------------------------------------------- */
  function dijkstra(adj, src, dst) {
    if (!adj.has(src) || !adj.has(dst)) return null;

    const dist = new Map();
    const prev = new Map([[src, null]]);
    const prevLink = new Map();
    const done = new Set();
    const visitedOrder = [];

    for (const id of adj.keys()) dist.set(id, Infinity);
    dist.set(src, 0);

    while (true) {
      // abhi tak ka sabse sasta un-visited node dhoondo
      let cur = null, best = Infinity;
      for (const [id, d] of dist) {
        if (!done.has(id) && d < best) { best = d; cur = id; }
      }
      if (cur === null) break;        // baaki sab reachable nahi hai

      done.add(cur);
      visitedOrder.push(cur);
      if (cur === dst) break;

      for (const edge of adj.get(cur)) {
        if (done.has(edge.to)) continue;
        const alt = dist.get(cur) + edge.cost;
        if (alt < dist.get(edge.to)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, cur);
          prevLink.set(edge.to, edge.linkId);
        }
      }
    }

    if (dist.get(dst) === Infinity) return null;
    return Object.assign(trace(prev, prevLink, dst), {
      cost: dist.get(dst),
      visitedOrder,
    });
  }

  /* prev-pointers ko ulta chal ke asli path banate hain */
  function trace(prev, prevLink, dst) {
    const path = [], linkPath = [];
    let cur = dst;
    while (cur !== null && cur !== undefined) {
      path.push(cur);
      if (prevLink.has(cur)) linkPath.push(prevLink.get(cur));
      cur = prev.get(cur);
    }
    path.reverse();
    linkPath.reverse();
    return { path, linkPath, hops: path.length - 1 };
  }

  /* ---------------------------------------------------------
     4. CONNECTED COMPONENTS

     Chaos mode ka dil. Jab tum cable kaatte ho, sawal ye hai:
     network ek hi tukda raha, ya do alag-alag islands ban gaye?

     Har component ek island hai. components.length > 1 matlab
     NETWORK SPLIT — kuch devices ab kabhi baat nahi kar sakte.
     --------------------------------------------------------- */
  function components(adj) {
    const seen = new Set();
    const out = [];

    for (const start of adj.keys()) {
      if (seen.has(start)) continue;

      const group = [];
      const stack = [start];
      seen.add(start);

      while (stack.length) {
        const cur = stack.pop();
        group.push(cur);
        for (const edge of adj.get(cur)) {
          if (seen.has(edge.to)) continue;
          seen.add(edge.to);
          stack.push(edge.to);
        }
      }
      out.push(group);
    }

    // sabse bada island pehle — UI me "main network" wahi hai
    out.sort((a, b) => b.length - a.length);
    return out;
  }

  /* ---------------------------------------------------------
     5. TARJAN — SINGLE POINTS OF FAILURE

     Ye is project ka sabse important algorithm hai.

     Articulation point (cut vertex) = aisa DEVICE jo mar jaaye to
        network do tukdon me toot jaaye.
        Star topology ka hub iska perfect example hai.

     Bridge (cut edge) = aisa CABLE jo kat jaaye to network toot jaaye.
        Ring me koi bridge nahi hota (har jagah do raaste hain),
        Bus me HAR cable bridge hai.

     Kaise kaam karta hai (ek hi DFS me dono nikal jaate hain):
       disc[u] = u pe DFS kab pahuncha (discovery time)
       low[u]  = u ke subtree se ek bhi back-edge upar chadh ke
                 jitna peeche pahunch sakta hai, uska minimum disc

       child v ke liye low[v] >= disc[u]  =>  u articulation point hai
                (v neeche se u ko bypass karke upar nahi pahunch sakta)
       low[v] >  disc[u]                  =>  edge u-v ek bridge hai

     Recursion ki jagah explicit stack use kiya hai taaki bade network
     par call stack na phate.
     --------------------------------------------------------- */
  function findSPOF(adj) {
    const disc = new Map();      // discovery time
    const low  = new Map();      // low-link value
    const parent = new Map();
    const artPoints = new Set();
    const bridgeIds = new Set();
    let timer = 0;

    for (const root of adj.keys()) {
      if (disc.has(root)) continue;

      let rootChildren = 0;
      parent.set(root, null);

      // stack frame: {node, i} — i batata hai kaunsa padosi agla
      // dekhna hai (recursion ki jagah manual iteration)
      const stack = [{ node: root, i: 0 }];
      disc.set(root, timer); low.set(root, timer); timer++;

      while (stack.length) {
        const frame = stack[stack.length - 1];
        const u = frame.node;
        const edges = adj.get(u);

        if (frame.i < edges.length) {
          const edge = edges[frame.i++];
          const v = edge.to;

          if (!disc.has(v)) {
            // naya node — DFS tree me neeche jaao
            parent.set(v, { node: u, linkId: edge.linkId });
            if (u === root) rootChildren++;
            disc.set(v, timer); low.set(v, timer); timer++;
            stack.push({ node: v, i: 0 });

          } else if (parent.get(u) === null || v !== parent.get(u).node) {
            // back-edge — upar chadhne ka raasta mila
            low.set(u, Math.min(low.get(u), disc.get(v)));
          }

        } else {
          // u ke saare padosi ho gaye — ab parent ko low value pass karo
          stack.pop();
          const p = parent.get(u);
          if (p) {
            low.set(p.node, Math.min(low.get(p.node), low.get(u)));

            // ROOT ka rule alag hai (neeche dekho), baaki sab ke liye:
            if (p.node !== root && low.get(u) >= disc.get(p.node)) {
              artPoints.add(p.node);
            }
            // bridge check — strictly greater
            if (low.get(u) > disc.get(p.node)) {
              bridgeIds.add(p.linkId);
            }
          }
        }
      }

      // ROOT special case: root tabhi articulation point hai jab uske
      // DFS tree me 2 ya zyada children hon. Ek child matlab root sirf
      // ek hi taraf jud raha hai — usse hatao to bhi baaki jude rahenge.
      if (rootChildren > 1) artPoints.add(root);
    }

    return { articulation: artPoints, bridges: bridgeIds };
  }

  /* ---------------------------------------------------------
     6. ALL-PAIRS STATS

     Har node se BFS chala ke poore network ki sehat naapte hain:

       diameter  = do sabse door devices ke beech kitne hops
                   (worst-case latency — chhota matlab behtar)
       avgHops   = average distance (typical latency)
       reachable = kitne jode aapas me baat kar sakte hain (%)
     --------------------------------------------------------- */
  function stats(adj) {
    const nodes = [...adj.keys()];
    const n = nodes.length;
    if (n < 2) return { diameter: 0, avgHops: 0, reachablePct: n ? 100 : 0 };

    let diameter = 0, sum = 0, pairs = 0, reachablePairs = 0;

    for (const src of nodes) {
      const dist = new Map([[src, 0]]);
      const queue = [src];
      let head = 0;

      while (head < queue.length) {
        const cur = queue[head++];
        for (const edge of adj.get(cur)) {
          if (dist.has(edge.to)) continue;
          dist.set(edge.to, dist.get(cur) + 1);
          queue.push(edge.to);
        }
      }

      for (const dst of nodes) {
        if (dst === src) continue;
        pairs++;
        if (!dist.has(dst)) continue;   // alag island me hai
        reachablePairs++;
        sum += dist.get(dst);
        if (dist.get(dst) > diameter) diameter = dist.get(dst);
      }
    }

    return {
      diameter,
      avgHops: reachablePairs ? sum / reachablePairs : 0,
      reachablePct: pairs ? (reachablePairs / pairs) * 100 : 100,
    };
  }

  /* ---------------------------------------------------------
     7. RESILIENCE — "N-1 CONTINGENCY ANALYSIS"

     Asli networking me ye ek standard exercise hai: maan lo koi EK
     cheez fail ho gayi (N-1) — network kitna zinda bachega?

     Hum shortcut nahi lete. Har device ko baari-baari maarte hain,
     har cable ko baari-baari kaatte hain, aur har baar dekhte hain
     ki sabse bada bacha hua tukda kitna bada hai. Jo failure sabse
     zyada nuksaan kare — wahi network ka weakest point hai.

     Teen numbers nikalte hain:
       redundancy  = kitne % cables aise hain jinke katne par bhi
                     network juda rehta hai (bridge nahi hain)
       survival    = worst single failure ke baad kitna % network
                     ab bhi ek saath juda hua hai
       pathDiversity = average degree se — kitne alternate raaste hain

     score inhi teenon ka weighted mix hai. Isse Bus/Star/Tree alag-alag
     numbers dete hain (pehle teenon 0 pe tie ho jaate the).
     --------------------------------------------------------- */
  function resilience(devices, links) {
    const aliveDevices = devices.filter(d => !d.dead);
    const aliveLinks   = links.filter(l => !l.dead &&
      aliveDevices.some(d => d.id === l.a) && aliveDevices.some(d => d.id === l.b));

    const n = aliveDevices.length;
    if (n < 2 || aliveLinks.length === 0) {
      // 2+ devices hain par ek bhi cable nahi — matlab sab alag-thalag pade hain
      return { score: 0, redundancyPct: 0, survivalPct: 0, pathDiversity: 0,
               worst: null, alreadySplit: n > 1 };
    }

    const adj  = build(aliveDevices, aliveLinks);
    const spof = findSPOF(adj);

    /* Network PEHLE SE toota hua hai to "weakest point" ka koi matlab nahi —
       sawal ab ye nahi hai ki ise kaun tod sakta hai, ye to toot chuka hai.
       Isliye yahin se laut jaate hain aur UI ko alag se bata dete hain. */
    if (components(adj).length > 1) {
      return { score: 0, redundancyPct: 0, survivalPct: 0, pathDiversity: 0,
               worst: null, alreadySplit: true };
    }

    // --- redundancy: non-bridge cables ka hissa ---
    const redundancyPct = 100 * (1 - spof.bridges.size / aliveLinks.length);

    /* --- survival: har single failure simulate karo ---

       Naapte kya hain: failure ke baad JO DEVICES BACHE HAIN, unme se
       kitne aapas me abhi bhi juda hue hain.

       Denominator me BACHE HUE devices aate hain, kul devices nahi. Device
       maarne par wo khud to jaayega hi — wo koi "nuksaan" nahi hai, wahi
       to failure hai. Nuksaan ye hai ki uske jaane se BAAKI log aapas me
       kat gaye ya nahi. Pehle hum kul devices se bhaag dete the, isliye
       full mesh bhi kabhi 100% nahi dikhata tha aur "koi single failure
       ise tod nahi sakta" wali baat kabhi trigger hi nahi hoti thi. */
    let worstPct = 100;
    let worst = null;

    const largestAfter = (devs, lks) => {
      const comps = components(build(devs, lks));
      return comps.length ? comps[0].length : 0;
    };

    // har device ko ek-ek karke maaro
    for (const victim of aliveDevices) {
      const remaining = n - 1;
      if (remaining < 1) continue;
      const devs = aliveDevices.map(d => d.id === victim.id ? { ...d, dead: true } : d);
      const pct = 100 * (largestAfter(devs, aliveLinks) / remaining);
      if (pct < worstPct) {
        worstPct = pct;
        worst = { kind: 'device', id: victim.id, connectedPct: pct };
      }
    }

    // har cable ko ek-ek karke kaato (yahan koi device nahi jaata, sab bache hain)
    for (const victim of aliveLinks) {
      const lks = aliveLinks.map(l => l.id === victim.id ? { ...l, dead: true } : l);
      const pct = 100 * (largestAfter(aliveDevices, lks) / n);
      if (pct < worstPct) {
        worstPct = pct;
        worst = { kind: 'link', id: victim.id, connectedPct: pct };
      }
    }

    /* worst tabhi set hota hai jab koi failure sach me network todti ho.
       Ring aur mesh me koi nahi todti — wahan worst null rehta hai aur
       survival 100%, jo banner ("no single point of failure") se mel khata hai. */
    const survivalPct = worstPct;

    // --- path diversity: average degree, 1 (chain) se n-1 (full mesh) ---
    const avgDegree = (aliveLinks.length * 2) / n;
    const pathDiversity = 100 * Math.min(1, Math.max(0, (avgDegree - 1) / Math.max(1, n - 2)));

    const score = 0.40 * redundancyPct + 0.30 * survivalPct + 0.30 * pathDiversity;

    return {
      score: Math.max(0, Math.min(100, score)),
      redundancyPct,
      survivalPct,
      pathDiversity,
      worst,                 // UI isse "weakest point" highlight karta hai (null = koi weak point nahi)
      alreadySplit: false,
    };
  }

  return { build, bfs, dijkstra, components, findSPOF, stats, resilience };
})();

if (typeof module !== 'undefined') module.exports = Graph;
