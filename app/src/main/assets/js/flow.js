/* =========================================================
   TopoLab — flow.js

   Do sawaal jinka jawab graph theory ke classic algorithms dete hain:

     1. "A se B tak ek saath kitna traffic ja sakta hai, aur agar main
         network kaatna chahun to sabse kam kitne cable kaatne padenge?"
         -> MAX-FLOW / MIN-CUT (Edmonds-Karp)

     2. "In devices ko jodne ka sabse sasta tareeka kya hai?"
         -> MINIMUM SPANNING TREE (Kruskal + union-find)

   Ye dono ek doosre ke ulat sawaal hain aur isi liye saath rakhe hain:
   pehla poochhta hai network kitna mazboot hai, doosra poochhta hai
   sabse kam kharche me kaam kaise chalega.

   graph.js ki tarah ye file bhi DOM se aazad hai — poora hissa Node me
   test ho jaata hai.

   Sections:
   1. Max-flow / min-cut      2. Minimum spanning tree
   ========================================================= */

const Flow = (() => {

  /* ---------------------------------------------------------
     1. MAX-FLOW / MIN-CUT — Edmonds-Karp

     Har cable ki capacity 1 maani jaati hai. Ek unit flow = ek aisa
     raasta jo kisi doosre raaste ke saath cable share nahi karta.
     Isliye is network me max-flow ka matlab seedha hai:

       "A aur B ke beech kitne ALAG-ALAG raaste hain jo aapas me koi
        cable share nahi karte"

     Aur min-cut theorem kehta hai wo ginti utni hi hai jitne kam se kam
     cable kaat kar A ko B se alag kiya ja sakta hai. Yani 3 ka matlab:
     teen raaste hain, aur teen se kam cable kaat kar tod nahi sakte.

     Edmonds-Karp isliye ki wo har baar BFS se SABSE CHHOTA augmenting
     path dhoondhta hai. Isse chalne ka samay O(V*E^2) me bandh jaata
     hai — DFS wale bhole Ford-Fulkerson ki tarah capacity ke numbers par
     nahi latakta.

     Cable dono taraf chalti hai, isliye har cable ko do directed edges
     me todte hain, dono ki capacity 1.
     --------------------------------------------------------- */
  function buildFlowNetwork(devices, links) {
    const alive = devices.filter(d => !d.dead);
    const ids = new Set(alive.map(d => d.id));

    // cap.get(u).get(v) = u se v tak kitni jagah bachi hai
    const cap = new Map(alive.map(d => [d.id, new Map()]));
    const edgeOf = new Map();          // "u|v" -> link id (min-cut naam ke liye)

    for (const l of links) {
      if (l.dead || !ids.has(l.a) || !ids.has(l.b)) continue;
      cap.get(l.a).set(l.b, (cap.get(l.a).get(l.b) || 0) + 1);
      cap.get(l.b).set(l.a, (cap.get(l.b).get(l.a) || 0) + 1);
      edgeOf.set(`${l.a}|${l.b}`, l.id);
      edgeOf.set(`${l.b}|${l.a}`, l.id);
    }
    return { cap, edgeOf, ids };
  }

  function maxFlow(devices, links, srcId, dstId) {
    if (srcId === dstId) return { flow: 0, paths: [], cut: [], sameNode: true };

    const { cap, edgeOf, ids } = buildFlowNetwork(devices, links);
    if (!ids.has(srcId) || !ids.has(dstId)) {
      return { flow: 0, paths: [], cut: [], unreachable: true };
    }

    const paths = [];
    let flow = 0;

    /* Har chakkar me BFS se ek sabse chhota bacha hua raasta dhoondho */
    for (;;) {
      const parent = new Map([[srcId, null]]);
      const queue = [srcId];
      let head = 0;
      while (head < queue.length && !parent.has(dstId)) {
        const u = queue[head++];
        for (const [v, c] of cap.get(u)) {
          if (c <= 0 || parent.has(v)) continue;
          parent.set(v, u);
          queue.push(v);
        }
      }
      if (!parent.has(dstId)) break;              // aur raasta nahi bacha

      // raasta ulta jodo aur usme se 1 unit nikaal lo
      const path = [];
      for (let v = dstId; v !== null; v = parent.get(v)) path.unshift(v);
      for (let i = 0; i < path.length - 1; i++) {
        const u = path[i], v = path[i + 1];
        cap.get(u).set(v, cap.get(u).get(v) - 1);
        cap.get(v).set(u, (cap.get(v).get(u) || 0) + 1);   // residual, wapas jaane ke liye
      }
      paths.push(path);
      flow++;
      if (flow > links.length + 1) break;         // suraksha: kabhi anant loop na ho
    }

    /* MIN-CUT: bache hue graph me source se jahan tak pahunch sakte hain
       wo ek taraf, baaki doosri taraf. Jo cable in dono ko jodte hain —
       wahi sabse chhota cut hain. Ginti hamesha max-flow ke barabar. */
    const reach = new Set([srcId]);
    const q2 = [srcId];
    let h2 = 0;
    while (h2 < q2.length) {
      const u = q2[h2++];
      for (const [v, c] of cap.get(u)) {
        if (c > 0 && !reach.has(v)) { reach.add(v); q2.push(v); }
      }
    }

    const cut = [];
    const seen = new Set();
    for (const l of links) {
      if (l.dead) continue;
      const aIn = reach.has(l.a), bIn = reach.has(l.b);
      if (aIn !== bIn && !seen.has(l.id)) { seen.add(l.id); cut.push(l.id); }
    }

    return { flow, paths, cut, reachSide: [...reach] };
  }

  /* Har jodde ka max-flow — jahan sabse kam ho wahi network ki sabse
     kamzor jodi hai. n^2 baar Edmonds-Karp chalta hai, isliye ye sirf
     chhote networks ke liye theek hai; app 24 devices par rukta hai. */
  function weakestPair(devices, links) {
    const hosts = devices.filter(d => !d.dead);
    let worst = null;
    for (let i = 0; i < hosts.length; i++) {
      for (let j = i + 1; j < hosts.length; j++) {
        const r = maxFlow(devices, links, hosts[i].id, hosts[j].id);
        if (!worst || r.flow < worst.flow) {
          worst = { a: hosts[i], b: hosts[j], flow: r.flow, cut: r.cut };
        }
      }
    }
    return worst;
  }

  /* ---------------------------------------------------------
     2. MINIMUM SPANNING TREE — Kruskal

     "Sabse kam cable me sab devices ko jodna hai." Kruskal saare
     sambhavit cables ko lambai ke hisaab se chhote-se-bade lagata hai
     aur har wo cable rakhta hai jo do ALAG tukdon ko jodta ho.

     Union-find (path compression + union by rank ke saath) batata hai ki
     do device pehle se ek hi tukde me hain ya nahi — yahi wo hissa hai
     jo Kruskal ko tez banata hai.

     Nateeja hamesha n-1 cable hota hai aur usme koi loop nahi hota.
     Faayda: sabse sasta. Nuksaan: koi redundancy nahi — har cable ek
     bridge hai, kahin bhi kaato to network do tukde. Isi liye MST
     "kitna sasta ho sakta tha" ka paimana hai, sujhaav nahi.
     --------------------------------------------------------- */
  function makeDSU(ids) {
    const parent = new Map(ids.map(id => [id, id]));
    const rank = new Map(ids.map(id => [id, 0]));

    const find = (x) => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root);
      while (parent.get(x) !== root) {           // path compression
        const next = parent.get(x);
        parent.set(x, root);
        x = next;
      }
      return root;
    };

    const union = (a, b) => {
      const ra = find(a), rb = find(b);
      if (ra === rb) return false;               // pehle se juda hua
      const da = rank.get(ra), db = rank.get(rb);
      if (da < db) parent.set(ra, rb);
      else if (da > db) parent.set(rb, ra);
      else { parent.set(rb, ra); rank.set(ra, da + 1); }
      return true;
    };

    return { find, union };
  }

  /* Lambai ka paimana topologies.js se aata hai — app me sirf ek hi
     paribhasha honi chahiye, warna do jagah do alag numbers dikhte hain. */
  const metres = (a, b) => Topologies.metresBetween(a, b);

  /* Sabse sasta jodne ka tareeka — har sambhavit jodde par vichaar karke,
     sirf maujooda cables tak seemit nahi. Isi liye ye batata hai ki
     "ho sakta tha kitna sasta", aur maujooda layout usse kitna mehnga hai. */
  function mst(devices) {
    const alive = devices.filter(d => !d.dead);
    if (alive.length < 2) return { edges: [], length: 0, complete: alive.length === 1 };

    const candidates = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        candidates.push({ a: alive[i], b: alive[j], w: metres(alive[i], alive[j]) });
      }
    }
    candidates.sort((x, y) => x.w - y.w);

    const dsu = makeDSU(alive.map(d => d.id));
    const edges = [];
    let length = 0;

    for (const c of candidates) {
      if (edges.length === alive.length - 1) break;
      if (!dsu.union(c.a.id, c.b.id)) continue;
      edges.push({ a: c.a.id, b: c.b.id, w: c.w });
      length += c.w;
    }

    return { edges, length, complete: edges.length === alive.length - 1 };
  }

  /* Maujooda cabling MST se kitni mehngi hai */
  function cableReport(devices, links) {
    const at = new Map(devices.map(d => [d.id, d]));
    let current = 0;
    let counted = 0;
    for (const l of links) {
      if (l.dead) continue;
      const A = at.get(l.a), B = at.get(l.b);
      if (!A || !B || A.dead || B.dead) continue;
      current += metres(A, B);
      counted++;
    }

    const best = mst(devices);
    const alive = devices.filter(d => !d.dead).length;

    return {
      currentMetres: current,
      currentCables: counted,
      mstMetres: best.length,
      mstCables: best.edges.length,
      edges: best.edges,
      /* MST se kam bhi ho sakta hai — agar network TOOTA hua ho, kyunki
         tab usme n-1 se kam cable hote hain. Isliye saving tabhi dikhate
         hain jab maujooda cabling sach me zyada ho. */
      savingMetres: Math.max(0, current - best.length),
      extraCables: Math.max(0, counted - best.edges.length),
      devices: alive,
      complete: best.complete,
    };
  }

  return { maxFlow, weakestPair, mst, cableReport, makeDSU };
})();

if (typeof module !== 'undefined') module.exports = Flow;
