/* =========================================================
   TopoLab — sim.js

   Network par "kuch hota hua" dikhane wala hissa.

   Ek FLIGHT matlab ek packet ka safar: devices ki list aur cables ki
   list. Har frame me packet apne current cable par thoda aage badhta
   hai; cable khatam hua to agle cable par chala jaata hai.

   Packet ki speed pixels-per-second me rakhi hai (per-cable nahi),
   isliye lamba cable paar karne me sach me zyada time lagta hai —
   Dijkstra ka "lamba cable = zyada latency" aankhon se dikh jaata hai.

   Sections:
   1. Flight engine            4. CSMA/CD collision demo
   2. Data packet              5. Routing tables
   3. ARP (broadcast + reply)
   ========================================================= */

const Sim = (() => {

  const SPEED = 300;            // pixels per second

  /* Har device apne aakhri kuch packets yaad rakhta hai (d.seen).
     Inspector isi list ko dikhata hai — "Inspect this device" tab hi
     kaam ka hai jab wo bata sake ki yahan se guzra kya. */
  const SEEN_LIMIT = 8;
  const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
  const TTL_START = 64;

  function clockStamp() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(3);
  }

  function note(dev, entry) {
    if (!dev) return;
    if (!Array.isArray(dev.seen)) dev.seen = [];
    dev.seen.unshift({ time: clockStamp(), ...entry });
    if (dev.seen.length > SEEN_LIMIT) dev.seen.length = SEEN_LIMIT;
  }

  /* TTL har ROUTER par ek ghatta hai — switch/hub layer 2 par kaam karte
     hain, wo TTL ko haath nahi lagate. Yahi asli traceroute ka aadhaar hai. */
  function ttlAt(at, path, idx) {
    let ttl = TTL_START;
    for (let k = 1; k <= idx; k++) {
      const m = at.get(path[k]);
      if (m && Topologies.isRouter(m.type)) ttl--;
    }
    return ttl;
  }

  /* path ke idx-th device wali entry banao (likhta nahi, sirf banata hai —
     hub flooding wahi entry dusre devices par bhi chipkata hai) */
  function frameFor(at, path, idx, cfg) {
    const src = at.get(path[0]);
    const dst = at.get(path[path.length - 1]);
    return {
      kind: cfg.kind,
      proto: cfg.proto,
      dir: idx === 0 ? 'sent' : (idx === path.length - 1 ? 'received' : 'forwarded'),
      fromLabel: src ? src.label : '?', fromIp: src ? src.ip : '?', fromMac: src ? src.mac : '?',
      toLabel: dst ? dst.label : '?',
      toIp: cfg.toIp !== undefined ? cfg.toIp : (dst ? dst.ip : '?'),
      toMac: cfg.toMac !== undefined ? cfg.toMac : (dst ? dst.mac : '?'),
      hop: idx, hops: path.length - 1,
      bytes: cfg.bytes,
      port: cfg.port !== undefined ? cfg.port : null,
      ttl: ttlAt(at, path, idx),
    };
  }

  function logHop(at, path, idx, cfg) {
    const dev = at.get(path[idx]);
    if (dev) note(dev, frameFor(at, path, idx, cfg));
  }

  /* ---------------------------------------------------------
     LAYER 2 FORWARDING — HUB vs SWITCH ka asli farak

     HUB ek repeater hai. Jo ek port par aaya, wo baaki SAB ports par
     nikal jaata hai — hamesha. Isi liye hub par sab kuch sunai deta hai.

     SWITCH seekhta hai. Har frame ka SOURCE MAC dekh kar wo yaad rakh
     leta hai ki "ye MAC is port ki taraf hai" (MAC address table / CAM
     table). Aage jab usi MAC ke liye frame aati hai, wo sirf usi port
     par bhejta hai — baaki kisi ko sunai nahi deta.

     Isi se ek cheez nikalti hai jo asli switch me bhi hoti hai:
     PEHLI frame, jab tak destination ka MAC seekha nahi gaya, hub ki
     tarah SAB ports par jaati hai (unknown-unicast flooding). Uske baad
     nahi jaati. TopoLab me ye aankhon se dikhta hai — pehli baar
     bystanders ko "Heard" entry milti hai, doosri baar nahi.

     ACCESS POINT ek radio channel hai, to wo hub ki tarah hi bartaav
     karta hai.
     --------------------------------------------------------- */
  function neighboursOf(linksArr, id) {
    const out = [];
    for (const l of linksArr) {
      if (l.dead) continue;
      const other = l.a === id ? l.b : (l.b === id ? l.a : null);
      if (other && !out.includes(other)) out.push(other);
    }
    return out;
  }

  /* Switch ne source MAC kis taraf dekha — wahi yaad rakh lo */
  function learnMac(sw, mac, viaNeighbourId) {
    if (!sw || !mac || !viaNeighbourId) return;
    if (!(sw.macTable instanceof Map)) sw.macTable = new Map();
    sw.macTable.set(mac, viaNeighbourId);
  }

  function forwardAtLayer2(at, linksArr, path, idx, cfg) {
    const dev = at.get(path[idx]);
    if (!dev || dev.dead) return;

    const isHub    = Topologies.isSharedMedium(dev.type);
    const isSwitch = Topologies.isSwitch(dev.type);
    if (!isHub && !isSwitch) return;

    const prev = path[idx - 1], next = path[idx + 1];
    const src  = at.get(path[0]);
    const dst  = at.get(path[path.length - 1]);

    // dono seekhte hain? nahi — sirf switch. Hub ke paas table hoti hi nahi.
    let knewIt = false;
    if (isSwitch) {
      if (src && prev) learnMac(dev, src.mac, prev);
      knewIt = !!(dst && dev.macTable instanceof Map && dev.macTable.has(dst.mac));
      if (knewIt) return;               // sirf sahi port par — koi flooding nahi
    }

    const base = frameFor(at, path, idx, cfg);
    const why = isSwitch
      ? `${dev.label} has not learned ${dst ? dst.mac : 'that MAC'} yet, so this first frame goes out of every port. The next one will not.`
      : (Topologies.isWireless(dev.type)
          ? `${dev.label} is an access point — one radio channel, so every device on it hears this frame`
          : `${dev.label} is a hub, not a switch — it repeats every frame out of every other port`);

    for (const other of neighboursOf(linksArr, dev.id)) {
      if (other === prev || other === next) continue;
      const o = at.get(other);
      if (!o || o.dead) continue;
      note(o, { ...base, dir: 'heard', hint: why });
    }
  }

  /* ---------------------------------------------------------
     FIREWALL

     Rules upar se neeche padhe jaate hain aur PEHLA match jeet jaata hai
     — bilkul asli firewall/ACL ki tarah. Jo kisi rule se match hi nahi
     karta wo allow hai (default-allow), taaki firewall rakhne bhar se
     network band na ho jaaye.
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     FIREWALL ZONES — firewall kis-kis ko alag kar raha hai

     Asli firewall "device se device" me nahi socha jaata, "zone se zone"
     me socha jaata hai — inside / outside / DMZ. Wo zone hote kya hain?
     Firewall ke har port ke peeche ka network.

     Nikalte aise hain: firewall ko graph se HATA do, aur uske har padosi
     se BFS karo. Ek BFS jitne devices tak pahunche, wo ek zone. Do padosi
     agar ek dusre tak pahunch jaate hain (firewall ke bina bhi), matlab
     unke beech koi aur raasta hai — to wo ek hi zone hain, do nahi.

     Isse dono maamle apne aap sudhar jaate hain:
       - firewall do device ke BEECH me    -> theek do zone
       - firewall kisi junction par        -> jitni alag disha, utne zone
     --------------------------------------------------------- */
  function firewallZones(devices, links, fwId) {
    const at = new Map(devices.map(d => [d.id, d]));
    const fw = at.get(fwId);
    if (!fw) return [];

    // firewall ke bina wala adjacency
    const adj = new Map(devices.filter(d => d.id !== fwId).map(d => [d.id, []]));
    for (const l of links) {
      if (l.a === fwId || l.b === fwId) continue;
      if (!adj.has(l.a) || !adj.has(l.b)) continue;
      adj.get(l.a).push(l.b);
      adj.get(l.b).push(l.a);
    }

    const neighbours = [];
    for (const l of links) {
      const other = l.a === fwId ? l.b : (l.b === fwId ? l.a : null);
      if (other && at.has(other) && !neighbours.includes(other)) neighbours.push(other);
    }

    const zones = [];
    const placed = new Set();

    for (const n of neighbours) {
      if (placed.has(n)) continue;               // kisi pehle zone me aa chuka
      const seen = new Set([n]);
      const queue = [n];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        for (const nx of (adj.get(cur) || [])) {
          if (seen.has(nx)) continue;
          seen.add(nx);
          queue.push(nx);
        }
      }
      seen.forEach(id => { if (neighbours.includes(id)) placed.add(id); });

      const members = [...seen];
      const via = neighbours.filter(x => seen.has(x));
      const head0 = at.get(via[0]);
      zones.push({
        id: `zone:${via[0]}`,
        via,
        devices: members,
        label: members.length === 1
          ? head0.label
          : `${head0.label}'s side`,
        count: members.length,
      });
    }
    return zones;
  }

  /* Rule ka ek sira ('any' | device id | 'zone:<id>') milta hai ya nahi */
  function endpointMatches(sel, deviceId, zones) {
    if (sel === 'any') return true;
    if (typeof sel === 'string' && sel.startsWith('zone:')) {
      const z = (zones || []).find(x => x.id === sel);
      return !!z && z.devices.includes(deviceId);
    }
    return sel === deviceId;
  }

  function ruleMatches(r, srcId, dstId, kind, zones, port) {
    const protoOk = r.proto === 'any'
      || (r.proto === 'data' && kind === 'data')
      || (r.proto === 'arp'  && (kind === 'arp' || kind === 'reply'));

    /* Port wali shart sirf data par lagti hai. ARP layer 2 par chalta
       hai — uska koi TCP port hota hi nahi, to "block port 80" ko ARP
       par lagana galat hoga. */
    const portOk = !r.port || r.port === 'any'
      || (kind === 'data' && Number(r.port) === Number(port));

    return protoOk && portOk
      && endpointMatches(r.from, srcId, zones)
      && endpointMatches(r.to,   dstId, zones);
  }

  /* Route ke har firewall se poochho. Lautata hai ki packet kahan ruka. */
  function firewallCheck(devices, links, path, kind = 'data', port = null) {
    const at = new Map(devices.map(d => [d.id, d]));
    const srcId = path[0], dstId = path[path.length - 1];

    for (let i = 0; i < path.length; i++) {
      const d = at.get(path[i]);
      if (!d || d.type !== 'firewall' || d.dead) continue;
      const rules = d.rules || [];
      if (!rules.length) continue;

      const zones = firewallZones(devices, links, d.id);
      for (const r of rules) {
        if (!ruleMatches(r, srcId, dstId, kind, zones, port)) continue;
        if (r.action === 'block') return { blocked: true, at: d, index: i, rule: r, zones };
        break;          // pehla match allow tha -> is firewall se paar
      }
    }
    return { blocked: false };
  }

  /* Rule ko angrezi me padhne layak banao (inspector aur dialog dono me) */
  function ruleText(r, at, zones) {
    const who = (sel) => {
      if (sel === 'any') return 'anyone';
      if (typeof sel === 'string' && sel.startsWith('zone:')) {
        const z = (zones || []).find(x => x.id === sel);
        if (!z) return 'a side that no longer exists';
        // ek hi device wali side ko "everything on X" kehna bewakoofi lagta hai
        return z.count === 1 ? z.label : `everything on ${z.label}`;
      }
      return at.get(sel) ? at.get(sel).label : 'a deleted device';
    };
    const proto = r.proto === 'any' ? 'all traffic'
                : r.proto === 'arp' ? 'ARP' : 'data';
    const onPort = (r.port && r.port !== 'any') ? ` on port ${r.port}` : '';
    return `${r.action === 'block' ? 'Block' : 'Allow'} ${proto}${onPort} from ${who(r.from)} to ${who(r.to)}`;
  }
  const COLOURS = {
    data:  '#22d3ee',
    arp:   '#f59e0b',
    reply: '#22c55e',
    retry: '#a78bfa',
  };

  /* Ek cable ki asli lambai (bus ka cable mudta hai, isliye polyline) */
  function linkLength(link, at) {
    const pts = Render.linkPoints(link, at);
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return len || 1;
  }

  /* ---------------------------------------------------------
     1. FLIGHT ENGINE
     --------------------------------------------------------- */
  function createEngine(log) {
    let flights = [];
    let blasts  = [];
    let pending = [];             // { at: secondsFromNow, fn }
    let clock   = 0;
    let seq     = 0;

    const emit = (msg, kind) => log && log(msg, kind);

    /* devicePath ko flight me badalta hai.
       devicePath: [id, id, ...]  linkPath: [linkId, ...] (ek kam) */
    function makeFlight(devicePath, linkPath, opts = {}) {
      return {
        id: ++seq,
        devices: devicePath,
        links: linkPath,
        idx: 0,                 // abhi kis cable par hai
        t: 0,                   // us cable par 0..1
        delay: opts.delay || 0,
        colour: opts.colour || COLOURS.data,
        label: opts.label || '',
        kind: opts.kind || 'data',
        big: !!opts.big,
        onDone: opts.onDone || null,
        onHop: opts.onHop || null,       // har device par pahunchte hi
        dead: false,
      };
    }

    function launch(f) { flights.push(f); return f; }

    function schedule(seconds, fn) { pending.push({ at: clock + seconds, fn }); }

    /* ---------- har frame ---------- */
    function update(dt, devices, links) {
      clock += dt;

      // timer wale kaam
      for (let i = pending.length - 1; i >= 0; i--) {
        if (clock >= pending[i].at) {
          const job = pending[i].fn;
          pending.splice(i, 1);
          job();
        }
      }

      const at = new Map(devices.map(d => [d.id, d]));
      const linkAt = new Map(links.map(l => [l.id, l]));

      for (const f of flights) {
        if (f.dead) continue;
        if (f.delay > 0) { f.delay -= dt; continue; }

        const link = linkAt.get(f.links[f.idx]);
        // safar ke beech me hi cable kat gaya ya device mar gaya?
        if (!link || link.dead || at.get(f.devices[f.idx + 1])?.dead) {
          f.dead = true;
          emit(`Packet dropped — ${link && link.dead ? 'the cable was cut' : 'the device went down'} mid-route`, 'bad');
          continue;
        }

        const len = linkLength(link, at);
        f.t += (SPEED * dt) / len;

        if (f.t >= 1) {
          f.t = 0;
          f.idx++;
          if (f.onHop) f.onHop(f.idx);
          if (f.idx >= f.links.length) {
            f.dead = true;
            if (f.onDone) f.onDone();
          }
        }
      }

      // blasts fade
      for (const b of blasts) b.life -= dt * 1.6;
      blasts = blasts.filter(b => b.life > 0);

      flights = flights.filter(f => !f.dead);
    }

    /* renderer ko is shakal me chahiye */
    function packets(devices, links) {
      const linkAt = new Map(links.map(l => [l.id, l]));
      const out = [];
      for (const f of flights) {
        if (f.delay > 0 || f.dead) continue;
        const link = linkAt.get(f.links[f.idx]);
        if (!link) continue;
        // packet ki disha: agar cable ka 'a' sira hamara "from" nahi hai
        // to hum ulti disha me chal rahe hain
        const from = f.devices[f.idx];
        out.push({
          linkId: link.id,
          t: f.t,
          reverse: link.a !== from,
          colour: f.colour,
          label: f.label,
          big: f.big,
        });
      }
      return out;
    }

    const busy = () => flights.length > 0;
    function clear() { flights = []; blasts = []; pending = []; }

    function blast(x, y) { blasts.push({ x, y, life: 1 }); }

    return {
      makeFlight, launch, schedule, update, packets, clear, blast, busy,
      get flights() { return flights; },
      get blasts()  { return blasts; },
      COLOURS,
    };
  }

  /* ---------------------------------------------------------
     2. DATA PACKET — src se dst tak
     --------------------------------------------------------- */
  function sendData(engine, route, opts = {}) {
    const at = new Map((opts.devices || []).map(d => [d.id, d]));
    const linksArr = opts.links || [];
    const cfg = { kind: 'data', proto: opts.label || 'DATA', bytes: 1500,
                  port: opts.port !== undefined ? opts.port : null };

    // bhejne wale ke paas turant entry — baaki har hop par flight khud likhegi
    if (at.size) logHop(at, route.path, 0, cfg);

    const onHop = at.size ? (idx) => {
      logHop(at, route.path, idx, cfg);
      forwardAtLayer2(at, linksArr, route.path, idx, cfg);
    } : null;

    return engine.launch(engine.makeFlight(route.path, route.linkPath, {
      colour: COLOURS.data,
      label: opts.label || 'DATA',
      big: true,
      kind: 'data',
      onHop,
      onDone: opts.onDone,
    }));
  }

  /* ---------------------------------------------------------
     3. ARP — "192.168.1.14 kiska hai?"

     Asli ARP do kadam me hota hai:
       1. BROADCAST — sender poore network me chillata hai.
          Hum BFS tree ke har cable par ek packet bhejte hain, aur
          har packet ka delay uski depth ke hisaab se hai — isliye
          lehar (ripple) baahar ki taraf failti dikhti hai.
       2. REPLY — sirf jiska IP tha wo wapas unicast karta hai.
          Uske baad sender ki ARP table me entry aa jaati hai.
     --------------------------------------------------------- */
  function sendArp(engine, adj, devices, links, srcId, dstId, onResolved, onBlocked) {
    const at = new Map(devices.map(d => [d.id, d]));
    const src = at.get(srcId), dst = at.get(dstId);
    if (!src || !dst) return false;

    /* BFS tree banao — par ROUTER par ruk kar.

       Router ka sabse bada kaam yahi hai: wo BROADCAST DOMAIN ki hadd
       hai. Broadcast router tak pahunchta hai aur wahin khatam ho jaata
       hai — wo use aage nahi bhejta. Switch aur hub bhejte hain, isliye
       ek switch ke peeche ka poora hissa ek hi broadcast domain hai.

       Isi wajah se badi jagah par network ko router se todte hain: warna
       ek machine ka broadcast poore campus ko sunai deta. */
    const depth = new Map([[srcId, 0]]);
    const queue = [srcId];
    let head = 0;
    const treeEdges = [];         // {linkId, from, to, depth}
    const stoppedAt = [];         // kaun se router ne rok diya

    while (head < queue.length) {
      const cur = queue[head++];
      const curDev = at.get(cur);

      // router se aage broadcast nahi jaata (khud bhejne wala apwaad hai)
      if (cur !== srcId && curDev && Topologies.isRouter(curDev.type)) {
        if (!stoppedAt.includes(curDev.label)) stoppedAt.push(curDev.label);
        continue;
      }

      for (const e of (adj.get(cur) || [])) {
        if (depth.has(e.to)) continue;
        depth.set(e.to, depth.get(cur) + 1);
        treeEdges.push({ linkId: e.linkId, from: cur, to: e.to, d: depth.get(cur) });
        queue.push(e.to);
      }
    }

    /* Broadcast ki entry: sabhi ke liye ek hi shakal, kyunki broadcast
       me "to" kisi ek device ka MAC nahi — wo FF:FF:FF:FF:FF:FF hota hai
       aur poore segment ko sunai deta hai. */
    const arpFrame = (dir) => ({
      kind: 'arp', proto: 'ARP request', dir,
      fromLabel: src.label, fromIp: src.ip, fromMac: src.mac,
      toLabel: 'everyone', toIp: dst.ip, toMac: BROADCAST_MAC,
      hop: null, hops: null, bytes: 64, ttl: null,
      question: `Who has ${dst.ip}? Tell ${src.ip}`,
    });
    note(src, arpFrame('sent'));

    // broadcast ki lehar
    for (const e of treeEdges) {
      engine.launch(engine.makeFlight([e.from, e.to], [e.linkId], {
        colour: COLOURS.arp,
        label: e.d === 0 ? 'ARP?' : '',
        kind: 'arp',
        delay: e.d * 0.22,
        onHop: () => {
          /* Switch broadcast se bhi seekhta hai — usme source MAC hota
             hai. Isi liye ARP ke baad us MAC ke liye flooding band ho
             jaati hai. */
          const toDev = at.get(e.to);
          if (toDev && Topologies.isSwitch(toDev.type)) learnMac(toDev, src.mac, e.from);
          note(toDev, arpFrame(e.to === dstId ? 'received' : 'heard'));
        },
      }));
    }

    if (!depth.has(dstId)) {
      if (stoppedAt.length && onBlocked) onBlocked(stoppedAt);
      return false;
    }

    // reply — target se wapas sender tak
    const reply = Graph.bfs(adj, dstId, srcId);
    const replyDelay = depth.get(dstId) * 0.22 + 0.35;
    engine.schedule(replyDelay, () => {
      const replyCfg = { kind: 'reply', proto: 'ARP reply', bytes: 64 };
      logHop(at, reply.path, 0, replyCfg);
      engine.launch(engine.makeFlight(reply.path, reply.linkPath, {
        colour: COLOURS.reply,
        label: 'ARP reply',
        big: true,
        kind: 'reply',
        onHop: (idx) => {
          logHop(at, reply.path, idx, replyCfg);
          // reply DESTINATION se aati hai, isliye switch uska MAC yahin seekhta hai
          forwardAtLayer2(at, links, reply.path, idx, replyCfg);
        },
        onDone: () => {
          src.arp.set(dst.ip, dst.mac);       // cache bhar gaya
          dst.arp.set(src.ip, src.mac);       // target bhi sender ko yaad rakhta hai
          onResolved && onResolved();
        },
      }));
    });

    return true;
  }

  /* ---------------------------------------------------------
     ARP KISKA? — same subnet me destination ka, warna GATEWAY ka

     Ye woh baat hai jo kitaab me likhi hoti hai par diagram me kabhi
     nahi dikhti: apne subnet ke bahar wale IP ke liye machine kabhi ARP
     nahi karti. Wo apne GATEWAY ka MAC maangti hai aur frame usi ko
     deti hai; aage ka kaam router ka hai.

     Aur ye ussi baat ka seedha nateeja hai ki broadcast router paar
     nahi karta — agar karta, to door wale host ka ARP bhi chal jaata.
     --------------------------------------------------------- */
  const subnetOf = (d) => {
    const m = /^(\d+)\.(\d+)\.(\d+)\./.exec(d && d.ip || '');
    return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
  };

  const sameSubnet = (a, b) => {
    const x = subnetOf(a), y = subnetOf(b);
    // router ke kai IP hote hain — koi ek bhi mil jaaye to wahi subnet
    const ips = (d) => (d.ips && d.ips.length ? d.ips : [d.ip]).filter(Boolean);
    if (ips(a).some(ip => ips(b).some(jp =>
        ip.split('.').slice(0, 3).join('.') === jp.split('.').slice(0, 3).join('.')))) return true;
    return !!x && x === y;
  };

  /* Src ko kiska MAC chahiye? Lautata hai { target, viaGateway } */
  function arpTargetFor(devices, srcId, dstId) {
    const at = new Map(devices.map(d => [d.id, d]));
    const src = at.get(srcId), dst = at.get(dstId);
    if (!src || !dst) return { target: dst || null, viaGateway: false };

    if (sameSubnet(src, dst)) return { target: dst, viaGateway: false };

    const gw = src.gateway
      ? devices.find(d => ((d.ips && d.ips.length ? d.ips : [d.ip]) || []).includes(src.gateway))
      : null;

    // gateway hi nahi mila to purane tareeke par lautо — kam se kam kuch to chale
    return gw ? { target: gw, viaGateway: true } : { target: dst, viaGateway: false };
  }

  /* ---------------------------------------------------------
     4. CSMA/CD — COLLISION

     Bus ek SHARED medium hai: sab ek hi taar par bolte hain. Do device
     ek saath bolein to signal takra jaate hain — collision.

     CSMA/CD ka jawab: dono jam signal bhejte hain, ruk jaate hain, aur
     ek RANDOM time wait karke dobara try karte hain (binary exponential
     backoff). Random isliye taaki dono phir se ek saath na bolein.

     Switch waali topologies (star/tree/hybrid) me ye hota hi nahi —
     switch har port ko alag collision domain deta hai. Isliye agar
     dono raaste koi cable share nahi karte, hum wahi samjhaate hain.
     --------------------------------------------------------- */
  function collisionDemo(engine, adj, devices, links, aId, bId, targetId, log) {
    const routeA = Graph.bfs(adj, aId, targetId);
    const routeB = Graph.bfs(adj, bId, targetId);
    if (!routeA || !routeB) {
      log('Neither sender can reach the target', 'bad');
      return;
    }

    const at = new Map(devices.map(d => [d.id, d]));
    const nameA = at.get(aId).label, nameB = at.get(bId).label;
    const linkAt = new Map(links.map(l => [l.id, l]));

    /* COLLISION kab hoti hai?

       Sirf SHARED MEDIUM par — jahan sab ek hi taar par bolte hain.
       Hamare model me wo bus ka cable hai (shape === 'bus').

       Sirf "dono ka ek cable common hai" kaafi NAHI hai. Star me PC-1 aur
       PC-3 dono ka traffic hub->target waale cable se guzarta hai, phir bhi
       collision nahi hoti — switch store-and-forward karta hai: pehli frame
       poori le leta hai, buffer me rakhta hai, phir bhejta hai. Doosri frame
       queue me lag jaati hai. Har port apna alag collision domain hai. */
    const sharedLinks = routeA.linkPath.filter(id => routeB.linkPath.includes(id));
    const sharedBus = sharedLinks.find(id => linkAt.get(id)?.shape === 'bus');

    /* HUB / ACCESS POINT bhi shared medium hain. Do alag-alag port se aayi
       frames bhi hub ke andar takra jaati hain, kyunki poora hub ek hi
       collision domain hai — cable common hone ki zarurat hi nahi. */
    const sharedNode = routeA.path.filter(id => routeB.path.includes(id))
      .map(id => at.get(id))
      .find(d => d && !d.dead && Topologies.isSharedMedium(d.type));

    /* Wi-Fi par CSMA/CA hai, CD nahi: radio bhejte waqt sun nahi sakta,
       isliye takrao ke baad pata karne ka option hi nahi — pehle channel
       sun kar takrao TAALA jaata hai. Isliye yahan collision nahi hoti,
       doosra sender apni baari ka intezaar karta hai. */
    if (!sharedBus && sharedNode && Topologies.isWireless(sharedNode.type)) {
      log(`${nameA} and ${nameB} are both on ${sharedNode.label} — one radio channel, so they cannot both transmit`, 'warn');
      log(`CSMA/CA — ${nameA} found the channel clear and sent. ${nameB} heard it was busy and waited for its turn, so no collision happened`, 'good');
      sendData(engine, routeA, { label: nameA, devices, links });
      engine.schedule(1.1, () => {
        log(`${nameB} sent after the channel went quiet`, 'good');
        sendData(engine, routeB, { label: nameB, devices, links });
      });
      return;
    }

    if (!sharedBus && sharedNode) {
      log(`${nameA} and ${nameB} are both on ${sharedNode.label} — a HUB is one single collision domain, so their signals meet inside it`, 'warn');
    }

    if (!sharedBus && !sharedNode) {
      if (sharedLinks.length) {
        log(`${nameA} and ${nameB} share a cable, but there is a SWITCH in between — it buffers the first frame and queues the second. No collision.`, 'good');
      } else {
        log(`${nameA} and ${nameB} share no cable — separate collision domains, both go through fine`, 'good');
      }
      sendData(engine, routeA, { label: nameA, devices, links });
      engine.schedule(0.15, () => sendData(engine, routeB, { label: nameB, devices, links }));
      return;
    }

    if (sharedBus) {
      log(`${nameA} and ${nameB} transmitted at the same instant — a bus is a SHARED wire, so both signals are on it at once`, 'warn');
    }

    /* Blast kahan dikhe: bus par cable ke beech me, hub par khud hub par */
    let mid;
    if (sharedBus) {
      const link = linkAt.get(sharedBus);
      mid = Render.pointAt(Render.linkPoints(link, at), 0.5);
    } else {
      mid = { x: sharedNode.x, y: sharedNode.y };
    }

    const f1 = engine.launch(engine.makeFlight(routeA.path, routeA.linkPath, { colour: COLOURS.data, label: nameA }));
    const f2 = engine.launch(engine.makeFlight(routeB.path, routeB.linkPath, { colour: COLOURS.data, label: nameB }));

    // dono ko takraane do, phir jam + backoff
    engine.schedule(0.55, () => {
      f1.dead = true; f2.dead = true;
      engine.blast(mid.x, mid.y);
      log('COLLISION — both sent a jam signal and stopped transmitting', 'bad');

      // binary exponential backoff — dono alag-alag random slots chunte hain
      const slotA = (1 + Math.floor(Math.random() * 2)) * 0.5;
      let slotB = (1 + Math.floor(Math.random() * 2)) * 0.5;
      if (Math.abs(slotA - slotB) < 0.3) slotB = slotA + 0.6;

      log(`Backoff — ${nameA} waits ${slotA.toFixed(1)}s, ${nameB} waits ${slotB.toFixed(1)}s`, 'warn');

      engine.schedule(slotA, () => {
        log(`${nameA} retransmitted — the line was clear, it got through`, 'good');
        engine.launch(engine.makeFlight(routeA.path, routeA.linkPath, { colour: COLOURS.retry, label: nameA, big: true }));
      });
      engine.schedule(slotB, () => {
        log(`${nameB} retransmitted — successful this time`, 'good');
        engine.launch(engine.makeFlight(routeB.path, routeB.linkPath, { colour: COLOURS.retry, label: nameB, big: true }));
      });
    });
  }

  /* ---------------------------------------------------------
     5. ROUTING TABLES

     Router ke liye: har subnet ke liye "agla hop kaun hai" nikalte hain.
     Hum har subnet ke sabse paas wale device tak BFS chalate hain aur
     us raaste ka PEHLA device next-hop ban jaata hai — bilkul waise hi
     jaise asli routing protocol karta hai.

     Host ke liye: apna subnet direct hai, baaki sab default gateway se.
     --------------------------------------------------------- */
  function routingTable(deviceId, devices, links) {
    const adj = Graph.build(devices, links);
    const at = new Map(devices.map(d => [d.id, d]));
    const me = at.get(deviceId);
    if (!me || me.dead) return [];

    const mySubnet = me.subnet === 0 ? 1 : me.subnet;
    const rows = [];

    if (!Topologies.isRouter(me.type)) {
      rows.push({ dest: `192.168.${mySubnet}.0/24`, via: 'direct', iface: 'eth0', hops: 0 });
      if (me.gateway) rows.push({ dest: '0.0.0.0/0', via: me.gateway, iface: 'eth0', hops: 1 });
      return rows;
    }

    const subnets = [...new Set(devices.filter(d => !d.dead).map(d => d.subnet === 0 ? 1 : d.subnet))]
      .sort((a, b) => a - b);

    for (const s of subnets) {
      // is subnet ka sabse paas wala host dhoondo
      let best = null;
      for (const d of devices) {
        if (d.dead || Topologies.isRouter(d.type)) continue;
        if ((d.subnet === 0 ? 1 : d.subnet) !== s) continue;
        const r = Graph.bfs(adj, deviceId, d.id);
        if (r && (!best || r.hops < best.hops)) best = r;
      }
      if (!best) {
        rows.push({ dest: `192.168.${s}.0/24`, via: 'unreachable', iface: '—', hops: Infinity });
        continue;
      }
      const nextHop = best.path[1] ? at.get(best.path[1]) : me;
      rows.push({
        dest: `192.168.${s}.0/24`,
        via: best.hops <= 1 ? 'direct' : (nextHop.ip || nextHop.label),
        iface: nextHop === me ? 'lo' : `eth${subnets.indexOf(s)}`,
        hops: best.hops,
      });
    }
    return rows;
  }

  /* Destination kis port par sun raha hai? Data packet uski PEHLI
     service par jaata hai. Kuch sun hi nahi raha (jaise hub) to null —
     tab bhejna "connection refused" ban jaata hai. */
  function serviceOf(dev) {
    const list = (dev && dev.services) || [];
    return list.length ? list[0] : null;
  }

  return { createEngine, sendData, sendArp, collisionDemo, routingTable,
           firewallCheck, firewallZones, ruleText,
           arpTargetFor, sameSubnet, serviceOf, learnMac,
           COLOURS, SPEED };
})();

if (typeof module !== 'undefined') module.exports = Sim;
