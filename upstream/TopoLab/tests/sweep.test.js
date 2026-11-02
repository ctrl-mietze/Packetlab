/* =========================================================
   Poore project ka smoke sweep — browser ki zarurat nahi.

   Chalao:  node tests/sweep.test.js

   Baaki teen suites har algorithm ko alag-alag jaanchti hain. Ye suite
   ulta kaam karti hai: SAB kuch ek saath chalati hai — har topology, har
   size, har device, har jodi — aur sirf ye poochhti hai ki koi buniyaadi
   niyam toota to nahi.

   Isi tarah ka sweep ek asli bug pakad chuka hai: bina router wale
   networks me har host ko ek aisa default gateway mil raha tha jo kisi
   device ka tha hi nahi.
   ========================================================= */
globalThis.Graph      = require('../js/graph.js');
globalThis.Render     = require('../js/render.js');
globalThis.Topologies = require('../js/topologies.js');
const Sim     = require('../js/sim.js');
const Advisor = require('../js/advisor.js');
const Flow    = require('../js/flow.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const W = 1200, H = 700;
const SIZES = [3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
const first = (arr) => arr.length ? arr[0] : '';

const run = (engine, devices, links, secs) => {
  for (let i = 0; i < secs * 60; i++) engine.update(1 / 60, devices, links);
};

/* ---------- 1. Har topology x har size: structure ---------- */
console.log('\n1. STRUCTURE — har topology, 3 se 24 devices');
{
  const bad = { split: [], nan: [], ip: [], mac: [], dupIp: [], dupMac: [], dupLabel: [],
                ports: [], selfLoop: [], dupLink: [], services: [], macTable: [], gateway: [] };
  let checks = 0;

  for (const n of SIZES) {
    for (const k of Topologies.KINDS) {
      const g = Topologies.generate(k, n, W, H);
      const adj = Graph.build(g.devices, g.links);
      const tag = `${k}@${n}`;
      checks++;

      if (Graph.components(adj).length !== 1) bad.split.push(tag);
      if (g.devices.some(d => !Number.isFinite(d.tx) || !Number.isFinite(d.ty))) bad.nan.push(tag);
      if (g.devices.some(d => !/^\d+\.\d+\.\d+\.\d+$/.test(d.ip || ''))) bad.ip.push(tag);
      if (g.devices.some(d => !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(d.mac || ''))) bad.mac.push(tag);

      const hostIps = g.devices.filter(d => !Topologies.isRouter(d.type)).map(d => d.ip);
      if (new Set(hostIps).size !== hostIps.length) bad.dupIp.push(tag);
      const macs = g.devices.map(d => d.mac);
      if (new Set(macs).size !== macs.length) bad.dupMac.push(tag);
      const labels = g.devices.map(d => d.label);
      if (new Set(labels).size !== labels.length) bad.dupLabel.push(tag);

      const deg = new Map(g.devices.map(d => [d.id, 0]));
      g.links.forEach(l => { deg.set(l.a, deg.get(l.a) + 1); deg.set(l.b, deg.get(l.b) + 1); });
      if (g.devices.some(d => d.ports < deg.get(d.id))) bad.ports.push(tag);

      if (g.links.some(l => l.a === l.b)) bad.selfLoop.push(tag);
      const pairs = new Set();
      for (const l of g.links) {
        const key = [l.a, l.b].sort().join('|');
        if (pairs.has(key)) { bad.dupLink.push(tag); break; }
        pairs.add(key);
      }

      if (g.devices.some(d => !Array.isArray(d.services))) bad.services.push(tag);
      if (g.devices.some(d => !(d.macTable instanceof Map))) bad.macTable.push(tag);

      /* Gateway ya to ho hi na, ya kisi ASLI router ka IP ho. Ye check
         ek asli bug se aaya hai — dekho PROJECT.md. */
      for (const d of g.devices) {
        if (!d.gateway) continue;
        const owner = g.devices.find(x => ((x.ips && x.ips.length ? x.ips : [x.ip]) || []).includes(d.gateway));
        if (!owner || !Topologies.isRouter(owner.type)) { bad.gateway.push(`${tag} ${d.label}`); break; }
      }
    }
  }

  ok(`${checks} topology+size combinations bane`, checks === SIZES.length * Topologies.KINDS.length);
  ok('har network ek hi juda hua tukda hai', !bad.split.length, first(bad.split));
  ok('kisi device ki position NaN nahi', !bad.nan.length, first(bad.nan));
  ok('har IP sahi shakal me', !bad.ip.length, first(bad.ip));
  ok('har MAC sahi shakal me', !bad.mac.length, first(bad.mac));
  ok('do host ka IP kabhi ek jaisa nahi', !bad.dupIp.length, first(bad.dupIp));
  ok('do device ka MAC kabhi ek jaisa nahi', !bad.dupMac.length, first(bad.dupMac));
  ok('do device ka naam kabhi ek jaisa nahi', !bad.dupLabel.length, first(bad.dupLabel));
  ok('kisi device ke port kam nahi pade', !bad.ports.length, first(bad.ports));
  ok('koi cable khud se khud tak nahi', !bad.selfLoop.length, first(bad.selfLoop));
  ok('ek jodde par do cable kabhi nahi', !bad.dupLink.length, first(bad.dupLink));
  ok('har device ke paas services list hai', !bad.services.length, first(bad.services));
  ok('har device ke paas macTable hai', !bad.macTable.length, first(bad.macTable));
  ok('gateway hamesha kisi asli router ka IP hai', !bad.gateway.length, first(bad.gateway));
}

/* ---------- 2. Har host jodi par packet pahunchta hai ---------- */
console.log('\n2. HAR HOST JODI PAR PACKET');
{
  const bad = { noRoute: [], notDelivered: [], dijkstra: [] };
  let pairs = 0;

  for (const k of Topologies.KINDS) {
    for (const n of [4, 8, 12]) {
      const g = Topologies.generate(k, n, W, H);
      const adj = Graph.build(g.devices, g.links);
      const engine = Sim.createEngine(() => {});
      const hosts = g.devices.filter(d => Topologies.isHost(d.type));

      for (const a of hosts) for (const b of hosts) {
        if (a === b) continue;
        pairs++;
        const r = Graph.bfs(adj, a.id, b.id);
        if (!r) { bad.noRoute.push(`${k}@${n} ${a.label}->${b.label}`); continue; }

        let done = false;
        Sim.sendData(engine, r, { devices: g.devices, links: g.links, onDone: () => { done = true; } });
        run(engine, g.devices, g.links, 30);
        if (!done) bad.notDelivered.push(`${k}@${n} ${a.label}->${b.label}`);

        const dj = Graph.dijkstra(adj, a.id, b.id);
        if (!dj || dj.hops < r.hops) bad.dijkstra.push(`${k}@${n} ${a.label}->${b.label}`);
      }
    }
  }

  ok(`${pairs} host jodiyaan jaanchi gayin`, pairs > 400, String(pairs));
  ok('har jodi ke beech raasta mila', !bad.noRoute.length, first(bad.noRoute));
  ok('har packet destination tak pahuncha', !bad.notDelivered.length, first(bad.notDelivered));
  ok('Dijkstra kabhi BFS se kam hops nahi deta', !bad.dijkstra.length, first(bad.dijkstra));
}

/* ---------- 3. Har device aur cable maar ke dekho ---------- */
console.log('\n3. CHAOS — har device, har cable');
{
  const bad = { score: [], stats: [], flow: [] };
  let kills = 0;

  for (const k of Topologies.KINDS) {
    const g = Topologies.generate(k, 8, W, H);

    for (const d of g.devices) {
      d.dead = true; kills++;
      const res = Graph.resilience(g.devices, g.links);
      if (!Number.isFinite(res.score) || res.score < 0 || res.score > 100)
        bad.score.push(`${k} ${d.label} -> ${res.score}`);
      const alive = g.devices.filter(x => !x.dead);
      const st = Graph.stats(Graph.build(alive, g.links.filter(l => !l.dead)));
      if (!Number.isFinite(st.avgHops) || !Number.isFinite(st.diameter)) bad.stats.push(`${k} ${d.label}`);
      d.dead = false;
    }

    for (const l of g.links) {
      l.dead = true; kills++;
      if (!Number.isFinite(Graph.resilience(g.devices, g.links).score)) bad.score.push(`${k} cable`);
      const f = Flow.maxFlow(g.devices, g.links, g.devices[0].id, g.devices[g.devices.length - 1].id);
      if (f.flow !== f.cut.length) bad.flow.push(`${k} cable: flow ${f.flow} vs cut ${f.cut.length}`);
      l.dead = false;
    }
  }

  ok(`${kills} device/cable failures simulate kiye`, kills > 80, String(kills));
  ok('resilience score hamesha 0-100 ke beech aur asli number', !bad.score.length, first(bad.score));
  ok('stats kabhi NaN nahi', !bad.stats.length, first(bad.stats));
  ok('toote network me bhi max-flow = min-cut', !bad.flow.length, first(bad.flow));
}

/* ---------- 4. Khaali / kinare wale maamle ---------- */
console.log('\n4. KHAALI AUR KINARE WALE MAAMLE');
{
  ok('khaali network par resilience NaN nahi', Number.isFinite(Graph.resilience([], []).score));
  ok('khaali network par stats NaN nahi', Number.isFinite(Graph.stats(Graph.build([], [])).avgHops));

  const one = [Topologies.device('pc', 'A', 0, 0)];
  ok('ek akela device par resilience NaN nahi', Number.isFinite(Graph.resilience(one, []).score));

  const g = Topologies.generate('star', 6, W, H);
  g.devices.forEach(d => { d.dead = true; });
  ok('sab devices marne par bhi resilience NaN nahi',
     Number.isFinite(Graph.resilience(g.devices, g.links).score));

  const g2 = Topologies.generate('star', 6, W, H);
  g2.links.forEach(l => { l.dead = true; });
  const rep = Flow.cableReport(g2.devices, g2.links);
  ok('bina cable wale network par cable report NaN nahi',
     Number.isFinite(rep.currentMetres) && Number.isFinite(rep.mstMetres));
  ok('aur uski saving negative nahi hoti', rep.savingMetres >= 0);
}

/* ---------- 5. Firewall zones har device par ---------- */
console.log('\n5. FIREWALL ZONES — har device ko firewall bana ke');
{
  const bad = { overlap: [], self: [], missing: [] };
  let tried = 0;

  for (const k of Topologies.KINDS) {
    const g = Topologies.generate(k, 10, W, H);
    for (const d of g.devices) {
      const saved = d.type;
      d.type = 'firewall'; d.rules = [];
      tried++;

      const zones = Sim.firewallZones(g.devices, g.links, d.id);
      const members = zones.flatMap(z => z.devices);
      if (new Set(members).size !== members.length) bad.overlap.push(`${k} ${d.label}`);
      if (members.includes(d.id)) bad.self.push(`${k} ${d.label}`);
      if (members.length !== g.devices.length - 1) bad.missing.push(`${k} ${d.label}`);

      d.type = saved;
    }
  }

  ok(`${tried} devices firewall bana kar jaanche`, tried > 50, String(tried));
  ok('koi device do zones me ek saath nahi', !bad.overlap.length, first(bad.overlap));
  ok('firewall khud kisi zone me nahi', !bad.self.length, first(bad.self));
  ok('baaki har device kisi na kisi zone me hai', !bad.missing.length, first(bad.missing));
}

/* ---------- 6. ARP target har jodi par ---------- */
console.log('\n6. ARP TARGET — har host jodi');
{
  const bad = [];
  let pairs = 0;
  for (const k of Topologies.KINDS) {
    const g = Topologies.generate(k, 10, W, H);
    const hosts = g.devices.filter(d => Topologies.isHost(d.type));
    for (const a of hosts) for (const b of hosts) {
      if (a === b) continue;
      pairs++;
      const t = Sim.arpTargetFor(g.devices, a.id, b.id);
      if (!t.target) { bad.push(`${k} ${a.label}->${b.label} target null`); continue; }
      if (t.viaGateway !== !Sim.sameSubnet(a, b)) bad.push(`${k} ${a.label}->${b.label} gateway faisla galat`);
    }
  }
  ok(`${pairs} jodiyon par ARP target nikala`, pairs > 300, String(pairs));
  ok('same subnet -> destination, warna gateway', !bad.length, first(bad));
}

/* ---------- 7. Routing tables har device par ---------- */
console.log('\n7. ROUTING TABLES');
{
  const bad = [];
  const missingRouterRows = [];
  const missingHostDefault = [];
  let devicesChecked = 0;

  for (const k of Topologies.KINDS) {
    const g = Topologies.generate(k, 10, W, H);
    const subnets = new Set(g.devices.map(d => (d.subnet === 0 ? 1 : d.subnet)));

    for (const d of g.devices) {
      const table = Sim.routingTable(d.id, g.devices, g.links);
      devicesChecked++;
      if (!Array.isArray(table)) { bad.push(`${k} ${d.label} array nahi`); continue; }

      if (table.some(r => r.dest === undefined || r.via === undefined))
        bad.push(`${k} ${d.label} adhoori row`);

      /* Router ke paas har subnet ki entry honi chahiye */
      if (Topologies.isRouter(d.type) && table.length !== subnets.size)
        missingRouterRows.push(`${k} ${d.label}: ${table.length}/${subnets.size}`);

      /* Default route SIRF tab jab gateway sach me maujood ho */
      const hasDefault = table.some(r => r.dest === '0.0.0.0/0');
      if (hasDefault && !d.gateway) bad.push(`${k} ${d.label} bina gateway ke default route`);
      if (!hasDefault && d.gateway) missingHostDefault.push(`${k} ${d.label}`);
    }
  }

  ok(`${devicesChecked} devices ki routing table nikali`, devicesChecked === 60, String(devicesChecked));
  ok('har row poori hai aur default route sirf gateway hone par', !bad.length, first(bad));
  ok('har router ke paas har subnet ki entry hai', !missingRouterRows.length, first(missingRouterRows));
  ok('gateway wale har host ke paas default route hai', !missingHostDefault.length, first(missingHostDefault));
}

/* ---------- 8. Advisor har size par ---------- */
console.log('\n8. ADVISOR — 3 se 24 devices');
{
  const bad = [];
  for (const n of SIZES) {
    const r = Advisor.recommend(n, { uptime: 'high', speed: 'medium', cost: 'high', growth: 'low' });
    if (r.rows.length !== 6) bad.push(`n=${n} 6 rows nahi`);
    if (r.rows.some(x => !Number.isFinite(x.score))) bad.push(`n=${n} score NaN`);
    if (!r.reasons.length) bad.push(`n=${n} koi wajah nahi`);
    if (r.reasons.some(x => /undefined|NaN/.test(x))) bad.push(`n=${n} wajah me kachra`);
  }
  ok('har size par saaf recommendation aayi', !bad.length, first(bad));
}

/* ---------- 9. Ek hi paimana — metre ---------- */
console.log('\n9. LAMBAI KA EK HI PAIMANA');
{
  const bad = [];
  for (const k of Topologies.KINDS) {
    for (const n of [4, 8, 16]) {
      const g = Topologies.generate(k, n, W, H);
      const fromLinks = g.links.reduce((s, l) => s + (l.metres || 0), 0);
      const fromFlow  = Flow.cableReport(g.devices, g.links).currentMetres;
      if (Math.abs(fromLinks - fromFlow) > 0.01) bad.push(`${k}@${n}: ${fromLinks} vs ${fromFlow}`);
    }
  }
  ok('topologies.js aur flow.js ek hi lambai batate hain', !bad.length, first(bad));

  const g = Topologies.generate('star', 8, W, H);
  const A = g.devices[0], B = g.devices[1];
  const direct = Math.hypot(A.tx - B.tx, A.ty - B.ty) / Topologies.PX_PER_METRE;
  ok('metresBetween wahi deta hai jo seedha hisaab',
     Math.abs(Topologies.metresBetween(A, B) - direct) < 1e-9);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} pass, ${fail} fail\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
