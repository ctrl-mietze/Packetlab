/* =========================================================
   flow.js ke tests — browser ki zarurat nahi.

   Chalao:  node tests/flow.test.js

   Max-flow aur MST dono ke jawab pehle se pata hote hain, isliye yahan
   sirf "crash nahi hua" nahi, ASLI SAHI JAWAB check kiya jaata hai.
   ========================================================= */
globalThis.Graph      = require('../js/graph.js');
globalThis.Render     = require('../js/render.js');
globalThis.Topologies = require('../js/topologies.js');
const Flow = require('../js/flow.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const W = 1200, H = 700;

/* haath se graph banane ke liye chhote helper */
const dev = (id, x, y) => ({ id, label: id, x, y, tx: x, ty: y, type: 'pc', dead: false });
const lnk = (id, a, b) => ({ id, a, b, dead: false, cost: 1 });

/* ---------- 1. MAX-FLOW ke jaane-pehchaane jawab ---------- */
console.log('\n1. MAX-FLOW — jawab pehle se pata hai');
{
  // A -- B : ek hi cable, to flow 1
  {
    const d = [dev('A',0,0), dev('B',100,0)];
    const l = [lnk('L1','A','B')];
    const r = Flow.maxFlow(d, l, 'A', 'B');
    ok('seedha ek cable -> flow 1', r.flow === 1, String(r.flow));
    ok('us ek cable ko kaatna hi min-cut hai', r.cut.length === 1 && r.cut[0] === 'L1');
  }

  // A ke do alag raaste B tak -> flow 2
  {
    const d = [dev('A',0,0), dev('M',50,-50), dev('N',50,50), dev('B',100,0)];
    const l = [lnk('L1','A','M'), lnk('L2','M','B'), lnk('L3','A','N'), lnk('L4','N','B')];
    const r = Flow.maxFlow(d, l, 'A', 'B');
    ok('do alag raaste -> flow 2', r.flow === 2, String(r.flow));
    ok('min-cut me bhi theek 2 cable', r.cut.length === 2, r.cut.join(','));
    ok('dono raaste lautaye gaye', r.paths.length === 2);
    const used = r.paths.flatMap(p => p.join('>'));
    ok('dono raaste alag hain', new Set(used).size === 2, used.join(' | '));
  }

  // bottleneck: do raaste, par beech me ek hi cable -> flow 1
  {
    const d = [dev('A',0,0), dev('M',50,-50), dev('N',50,50), dev('X',80,0), dev('B',150,0)];
    const l = [lnk('L1','A','M'), lnk('L2','A','N'), lnk('L3','M','X'), lnk('L4','N','X'), lnk('L5','X','B')];
    const r = Flow.maxFlow(d, l, 'A', 'B');
    ok('bottleneck ho to flow 1', r.flow === 1, String(r.flow));
    ok('min-cut wahi bottleneck cable batata hai', r.cut.length === 1 && r.cut[0] === 'L5', r.cut.join(','));
  }

  // juda hi nahi -> flow 0
  {
    const d = [dev('A',0,0), dev('B',100,0)];
    const r = Flow.maxFlow(d, [], 'A', 'B');
    ok('koi cable nahi -> flow 0', r.flow === 0);
    ok('cut bhi khaali', r.cut.length === 0);
  }

  // khud se khud tak
  {
    const d = [dev('A',0,0)];
    const r = Flow.maxFlow(d, [], 'A', 'A');
    ok('khud se khud tak -> 0 aur sameNode flag', r.flow === 0 && r.sameNode === true);
  }
}

/* ---------- 2. MAX-FLOW == MIN-CUT, har topology par ---------- */
console.log('\n2. MAX-FLOW HAMESHA MIN-CUT KE BARABAR');
{
  const bad = [];
  let pairs = 0;
  for (const k of Topologies.KINDS) {
    for (const n of [4, 6, 8]) {
      const g = Topologies.generate(k, n, W, H);
      for (let i = 0; i < g.devices.length; i++) {
        for (let j = i + 1; j < g.devices.length; j++) {
          const r = Flow.maxFlow(g.devices, g.links, g.devices[i].id, g.devices[j].id);
          pairs++;
          if (r.flow !== r.cut.length)
            bad.push(`${k}@${n} ${g.devices[i].label}-${g.devices[j].label}: flow ${r.flow} vs cut ${r.cut.length}`);
        }
      }
    }
  }
  ok(`${pairs} jodon par max-flow theorem sahi utra`, !bad.length, bad.slice(0, 2).join(' | '));
}

/* ---------- 3. Topology ka shape flow me dikhta hai ---------- */
console.log('\n3. HAR TOPOLOGY KA APNA FLOW');
{
  const flowBetweenHosts = (kind, n) => {
    const g = Topologies.generate(kind, n, W, H);
    const hosts = g.devices.filter(d => Topologies.isHost(d.type));
    return Flow.maxFlow(g.devices, g.links, hosts[0].id, hosts[1].id).flow;
  };

  ok('BUS me do host ke beech ek hi raasta', flowBetweenHosts('bus', 8) === 1);
  ok('STAR me bhi ek hi raasta (hub se hoke)', flowBetweenHosts('star', 8) === 1);
  ok('RING me do raaste (dono taraf se)', flowBetweenHosts('ring', 8) === 2);
  ok('TREE me ek hi raasta', flowBetweenHosts('tree', 8) === 1);

  const g = Topologies.generate('mesh', 8, W, H);
  const f = Flow.maxFlow(g.devices, g.links, g.devices[0].id, g.devices[1].id).flow;
  ok('MESH me har doosre device se hoke raasta banta hai', f === g.devices.length - 1, String(f));
}

/* ---------- 4. Cable kaatne se flow ghatta hai ---------- */
console.log('\n4. CABLE KAATO -> FLOW GHATE');
{
  const g = Topologies.generate('ring', 8, W, H);
  const a = g.devices[0], b = g.devices[4];
  const before = Flow.maxFlow(g.devices, g.links, a.id, b.id).flow;
  ok('ring me shuru me 2', before === 2, String(before));

  const cut1 = Flow.maxFlow(g.devices, g.links, a.id, b.id).cut[0];
  g.links.find(l => l.id === cut1).dead = true;
  const after = Flow.maxFlow(g.devices, g.links, a.id, b.id).flow;
  ok('ek cable kaatne par 1 bacha', after === 1, String(after));

  const cut2 = Flow.maxFlow(g.devices, g.links, a.id, b.id).cut[0];
  g.links.find(l => l.id === cut2).dead = true;
  const after2 = Flow.maxFlow(g.devices, g.links, a.id, b.id).flow;
  ok('doosra kaatne par network tut gaya', after2 === 0, String(after2));

  ok('graph.js bhi kehta hai ab do tukde hain',
     Graph.components(Graph.build(g.devices, g.links.filter(l => !l.dead))).length === 2);
}

/* ---------- 5. Sabse kamzor jodi ---------- */
console.log('\n5. SABSE KAMZOR JODI');
{
  const g = Topologies.generate('star', 8, W, H);
  const w = Flow.weakestPair(g.devices, g.links);
  ok('star me sabse kamzor jodi ka flow 1 hai', w.flow === 1, `${w.a.label}-${w.b.label}`);

  const m = Topologies.generate('mesh', 6, W, H);
  const wm = Flow.weakestPair(m.devices, m.links);
  ok('mesh me sabse kamzor jodi ka flow bhi 1 se zyada', wm.flow > 1, String(wm.flow));
}

/* ---------- 6. MST — Kruskal ke jaane-pehchaane jawab ---------- */
console.log('\n6. MINIMUM SPANNING TREE');
{
  // ek line me chaar device: MST wahi seedhi line honi chahiye
  {
    const d = [dev('A',0,0), dev('B',100,0), dev('C',200,0), dev('D',300,0)];
    const r = Flow.mst(d);
    ok('n devices -> n-1 cable', r.edges.length === 3);
    // lambai METRE me aati hai (topologies.js: 4 px = 1 m), pixel me nahi
    ok('seedhi line 300 px = 75 m', Math.round(r.length) === 75, String(Math.round(r.length)));
    ok('poora juda hua hai', r.complete);
    const pairs = r.edges.map(e => [e.a, e.b].sort().join(''));
    ok('padosi hi jude, door wale nahi', pairs.sort().join(',') === 'AB,BC,CD', pairs.join(','));
  }

  // chaukor: MST me sabse lambi (diagonal) kabhi nahi aani chahiye
  {
    const d = [dev('A',0,0), dev('B',100,0), dev('C',100,100), dev('D',0,100)];
    const r = Flow.mst(d);
    ok('chaukor par 3 cable', r.edges.length === 3);
    ok('teenon side barabar (100 px = 25 m) — diagonal nahi chuni gayi',
       r.edges.every(e => Math.round(e.w) === 25), r.edges.map(e => Math.round(e.w)).join(','));
  }

  // ek hi device / khaali
  ok('ek device par koi cable nahi', Flow.mst([dev('A',0,0)]).edges.length === 0);
  ok('khaali list par bhi crash nahi', Flow.mst([]).edges.length === 0);

  // mara hua device MST me nahi aata
  {
    const d = [dev('A',0,0), dev('B',100,0), dev('C',200,0)];
    d[1].dead = true;
    const r = Flow.mst(d);
    ok('mara hua device chhod diya jaata hai', r.edges.length === 1);
    ok('aur wo cable zinda dono ko jodta hai',
       [r.edges[0].a, r.edges[0].b].sort().join('') === 'AC');
  }
}

/* ---------- 7. MST ka niyam: har topology par sabse sasta ---------- */
console.log('\n7. MST HAMESHA SABSE SASTA HOTA HAI');
{
  const bad = [], badCount = [], badCycle = [];
  for (const k of Topologies.KINDS) {
    for (const n of [4, 6, 8, 12]) {
      const g = Topologies.generate(k, n, W, H);
      const rep = Flow.cableReport(g.devices, g.links);

      // MST kabhi maujooda cabling se lamba nahi ho sakta (jab network juda ho)
      const connected = Graph.components(Graph.build(g.devices, g.links)).length === 1;
      if (connected && rep.mstMetres > rep.currentMetres + 0.001)
        bad.push(`${k}@${n}: mst ${rep.mstMetres.toFixed(1)} > current ${rep.currentMetres.toFixed(1)}`);

      // hamesha theek n-1 cable
      if (rep.mstCables !== rep.devices - 1)
        badCount.push(`${k}@${n}: ${rep.mstCables} cable, ${rep.devices - 1} chahiye`);

      // MST me koi loop nahi — n-1 edge aur sab jude hue
      const adj = Graph.build(g.devices, rep.edges.map((e, i) => ({ id: 'M' + i, a: e.a, b: e.b, dead: false, cost: 1 })));
      if (Graph.components(adj).length !== 1) badCycle.push(`${k}@${n}: mst toota hua`);
    }
  }
  ok('MST kabhi maujooda cabling se mehnga nahi nikla', !bad.length, bad[0] || '');
  ok('MST me hamesha theek n-1 cable', !badCount.length, badCount[0] || '');
  ok('MST hamesha ek hi juda hua tukda', !badCycle.length, badCycle[0] || '');
}

/* ---------- 8. Cable report ke numbers ---------- */
console.log('\n8. CABLE REPORT');
{
  const g = Topologies.generate('mesh', 8, W, H);
  const rep = Flow.cableReport(g.devices, g.links);
  ok('mesh me bahut zyada cable hai — bachat dikhni chahiye', rep.savingMetres > 0,
     `${Math.round(rep.savingMetres)} m bach sakte the`);
  ok('mesh me fazool cables ki ginti bhi', rep.extraCables === 28 - 7, String(rep.extraCables));

  const s = Topologies.generate('star', 8, W, H);
  const rs = Flow.cableReport(s.devices, s.links);
  ok('star me pehle se hi theek n-1 cable hain', rs.extraCables === 0, String(rs.extraCables));

  // toote network par saving 0 rehni chahiye, negative nahi
  const b = Topologies.generate('bus', 8, W, H);
  b.links.forEach(l => { l.dead = true; });
  const rb = Flow.cableReport(b.devices, b.links);
  ok('bina cable wale network par saving negative nahi hoti', rb.savingMetres === 0, String(rb.savingMetres));
  ok('aur extra cables bhi 0', rb.extraCables === 0);
}

/* ---------- 9. UNION-FIND khud ---------- */
console.log('\n9. UNION-FIND');
{
  const dsu = Flow.makeDSU(['a','b','c','d']);
  ok('shuru me sab alag', dsu.find('a') !== dsu.find('b'));
  ok('pehla union kaam karta hai', dsu.union('a','b') === true);
  ok('ab dono ek hi tukde me', dsu.find('a') === dsu.find('b'));
  ok('wahi union dobara false lautata hai', dsu.union('a','b') === false);
  dsu.union('c','d'); dsu.union('b','c');
  ok('teen union ke baad chaaron ek hi tukde me',
     new Set(['a','b','c','d'].map(dsu.find)).size === 1);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} pass, ${fail} fail\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
