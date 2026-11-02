/* =========================================================
   graph.js ke tests — browser ki zarurat nahi.

   Chalao:  node tests/graph.test.js

   graph.js jaan-boojh ke DOM se aazad rakhi gayi hai, isliye saare
   algorithms yahan seedhe test ho jaate hain.
   ========================================================= */
const Graph = require('../js/graph.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

/* ---------- chhote helpers: haath se topologies banane ke liye ---------- */
const N = 6;
const ids = Array.from({ length: N }, (_, i) => 'd' + i);
const devs = () => ids.map(id => ({ id }));
const mk = pairs => pairs.map(([a, b], i) => ({ id: 'L' + i, a, b, cost: 1 }));

const BUS  = mk(Array.from({ length: N - 1 }, (_, i) => ['d' + i, 'd' + (i + 1)]));
const RING = mk(Array.from({ length: N },     (_, i) => ['d' + i, 'd' + ((i + 1) % N)]));
const STAR = mk(Array.from({ length: N - 1 }, (_, i) => ['d0', 'd' + (i + 1)]));
const TREE = mk(Array.from({ length: N - 1 }, (_, i) => ['d' + (i >> 1), 'd' + (i + 1)]));
const MESH = (() => {
  const p = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) p.push(['d' + i, 'd' + j]);
  return mk(p);
})();

const analyse = links => {
  const adj = Graph.build(devs(), links);
  return { adj, spof: Graph.findSPOF(adj), stats: Graph.stats(adj) };
};

/* ---------- 1. SPOF detection (Tarjan) ---------- */
console.log('\n1. SINGLE POINTS OF FAILURE');
{
  const bus = analyse(BUS), ring = analyse(RING), star = analyse(STAR),
        mesh = analyse(MESH), tree = analyse(TREE);

  // Ring me har jodi ke beech do raaste hain — koi cut vertex/edge ho hi nahi sakta
  ok('RING me koi SPOF device nahi', ring.spof.articulation.size === 0);
  ok('RING me koi bridge cable nahi', ring.spof.bridges.size === 0);

  ok('MESH me koi SPOF device nahi', mesh.spof.articulation.size === 0);
  ok('MESH me koi bridge nahi', mesh.spof.bridges.size === 0);

  // Star ka hub hi ekmatra cut vertex hai; spokes endpoints hain
  ok('STAR me theek 1 SPOF (hub)', star.spof.articulation.size === 1 && star.spof.articulation.has('d0'));
  ok('STAR me har cable bridge hai', star.spof.bridges.size === STAR.length);

  // Bus ek chain hai: dono sire chhod ke sab cut vertex hain
  ok('BUS me beech ke saare devices SPOF', bus.spof.articulation.size === N - 2, `${bus.spof.articulation.size}`);
  ok('BUS me har cable bridge hai', bus.spof.bridges.size === BUS.length);

  ok('TREE me har cable bridge hai', tree.spof.bridges.size === TREE.length);
}

/* ---------- 2. Distance metrics ---------- */
console.log('\n2. DIAMETER / AVG HOPS');
{
  ok('MESH ka diameter 1 hai', analyse(MESH).stats.diameter === 1);
  ok('BUS ka diameter n-1 hai', analyse(BUS).stats.diameter === N - 1);
  ok('STAR ka diameter 2 hai', analyse(STAR).stats.diameter === 2);
  ok('MESH me avg hops theek 1', analyse(MESH).stats.avgHops === 1);
  ok('sab jude hue hain to reachable 100%', analyse(RING).stats.reachablePct === 100);
}

/* ---------- 3. Chaos — network tootta hai ya nahi ---------- */
console.log('\n3. CHAOS');
{
  const kill = (id, links) => Graph.build(
    ids.map(x => x === id ? { id: x, dead: true } : { id: x }), links);
  const cut = (indices, links) => Graph.build(
    devs(), links.map((l, i) => indices.includes(i) ? { ...l, dead: true } : l));

  ok('STAR: hub mara to har spoke apna alag island',
     Graph.components(kill('d0', STAR)).length === N - 1);
  ok('RING: ek cable kata to bhi ek hi tukda',
     Graph.components(cut([0], RING)).length === 1);
  ok('RING: do cable kate to do arcs',
     Graph.components(cut([0, 3], RING)).length === 2);
  ok('MESH: ek device mara to baaki phir bhi jude',
     Graph.components(kill('d0', MESH)).length === 1);
  ok('BUS: beech ka cable kata to theek do tukde',
     Graph.components(cut([2], BUS)).length === 2);
}

/* ---------- 4. Routing ---------- */
console.log('\n4. ROUTING');
{
  const meshAdj = Graph.build(devs(), MESH);
  const busAdj  = Graph.build(devs(), BUS);

  ok('MESH me har jodi 1 hop door', Graph.bfs(meshAdj, 'd0', 'd5').hops === 1);
  ok('BUS me d0->d5 poori chain se jaata hai',
     Graph.bfs(busAdj, 'd0', 'd5').path.join('>') === 'd0>d1>d2>d3>d4>d5');

  const dj = Graph.dijkstra(busAdj, 'd0', 'd5');
  ok('Dijkstra ka cost hops ke barabar (sab cable cost 1)', dj.cost === 5);
  ok('Dijkstra utne hi cables use karta hai', dj.linkPath.length === 5);

  // seedha cable kaato -> doosre raaste se jaana chahiye
  const direct = MESH.find(l => l.a === 'd0' && l.b === 'd5');
  const rerouted = Graph.bfs(
    Graph.build(devs(), MESH.map(l => l.id === direct.id ? { ...l, dead: true } : l)),
    'd0', 'd5');
  ok('seedha cable katne par reroute ho jaata hai', rerouted && rerouted.hops === 2,
     rerouted && rerouted.path.join('>'));

  ok('toote network me koi raasta nahi milta',
     Graph.bfs(Graph.build(devs(), BUS.map((l, i) => i === 2 ? { ...l, dead: true } : l)),
               'd0', 'd5') === null);
}

/* ---------- 5. Resilience (N-1 contingency) ---------- */
console.log('\n5. RESILIENCE');
{
  const r = links => Graph.resilience(devs(), links);
  const bus = r(BUS), ring = r(RING), star = r(STAR), mesh = r(MESH), tree = r(TREE);

  ok('MESH ka koi weak point nahi', mesh.worst === null);
  ok('RING ka koi weak point nahi', ring.worst === null);
  ok('MESH aur RING dono 100% survival', mesh.survivalPct === 100 && ring.survivalPct === 100);

  ok('STAR ka weakest point hub hai',
     star.worst && star.worst.kind === 'device' && star.worst.id === 'd0');
  ok('STAR ki survival sabse kam hai',
     star.survivalPct < bus.survivalPct && star.survivalPct < tree.survivalPct,
     `star ${Math.round(star.survivalPct)}% vs bus ${Math.round(bus.survivalPct)}%`);

  ok('score ka kram: mesh > ring > tree/bus > star',
     mesh.score > ring.score && ring.score > tree.score && tree.score >= bus.score && bus.score > star.score,
     [mesh, ring, tree, bus, star].map(x => Math.round(x.score)).join(' > '));

  ok('BUS/STAR/TREE ab 0 par tie nahi hote',
     new Set([bus.score, star.score, tree.score].map(Math.round)).size > 1);

  // pehle se toota network
  const broken = Graph.resilience(
    ids.map(x => x === 'd0' ? { id: x, dead: true } : { id: x }), STAR);
  ok('toote network par alreadySplit set hota hai', broken.alreadySplit === true);
  ok('toote network par koi weak point report nahi hota', broken.worst === null);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} pass, ${fail} fail\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
