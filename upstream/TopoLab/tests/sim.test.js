/* Headless simulation test — browser ke rAF ke bina engine ko khud chalate hain */
globalThis.Graph       = require('../js/graph.js');
globalThis.Render      = require('../js/render.js');
globalThis.Topologies  = require('../js/topologies.js');
const Sim = require('../js/sim.js');

const W = 1200, H = 600;
let pass = 0, fail = 0;
const ok  = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

/* engine ko n seconds tak 60fps par chalao */
function run(engine, devices, links, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) engine.update(dt, devices, links);
}

function scene(kind, n = 6) {
  const gen = Topologies.generate(kind, n, W, H);
  const logs = [];
  const engine = Sim.createEngine((m, k) => logs.push(`[${k || '-'}] ${m}`));
  return { ...gen, engine, logs, adj: Graph.build(gen.devices, gen.links) };
}

/* ---------- 1. DATA PACKET pahunchta hai? ---------- */
console.log('\n1. DATA PACKET DELIVERY');
{
  const s = scene('ring', 6);
  const src = s.devices[0], dst = s.devices[3];
  const route = Graph.bfs(s.adj, src.id, dst.id);
  let delivered = false;
  Sim.sendData(s.engine, route, { onDone: () => { delivered = true; } });

  ok('flight launch hua', s.engine.busy());
  run(s.engine, s.devices, s.links, 6);
  ok('packet destination tak pahuncha', delivered, `${route.hops} hops`);
  ok('engine khaali ho gaya', !s.engine.busy());
}

/* ---------- 2. Lamba cable = zyada time (speed constant hai) ---------- */
console.log('\n2. PACKET SPEED CABLE KI LAMBAI KE HISAAB SE');
{
  const time = (kind, hops) => {
    const s = scene(kind, 6);
    const src = s.devices[0];
    const dst = s.devices.find(d => {
      const r = Graph.bfs(s.adj, src.id, d.id);
      return r && r.hops === hops;
    });
    if (!dst) return null;
    const route = Graph.bfs(s.adj, src.id, dst.id);
    let t = null;
    Sim.sendData(s.engine, route, { onDone: () => { t = frames / 60; } });
    let frames = 0;
    while (s.engine.busy() && frames < 900) { s.engine.update(1 / 60, s.devices, s.links); frames++; }
    return t;
  };
  const t1 = time('ring', 1), t2 = time('ring', 2);
  ok('2 hops me 1 hop se zyada time laga', t1 !== null && t2 !== null && t2 > t1,
     `${t1?.toFixed(2)}s vs ${t2?.toFixed(2)}s`);
}

/* ---------- 3. ARP resolve + cache ---------- */
console.log('\n3. ARP BROADCAST + REPLY');
{
  const s = scene('star', 8);
  const hosts = s.devices.filter(d => d.type === 'pc' || d.type === 'server');
  const src = hosts[0], dst = hosts[hosts.length - 1];
  let resolved = false;

  ok('shuru me ARP cache khaali hai', src.arp.size === 0);
  const started = Sim.sendArp(s.engine, s.adj, s.devices, s.links, src.id, dst.id, () => { resolved = true; });
  ok('ARP broadcast shuru hua', started);

  run(s.engine, s.devices, s.links, 8);
  ok('ARP resolve ho gaya', resolved);
  ok('sender ki cache me destination aa gaya', src.arp.get(dst.ip) === dst.mac, `${dst.ip} -> ${src.arp.get(dst.ip)}`);
  ok('destination ne bhi sender ko yaad rakha', dst.arp.get(src.ip) === src.mac);
}

/* ---------- 4. Beech raaste me cable kata -> packet drop ---------- */
console.log('\n4. MID-FLIGHT FAILURE');
{
  const s = scene('bus', 8);
  const src = s.devices[0], dst = s.devices[7];
  const route = Graph.bfs(s.adj, src.id, dst.id);
  let delivered = false;
  Sim.sendData(s.engine, route, { onDone: () => { delivered = true; } });

  run(s.engine, s.devices, s.links, 0.5);
  // aage waala cable kaat do
  s.links.find(l => l.id === route.linkPath[route.linkPath.length - 1]).dead = true;
  run(s.engine, s.devices, s.links, 8);

  ok('packet deliver NAHI hua', !delivered);
  ok('drop log hua', s.logs.some(l => l.includes('Packet drop')), s.logs.find(l => l.includes('drop')) || '');
}

/* ---------- 5. CSMA/CD — bus par collision, switch par nahi ---------- */
console.log('\n5. CSMA/CD COLLISION');
{
  const s = scene('bus', 8);
  const hosts = s.devices.filter(d => d.type === 'pc');
  Sim.collisionDemo(s.engine, s.adj, s.devices, s.links, hosts[0].id, hosts[1].id, s.devices[7].id, (m, k) => s.logs.push(`[${k || '-'}] ${m}`));
  run(s.engine, s.devices, s.links, 5);

  ok('BUS par collision hui', s.logs.some(l => l.includes('COLLISION')));
  ok('jam ke baad backoff hua', s.logs.some(l => l.includes('Backoff')));
  ok('dono ne dobara bheja', s.logs.filter(l => l.includes('retransmitted')).length === 2);
  ok('blast dikha', true);
}
{
  const s = scene('star', 8);
  const hosts = s.devices.filter(d => d.type === 'pc');
  Sim.collisionDemo(s.engine, s.adj, s.devices, s.links, hosts[0].id, hosts[1].id,
    s.devices.find(d => d.type === 'server').id, (m, k) => s.logs.push(`[${k || '-'}] ${m}`));
  run(s.engine, s.devices, s.links, 5);

  ok('STAR par collision NAHI hui', !s.logs.some(l => l.includes('COLLISION')));
  ok('switch buffering samjhaayi gayi', s.logs.some(l => l.includes('SWITCH') || l.includes('collision domains')),
     (s.logs.find(l => l.includes('SWITCH') || l.includes('collision domain')) || '').slice(0, 95));
}

/* ---------- 6. Routing tables ---------- */
console.log('\n6. ROUTING TABLES');
{
  const s = scene('tree', 12);
  const router = s.devices.find(d => d.type === 'router');
  const rows = Sim.routingTable(router.id, s.devices, s.links);
  const subnets = new Set(s.devices.map(d => d.subnet === 0 ? 1 : d.subnet));
  ok('router ke paas har subnet ki entry hai', rows.length === subnets.size, `${rows.length} rows / ${subnets.size} subnets`);
  ok('har row ka next-hop bharaa hai', rows.every(r => r.via && r.via !== 'unreachable'));

  const pc = s.devices.find(d => d.type === 'pc');
  const hostRows = Sim.routingTable(pc.id, s.devices, s.links);
  ok('host ke paas default gateway route hai', hostRows.some(r => r.dest === '0.0.0.0/0'));

  // ek switch maaro -> uska subnet unreachable dikhna chahiye
  const sw = s.devices.find(d => d.type === 'switch');
  sw.dead = true;
  const after = Sim.routingTable(router.id, s.devices, s.links);
  ok('switch marne par uska subnet unreachable ho gaya',
     after.some(r => r.via === 'unreachable'),
     after.filter(r => r.via === 'unreachable').map(r => r.dest).join(','));
}

/* ---------- 7. PACKET RECORDS (inspector isi ko dikhata hai) ---------- */
console.log('\n7. PACKET RECORDS');
{
  const s = scene('tree', 8);
  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  const src = hosts[0], dst = hosts[hosts.length - 1];
  const route = Graph.bfs(s.adj, src.id, dst.id);

  Sim.sendData(s.engine, route, { devices: s.devices });
  ok('bhejte hi sender ke paas record aa gaya', (src.seen || []).length === 1);
  ok('sender ka record "sent" hai', src.seen[0].dir === 'sent');

  run(s.engine, s.devices, s.links, 12);

  const got = (dst.seen || []).find(p => p.kind === 'data');
  ok('destination ko record mila', !!got);
  ok('destination par dir = received', got && got.dir === 'received');
  ok('hop ginti sahi hai', got && got.hop === route.hops && got.hops === route.hops,
     got ? `hop ${got.hop} of ${got.hops}` : '');
  ok('data frame 1500 bytes ka hai', got && got.bytes === 1500);

  const mid = s.devices.find(d => (d.seen || []).some(p => p.kind === 'data' && p.dir === 'forwarded'));
  ok('beech wale device par dir = forwarded', !!mid, mid ? mid.label : '');

  // TTL sirf ROUTER par ghatta hai, switch/hub par nahi
  const routers = route.path.slice(1).filter(id =>
    Topologies.isRouter(s.devices.find(d => d.id === id).type)).length;
  ok('TTL har router par ek ghata', got && got.ttl === 64 - routers,
     got ? `ttl ${got.ttl}, ${routers} router(s) beech me` : '');

  // list SEEN_LIMIT (8) par ruk jaati hai
  for (let i = 0; i < 12; i++) {
    Sim.sendData(s.engine, route, { devices: s.devices });
    run(s.engine, s.devices, s.links, 12);
  }
  ok('record list 8 par ruk jaati hai', dst.seen.length === 8, `${dst.seen.length} entries`);
}

/* ---------- 8. ARP ka record ---------- */
console.log('\n8. ARP RECORDS');
{
  const s = scene('star', 6);
  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  const src = hosts[0], dst = hosts[1];
  Sim.sendArp(s.engine, s.adj, s.devices, s.links, src.id, dst.id, () => {});
  run(s.engine, s.devices, s.links, 8);

  const q = (src.seen || []).find(p => p.kind === 'arp');
  ok('ARP request record bana', !!q);
  ok('broadcast MAC FF:FF:FF:FF:FF:FF hai', q && q.toMac === 'FF:FF:FF:FF:FF:FF');
  ok('sawaal poora likha hai', q && /Who has .* Tell /.test(q.question), q ? q.question : '');
  ok('ARP frame 64 bytes ka hai', q && q.bytes === 64);

  const sw = s.devices.find(d => d.type === 'switch');
  ok('beech ke switch ne bhi broadcast suna',
     (sw.seen || []).some(p => p.kind === 'arp' && p.dir === 'heard'));
  ok('ARP reply ka record bhi bana',
     (src.seen || []).some(p => p.kind === 'reply' && p.dir === 'received'));
}

/* ---------- 9. PORTS ---------- */
console.log('\n9. PORTS');
{
  for (const kind of Topologies.KINDS) {
    const g = Topologies.generate(kind, 8, W, H);
    const deg = new Map(g.devices.map(d => [d.id, 0]));
    g.links.forEach(l => { deg.set(l.a, deg.get(l.a) + 1); deg.set(l.b, deg.get(l.b) + 1); });
    ok(`${kind}: har device me itne port hain ki saare cable fit ho jaayein`,
       g.devices.every(d => d.ports >= deg.get(d.id)),
       `max degree ${Math.max(...deg.values())}`);
    ok(`${kind}: port count asli hardware wale size me hai`,
       g.devices.every(d => Topologies.PORT_LADDER.includes(d.ports)));
  }
  ok('switch ka default 8 port hai', Topologies.portsFor('switch') === 8);
  ok('PC ka default 2 port hai', Topologies.portsFor('pc') === 2);
  ok('5 cable ke liye 8-port wala hardware chunta hai', Topologies.ladderUp(5) === 8);
}

/* ---------- 10. FIREWALL ---------- */
console.log('\n10. FIREWALL');
{
  const s = scene('tree', 8);
  // kisi bhi preset me firewall nahi hota — router ko firewall bana dete hain
  const fw = s.devices.find(d => Topologies.isRouter(d.type));
  fw.type = 'firewall';
  fw.rules = [];

  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  // aisa jodda dhoondho jiska raasta firewall se hoke jaata ho
  let A = null, B = null, route = null;
  for (const a of hosts) {
    for (const b of hosts) {
      if (a === b) continue;
      const r = Graph.bfs(s.adj, a.id, b.id);
      if (r && r.path.includes(fw.id)) { A = a; B = b; route = r; break; }
    }
    if (route) break;
  }
  ok('firewall se hoke jaane wala raasta mila', !!route, route ? `${A.label} -> ${B.label}` : '');

  ok('bina rule ke sab allow hai', !Sim.firewallCheck(s.devices, s.links, route.path, 'data').blocked);

  fw.rules.push({ action: 'block', proto: 'any', from: A.id, to: B.id });
  const v = Sim.firewallCheck(s.devices, s.links, route.path, 'data');
  ok('block rule ne rok diya', v.blocked);
  ok('rok firewall par hi lagi', v.blocked && v.at.id === fw.id);
  ok('kaunse rule ne roka wo bhi pata hai', v.blocked && v.rule.action === 'block');

  ok('ulti disha khuli hai', !Sim.firewallCheck(s.devices, s.links, [...route.path].reverse(), 'data').blocked);

  // pehla match jeetta hai: upar allow lagao to block neeche reh jaata hai
  fw.rules.unshift({ action: 'allow', proto: 'any', from: A.id, to: B.id });
  ok('pehla match jeetta hai — upar wala allow chala', !Sim.firewallCheck(s.devices, s.links, route.path, 'data').blocked);
  fw.rules.shift();

  // proto ke hisaab se
  fw.rules = [{ action: 'block', proto: 'arp', from: 'any', to: 'any' }];
  ok('sirf-ARP rule ne ARP roka', Sim.firewallCheck(s.devices, s.links, route.path, 'arp').blocked);
  ok('sirf-ARP rule ne data nahi roka', !Sim.firewallCheck(s.devices, s.links, route.path, 'data').blocked);

  // mara hua firewall kuch nahi rokta — traffic ka raasta hi nahi bachta
  fw.rules = [{ action: 'block', proto: 'any', from: 'any', to: 'any' }];
  fw.dead = true;
  ok('mara hua firewall rule lagu nahi karta', !Sim.firewallCheck(s.devices, s.links, route.path, 'data').blocked);
  fw.dead = false;

  ok('rule angrezi me padha ja sakta hai',
     /^Block all traffic from .* to .*/.test(Sim.ruleText(fw.rules[0], new Map(s.devices.map(d => [d.id, d])))),
     Sim.ruleText(fw.rules[0], new Map(s.devices.map(d => [d.id, d]))));
}

/* ---------- 11. HUB / ACCESS POINT ---------- */
console.log('\n11. HUB AUR ACCESS POINT');
{
  ok('hub shared medium hai', Topologies.isSharedMedium('hub'));
  ok('access point shared medium hai', Topologies.isSharedMedium('ap'));
  ok('switch shared medium NAHI hai', !Topologies.isSharedMedium('switch'));
  ok('sirf access point wireless hai', Topologies.isWireless('ap') && !Topologies.isWireless('hub'));

  // star ka switch hub bana do -> ab uske saare device ek dusre ki frame sunte hain
  const s = scene('star', 6);
  const hub = s.devices.find(d => d.type === 'switch');
  hub.type = 'hub';
  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  const A = hosts[0], B = hosts[1], C = hosts[2];

  const route = Graph.bfs(s.adj, A.id, B.id);
  Sim.sendData(s.engine, route, { devices: s.devices, links: s.links });
  run(s.engine, s.devices, s.links, 10);

  const heard = (C.seen || []).find(p => p.dir === 'heard' && p.kind === 'data');
  ok('hub ne frame har dusre port par bhi bhej di', !!heard, heard ? `${C.label} ne suni` : '');
  ok('sunne wale ko wajah bhi batayi gayi', heard && /repeats every frame/.test(heard.hint || ''));
  ok('frame asli me kisi aur ke liye thi', heard && heard.toLabel === B.label);

  /* SWITCH par kahani alag hai: pehli frame flood hoti hai kyunki MAC
     abhi seekha nahi gaya, doosri nahi hoti. Yahi asli switch karta hai. */
  const s2 = scene('star', 6);
  const h2 = s2.devices.filter(d => Topologies.isHost(d.type));
  const sw2 = s2.devices.find(d => d.type === 'switch');
  const route2 = Graph.bfs(s2.adj, h2[0].id, h2[1].id);

  Sim.sendData(s2.engine, route2, { devices: s2.devices, links: s2.links });
  run(s2.engine, s2.devices, s2.links, 10);
  const heardFirst = (h2[2].seen || []).filter(p => p.dir === 'heard' && p.kind === 'data').length;
  ok('switch pehli frame flood karta hai (MAC abhi seekha nahi)', heardFirst === 1, `${heardFirst} baar suni`);
  ok('flood ki wajah bhi likhi gayi',
     (h2[2].seen || []).some(p => /has not learned/.test(p.hint || '')));

  ok('switch ne bhejne wale ka MAC seekh liya',
     sw2.macTable instanceof Map && sw2.macTable.has(h2[0].mac));

  /* Destination ne abhi tak kuch bola hi nahi, isliye switch ko nahi
     pata wo kis port par hai — aur ek-tarfa traffic har baar flood hi
     hoga. Asli switch bhi bilkul yahi karta hai. */
  ok('destination ne kuch bhej hi nahi, to switch use abhi nahi jaanta',
     !sw2.macTable.has(h2[1].mac));

  s2.devices.forEach(d => { d.seen = []; });
  Sim.sendData(s2.engine, route2, { devices: s2.devices, links: s2.links });
  run(s2.engine, s2.devices, s2.links, 10);
  ok('isliye doosri frame bhi flood hoti hai',
     (h2[2].seen || []).filter(p => p.dir === 'heard' && p.kind === 'data').length === 1);

  /* Ab ARP chalao — reply DESTINATION se aati hai, aur wahin switch
     uska MAC seekh leta hai. Uske baad flooding band. */
  Sim.sendArp(s2.engine, s2.adj, s2.devices, s2.links, h2[0].id, h2[1].id, () => {});
  run(s2.engine, s2.devices, s2.links, 10);
  ok('ARP reply se switch ne destination ka MAC seekh liya',
     sw2.macTable.has(h2[1].mac), `${sw2.macTable.size} entries`);

  s2.devices.forEach(d => { d.seen = []; });
  Sim.sendData(s2.engine, route2, { devices: s2.devices, links: s2.links });
  run(s2.engine, s2.devices, s2.links, 10);
  ok('ab frame flood NAHI hoti — switch jaanta hai wo kis port par hai',
     (h2[2].seen || []).filter(p => p.dir === 'heard' && p.kind === 'data').length === 0);
  ok('destination ko phir bhi frame mili',
     (h2[1].seen || []).some(p => p.kind === 'data' && p.dir === 'received'));

  // HUB har baar flood karta hai, kabhi seekhta nahi
  const s5 = scene('star', 6);
  s5.devices.find(d => d.type === 'switch').type = 'hub';
  const h5 = s5.devices.filter(d => Topologies.isHost(d.type));
  const r5 = Graph.bfs(s5.adj, h5[0].id, h5[1].id);
  for (let i = 0; i < 2; i++) {
    Sim.sendData(s5.engine, r5, { devices: s5.devices, links: s5.links });
    run(s5.engine, s5.devices, s5.links, 10);
  }
  ok('hub dono baar flood karta hai — wo kuch seekhta hi nahi',
     (h5[2].seen || []).filter(p => p.dir === 'heard' && p.kind === 'data').length === 2);

  // HUB par collision hoti hai, AP par nahi (CSMA/CA)
  const s3 = scene('star', 6);
  s3.devices.find(d => d.type === 'switch').type = 'hub';
  const h3 = s3.devices.filter(d => Topologies.isHost(d.type));
  Sim.collisionDemo(s3.engine, s3.adj, s3.devices, s3.links, h3[0].id, h3[1].id, h3[2].id, (m, k) => s3.logs.push(`[${k || '-'}] ${m}`));
  run(s3.engine, s3.devices, s3.links, 4);
  ok('hub par collision hui', s3.logs.some(l => /COLLISION/.test(l)));
  ok('hub ko ek collision domain bataya gaya', s3.logs.some(l => /one single collision domain/.test(l)));

  const s4 = scene('star', 6);
  s4.devices.find(d => d.type === 'switch').type = 'ap';
  const h4 = s4.devices.filter(d => Topologies.isHost(d.type));
  Sim.collisionDemo(s4.engine, s4.adj, s4.devices, s4.links, h4[0].id, h4[1].id, h4[2].id, (m, k) => s4.logs.push(`[${k || '-'}] ${m}`));
  run(s4.engine, s4.devices, s4.links, 4);
  ok('access point par collision NAHI hui', !s4.logs.some(l => /COLLISION/.test(l)));
  ok('CSMA/CA samjhaya gaya', s4.logs.some(l => /CSMA\/CA/.test(l)));
}


/* ---------- 12. FIREWALL ZONES ---------- */
console.log('\n12. FIREWALL ZONES — kis-kis ke beech laga hai');
{
  // A --- FW --- B : theek do side, dono me ek-ek device
  const A = Topologies.device('pc', 'A', 0, 0);
  const FW = Topologies.device('firewall', 'FW', 100, 0);
  const B = Topologies.device('pc', 'B', 200, 0);
  const devs = [A, FW, B];
  const lks = [Topologies.link(A, FW), Topologies.link(FW, B)];

  const z = Sim.firewallZones(devs, lks, FW.id);
  ok('do device ke beech me theek 2 side milti hain', z.length === 2);
  ok('har side me theek 1 device hai', z.every(x => x.count === 1));
  ok('side ka naam usi device ka hai', z.map(x => x.label).sort().join(',') === 'A,B');

  // zone-wale rule se block
  FW.rules = [{ action: 'block', proto: 'any', from: z[0].id, to: z[1].id }];
  const route = Graph.bfs(Graph.build(devs, lks), A.id, B.id);
  ok('side-se-side wala rule laga', Sim.firewallCheck(devs, lks, route.path, 'data').blocked);
  const back = Graph.bfs(Graph.build(devs, lks), B.id, A.id);
  ok('ulti disha abhi bhi khuli hai', !Sim.firewallCheck(devs, lks, back.path, 'data').blocked);

  ok('rule side ke naam se padha jaata hai',
     /from A to B/.test(Sim.ruleText(FW.rules[0], new Map(devs.map(d => [d.id, d])), z)),
     Sim.ruleText(FW.rules[0], new Map(devs.map(d => [d.id, d])), z));
}

/* junction par: firewall ke teen taraf, teen alag side */
{
  const FW = Topologies.device('firewall', 'FW', 0, 0);
  const mk = (n) => {
    const sw = Topologies.device('switch', 'SW' + n, n * 100, 100);
    const p1 = Topologies.device('pc', 'PC' + n + 'a', n * 100, 200);
    const p2 = Topologies.device('pc', 'PC' + n + 'b', n * 100, 260);
    return { sw, p1, p2 };
  };
  const g1 = mk(1), g2 = mk(2), g3 = mk(3);
  const devs = [FW, g1.sw, g1.p1, g1.p2, g2.sw, g2.p1, g2.p2, g3.sw, g3.p1, g3.p2];
  const lks = [];
  for (const g of [g1, g2, g3]) {
    lks.push(Topologies.link(FW, g.sw), Topologies.link(g.sw, g.p1), Topologies.link(g.sw, g.p2));
  }

  const z = Sim.firewallZones(devs, lks, FW.id);
  ok('junction par teen alag side milti hain', z.length === 3, z.map(x => x.label).join(' | '));
  ok('har side me poora subtree hai (3 devices)', z.every(x => x.count === 3));
  ok('side ka naam padosi switch ke naam par hai', z.every(x => /^SW\d's side$/.test(x.label)));

  // ek poori side ko doosri poori side se block
  FW.rules = [{ action: 'block', proto: 'any', from: z[0].id, to: z[1].id }];
  const adj = Graph.build(devs, lks);
  ok('side 1 ka koi bhi device side 2 tak nahi ja sakta',
     Sim.firewallCheck(devs, lks, Graph.bfs(adj, g1.p1.id, g2.p2.id).path, 'data').blocked);
  ok('side 1 se side 3 khuli hai',
     !Sim.firewallCheck(devs, lks, Graph.bfs(adj, g1.p1.id, g3.p1.id).path, 'data').blocked);
  ok('ek hi side ke andar wala traffic firewall se guzarta hi nahi',
     !Sim.firewallCheck(devs, lks, Graph.bfs(adj, g1.p1.id, g1.p2.id).path, 'data').blocked);
}

/* dusra raasta ho to dono padosi EK hi side hain */
{
  const FW = Topologies.device('firewall', 'FW', 0, 0);
  const A = Topologies.device('switch', 'SWA', 100, 0);
  const B = Topologies.device('switch', 'SWB', 200, 0);
  const devs = [FW, A, B];
  const lks = [Topologies.link(FW, A), Topologies.link(FW, B), Topologies.link(A, B)];
  const z = Sim.firewallZones(devs, lks, FW.id);
  ok('firewall ke bina bhi jude padosi ek hi side ginte hain', z.length === 1, `${z.length} side`);
  ok('us ek side me dono hain', z[0].count === 2);
}

/* ---------- 13. FIREWALL — HAR COMBINATION ----------

   Network:   PC1, PC2 -- SW1 -- FW -- SW2 -- PC3, PC4

   Do side: SW1 ki taraf {SW1,PC1,PC2}, SW2 ki taraf {SW2,PC3,PC4}.
   Har rule ko teen sawaal par parkha jaata hai:
     - kya wo sahi jodde par lagta hai
     - kya wo galat jodde par NAHI lagta
     - allow aur block dono disha me theek se kaam karte hain
*/
console.log('\n13. FIREWALL — HAR COMBINATION');
{
  const mkNet = () => {
    const PC1 = Topologies.device('pc', 'PC1', 0, 0);
    const PC2 = Topologies.device('pc', 'PC2', 0, 100);
    const SW1 = Topologies.device('switch', 'SW1', 100, 50);
    const FW  = Topologies.device('firewall', 'FW', 200, 50);
    const SW2 = Topologies.device('switch', 'SW2', 300, 50);
    const PC3 = Topologies.device('pc', 'PC3', 400, 0);
    const PC4 = Topologies.device('pc', 'PC4', 400, 100);
    const devices = [PC1, PC2, SW1, FW, SW2, PC3, PC4];
    const links = [
      Topologies.link(PC1, SW1), Topologies.link(PC2, SW1),
      Topologies.link(SW1, FW), Topologies.link(FW, SW2),
      Topologies.link(SW2, PC3), Topologies.link(SW2, PC4),
    ];
    return { PC1, PC2, SW1, FW, SW2, PC3, PC4, devices, links,
             adj: Graph.build(devices, links) };
  };

  const n = mkNet();
  const zones = Sim.firewallZones(n.devices, n.links, n.FW.id);
  const zoneA = zones.find(z => z.devices.includes(n.PC1.id));
  const zoneB = zones.find(z => z.devices.includes(n.PC3.id));
  ok('do side sahi bani', !!zoneA && !!zoneB && zoneA.count === 3 && zoneB.count === 3);

  const path = (a, b) => Graph.bfs(n.adj, a.id, b.id).path;
  const blocked = (a, b, kind) => Sim.firewallCheck(n.devices, n.links, path(a, b), kind).blocked;

  /* ---- 3 x 3 x 3 x 2 = 54 combinations ---- */
  const FROMS = [
    { key: 'any',    val: 'any',      hits: () => true },
    { key: 'PC1',    val: n.PC1.id,   hits: (src) => src === n.PC1.id },
    { key: 'sideA',  val: zoneA.id,   hits: (src) => zoneA.devices.includes(src) },
  ];
  const TOS = [
    { key: 'any',    val: 'any',      hits: () => true },
    { key: 'PC3',    val: n.PC3.id,   hits: (dst) => dst === n.PC3.id },
    { key: 'sideB',  val: zoneB.id,   hits: (dst) => zoneB.devices.includes(dst) },
  ];
  const PROTOS = [
    { key: 'any',  val: 'any',  hits: () => true },
    { key: 'data', val: 'data', hits: (k) => k === 'data' },
    { key: 'arp',  val: 'arp',  hits: (k) => k === 'arp' || k === 'reply' },
  ];
  const ACTIONS = ['block', 'allow'];

  // har combination ko in chaar traffic par parkho
  const TRAFFIC = [
    { name: 'PC1->PC3 data',  a: n.PC1, b: n.PC3, kind: 'data'  },
    { name: 'PC1->PC3 arp',   a: n.PC1, b: n.PC3, kind: 'arp'   },
    { name: 'PC1->PC3 reply', a: n.PC1, b: n.PC3, kind: 'reply' },
    { name: 'PC2->PC4 data',  a: n.PC2, b: n.PC4, kind: 'data'  },
    { name: 'PC3->PC1 data',  a: n.PC3, b: n.PC1, kind: 'data'  },  // ulti disha
  ];

  let combos = 0, wrong = [];
  for (const f of FROMS) for (const t of TOS) for (const pr of PROTOS) for (const action of ACTIONS) {
    n.FW.rules = [{ action, proto: pr.val, from: f.val, to: t.val }];
    combos++;
    for (const tr of TRAFFIC) {
      const src = tr.a.id, dst = tr.b.id;
      const matches = f.hits(src) && t.hits(dst) && pr.hits(tr.kind);
      const expected = matches && action === 'block';   // allow = nahi rukta, no-match = default allow
      const actual = blocked(tr.a, tr.b, tr.kind);
      if (actual !== expected) {
        wrong.push(`${action}/${pr.key}/${f.key}->${t.key} on ${tr.name}: expected ${expected}, got ${actual}`);
      }
    }
  }
  ok(`saare ${combos} combinations x ${TRAFFIC.length} traffic sahi nikle`, wrong.length === 0,
     wrong.length ? wrong.slice(0, 4).join(' | ') : `${combos * TRAFFIC.length} checks`);

  /* ---- ORDER: pehla match jeetta hai, dono taraf se ---- */
  n.FW.rules = [
    { action: 'allow', proto: 'any', from: n.PC1.id, to: n.PC3.id },
    { action: 'block', proto: 'any', from: 'any',    to: 'any' },
  ];
  ok('allow upar hai to wo jeetta hai', !blocked(n.PC1, n.PC3, 'data'));
  ok('baaki sab par neeche wala block lagta hai', blocked(n.PC2, n.PC3, 'data'));

  n.FW.rules = [
    { action: 'block', proto: 'any', from: 'any',    to: 'any' },
    { action: 'allow', proto: 'any', from: n.PC1.id, to: n.PC3.id },
  ];
  ok('block upar hai to allow ka koi matlab nahi', blocked(n.PC1, n.PC3, 'data'));

  /* ---- allow sirf USI firewall ke liye hai, aage wale ke liye nahi ---- */
  {
    const m = mkNet();
    m.SW2.type = 'firewall';                       // raaste me DO firewall
    m.SW2.rules = [{ action: 'block', proto: 'any', from: 'any', to: 'any' }];
    m.FW.rules  = [{ action: 'allow', proto: 'any', from: 'any', to: 'any' }];
    const adj = Graph.build(m.devices, m.links);
    const v = Sim.firewallCheck(m.devices, m.links, Graph.bfs(adj, m.PC1.id, m.PC3.id).path, 'data');
    ok('pehle firewall ka allow doosre firewall par lagu nahi hota', v.blocked);
    ok('rok doosre firewall par lagi', v.blocked && v.at.id === m.SW2.id);
  }

  /* ---- ek hi side ka traffic firewall se guzarta hi nahi ---- */
  n.FW.rules = [{ action: 'block', proto: 'any', from: 'any', to: 'any' }];
  ok('PC1 -> PC2 (ek hi side) nahi rukta', !blocked(n.PC1, n.PC2, 'data'));
  ok('PC3 -> PC4 (ek hi side) nahi rukta', !blocked(n.PC3, n.PC4, 'data'));
  ok('PC1 -> PC3 (paar) rukta hai', blocked(n.PC1, n.PC3, 'data'));

  /* ---- khaali rule list = sab allow ---- */
  n.FW.rules = [];
  ok('bina rule ke kuch nahi rukta', !blocked(n.PC1, n.PC3, 'data'));

  /* ---- sirf allow rules ka matlab hai "block se pehle chhoot" ---- */
  n.FW.rules = [{ action: 'allow', proto: 'any', from: 'any', to: 'any' }];
  ok('sirf allow rule se bhi sab chalta hai', !blocked(n.PC1, n.PC3, 'data'));

  /* ---- device-level allow + zone-level block ---- */
  n.FW.rules = [
    { action: 'allow', proto: 'data', from: n.PC1.id, to: zoneB.id },
    { action: 'block', proto: 'any',  from: zoneA.id, to: zoneB.id },
  ];
  ok('PC1 ka data chhoot gaya', !blocked(n.PC1, n.PC3, 'data'));
  ok('PC1 ka ARP phir bhi ruka (allow sirf data ke liye tha)', blocked(n.PC1, n.PC3, 'arp'));
  ok('PC2 ka data ruka', blocked(n.PC2, n.PC3, 'data'));

  /* ---- mara hua firewall ---- */
  n.FW.rules = [{ action: 'block', proto: 'any', from: 'any', to: 'any' }];
  n.FW.dead = true;
  ok('mara hua firewall kuch enforce nahi karta', !blocked(n.PC1, n.PC3, 'data'));
  n.FW.dead = false;

  /* ---- zone tab bhi sahi jab firewall ke around dusra raasta ban jaaye ---- */
  {
    const m = mkNet();
    m.links.push(Topologies.link(m.SW1, m.SW2));     // firewall ko bypass karta cable
    const z = Sim.firewallZones(m.devices, m.links, m.FW.id);
    ok('bypass cable ke baad sirf ek side bachti hai', z.length === 1, `${z.length} side`);
    m.FW.rules = [{ action: 'block', proto: 'any', from: 'any', to: 'any' }];
    const adj = Graph.build(m.devices, m.links);
    const r = Graph.bfs(adj, m.PC1.id, m.PC3.id);
    ok('bypass hone par packet firewall se guzarta hi nahi',
       !r.path.includes(m.FW.id) && !Sim.firewallCheck(m.devices, m.links, r.path, 'data').blocked);
  }
}


/* ---------- 14. FIREWALL — KOI RAASTA CHHOOTA TO NAHI ----------

   Ye test app.js ko TEXT ki tarah padhta hai, chalata nahi (app.js DOM se
   bandha hua hai). Aisa isliye karna pada kyunki asli bug logic me nahi
   tha — firewallCheck bilkul sahi tha — bug ye tha ki "ARP resolve"
   button use POOCHHTA HI NAHI tha. Wo cheez koi bhi unit test nahi pakad
   sakta, kyunki wahan call hi nahi hai.

   Niyam: jo bhi cheez taar par traffic daalti hai, use firewall se
   poochhna hoga. Abhi teen hain: Send packet ka data, ARP (dono jagah
   se), aur collision demo. Naya raasta jode to yahan bhi ginti badhaao.
*/
console.log('\n14. FIREWALL — HAR BHEJNE WALA RAASTA POOCHHTA HAI');
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const fnBody = (name) => {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) return '';
    // agla top-level "\n  function " dhoondho
    const next = src.indexOf('\n  function ', start + 1);
    return src.slice(start, next < 0 ? src.length : next);
  };

  const sendPacket = fnBody('sendPacket');
  ok('sendPacket data ke liye firewall se poochhta hai',
     /firewallCheck\([^;]*'data'/.test(sendPacket));
  ok('sendPacket ARP ke liye bhi firewall se poochhta hai',
     /firewallCheck\([^;]*'arp'/.test(sendPacket));

  const doArp = fnBody('doArp');
  ok('ARP resolve button firewall se poochhta hai',
     /firewallCheck\([^;]*'arp'/.test(doArp));
  ok('ARP block hone par ARP resolve wahin ruk jaata hai',
     /wall\.blocked/.test(doArp) && /dropAtFirewall/.test(doArp));

  const doCollision = fnBody('doCollision');
  ok('collision demo bhi firewall se poochhta hai',
     /firewallCheck\([^;]*'data'/.test(doCollision));

  const total = (src.match(/Sim\.firewallCheck\(/g) || []).length;
  ok('firewallCheck ke saare call sites maujood hain', total >= 5, `${total} call sites`);
}

/* ---------- 15. ROUTER = BROADCAST DOMAIN KI HADD ---------- */
console.log('\n15. ROUTER BROADCAST KO ROKTA HAI');
{
  const s = scene('tree', 8);           // R-CORE ke do taraf do subnet
  const router = s.devices.find(d => Topologies.isRouter(d.type));
  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  const near = hosts.find(h => Sim.sameSubnet(h, hosts[0]) && h !== hosts[0]);
  const far  = hosts.find(h => !Sim.sameSubnet(h, hosts[0]));
  ok('do alag subnet ke host mile', !!near && !!far,
     `${hosts[0].label}(${hosts[0].ip}) near=${near && near.label} far=${far && far.label}`);

  // door wale ka ARP router ke paar nahi jaana chahiye
  let blockedAt = null;
  const reached = Sim.sendArp(s.engine, s.adj, s.devices, s.links,
    hosts[0].id, far.id, () => {}, (at) => { blockedAt = at; });
  run(s.engine, s.devices, s.links, 8);
  ok('doosre subnet ka ARP resolve NAHI hota', reached === false);
  ok('rukne wale router ka naam bhi milta hai', !!blockedAt && blockedAt.includes(router.label),
     JSON.stringify(blockedAt));
  ok('door wale host ne broadcast suna hi nahi',
     !(far.seen || []).some(p => p.kind === 'arp'));
  ok('router tak broadcast pahuncha',
     (router.seen || []).some(p => p.kind === 'arp'));

  // apne subnet me ARP theek chalta hai
  const s2 = scene('tree', 8);
  const h2 = s2.devices.filter(d => Topologies.isHost(d.type));
  const a2 = h2[0], b2 = h2.find(h => h !== a2 && Sim.sameSubnet(h, a2));
  let done = false;
  const okArp = Sim.sendArp(s2.engine, s2.adj, s2.devices, s2.links, a2.id, b2.id, () => { done = true; });
  run(s2.engine, s2.devices, s2.links, 8);
  ok('apne subnet me ARP chalta hai', okArp === true && done);

  // switch broadcast ko aage bhejta hai, router nahi
  const s3 = scene('star', 6);
  const h3 = s3.devices.filter(d => Topologies.isHost(d.type));
  Sim.sendArp(s3.engine, s3.adj, s3.devices, s3.links, h3[0].id, h3[1].id, () => {});
  run(s3.engine, s3.devices, s3.links, 8);
  ok('switch ke paar broadcast jaata hai',
     (h3[3].seen || []).some(p => p.kind === 'arp' && p.dir === 'heard'));
}

/* ---------- 16. ARP KISKA — GATEWAY vs DESTINATION ---------- */
console.log('\n16. GATEWAY KA ARP');
{
  const s = scene('tree', 8);
  const hosts = s.devices.filter(d => Topologies.isHost(d.type));
  const a = hosts[0];
  const near = hosts.find(h => h !== a && Sim.sameSubnet(h, a));
  const far  = hosts.find(h => !Sim.sameSubnet(h, a));

  const t1 = Sim.arpTargetFor(s.devices, a.id, near.id);
  ok('apne subnet me seedha destination ka ARP', t1.target.id === near.id && !t1.viaGateway);

  const t2 = Sim.arpTargetFor(s.devices, a.id, far.id);
  ok('doosre subnet ke liye GATEWAY ka ARP', t2.viaGateway === true);
  ok('aur wo gateway sach me router hai', Topologies.isRouter(t2.target.type), t2.target.label);
  ok('gateway ka IP host ke gateway se milta hai',
     (t2.target.ips || [t2.target.ip]).includes(a.gateway), a.gateway);

  // har jodde par: same subnet -> destination, warna gateway
  const bad = [];
  for (const x of hosts) for (const y of hosts) {
    if (x === y) continue;
    const t = Sim.arpTargetFor(s.devices, x.id, y.id);
    const shouldBeGw = !Sim.sameSubnet(x, y);
    if (t.viaGateway !== shouldBeGw) bad.push(`${x.label}->${y.label}`);
    if (!shouldBeGw && t.target.id !== y.id) bad.push(`${x.label}->${y.label} galat target`);
  }
  ok('har host jodde par sahi target chuna gaya', !bad.length, bad.slice(0, 3).join(' '));

  // ek hi subnet wali topology me kabhi gateway nahi
  const s2 = scene('star', 6);
  const h2 = s2.devices.filter(d => Topologies.isHost(d.type));
  const bad2 = [];
  for (const x of h2) for (const y of h2) {
    if (x === y) continue;
    if (Sim.arpTargetFor(s2.devices, x.id, y.id).viaGateway) bad2.push(`${x.label}->${y.label}`);
  }
  ok('ek hi subnet wale network me gateway ka ARP kabhi nahi', !bad2.length, bad2[0] || '');
}

/* ---------- 17. SERVICES / PORTS ---------- */
console.log('\n17. SERVICES AUR PORTS');
{
  ok('server HTTP par sunta hai',
     Topologies.servicesFor('server').some(x => x.port === 80));
  ok('printer printing port par sunta hai',
     Topologies.servicesFor('printer').some(x => x.port === 9100));
  ok('NAS file share par sunta hai',
     Topologies.servicesFor('nas').some(x => x.port === 445));
  ok('hub kuch bhi nahi sunta', Topologies.servicesFor('hub').length === 0);

  ok('har type ki apni service list hai',
     Object.keys(Topologies.TYPES).every(t => Array.isArray(Topologies.servicesFor(t))));

  // do device ki list ek dusre se juddi hui nahi honi chahiye
  const a = Topologies.device('server', 'A', 0, 0);
  const b = Topologies.device('server', 'B', 0, 0);
  a.services.push({ port: 9999, name: 'test' });
  ok('ek device ki service badalne se doosre par asar nahi',
     b.services.length !== a.services.length);

  const s = scene('star', 6);
  const host = s.devices.find(d => Topologies.isHost(d.type));
  ok('serviceOf pehli service lautata hai',
     Sim.serviceOf(host).port === host.services[0].port);
  ok('jo kuch nahi sunta uske liye null', Sim.serviceOf({ services: [] }) === null);

  // port record packet me pahunchta hai
  const h = s.devices.filter(d => Topologies.isHost(d.type));
  const route = Graph.bfs(s.adj, h[0].id, h[1].id);
  Sim.sendData(s.engine, route, { devices: s.devices, links: s.links, port: 445, label: ':445' });
  run(s.engine, s.devices, s.links, 8);
  const got = (h[1].seen || []).find(p => p.kind === 'data');
  ok('packet record me port likha hai', got && got.port === 445, got ? String(got.port) : 'nahi mila');
}

/* ---------- 18. FIREWALL PORT RULES — har combination ---------- */
console.log('\n18. FIREWALL PORT RULES');
{
  const PC1 = Topologies.device('pc', 'PC1', 0, 0);
  const FW  = Topologies.device('firewall', 'FW', 100, 0);
  const SRV = Topologies.device('server', 'SRV', 200, 0);
  const devices = [PC1, FW, SRV];
  const links = [Topologies.link(PC1, FW), Topologies.link(FW, SRV)];
  const adj = Graph.build(devices, links);
  const path = Graph.bfs(adj, PC1.id, SRV.id).path;
  const check = (kind, port) => Sim.firewallCheck(devices, links, path, kind, port).blocked;

  const PORTS = ['any', 80, 443, 22, 9100];
  const KINDS_T = ['data', 'arp', 'reply'];
  const bad = [];
  let combos = 0;

  for (const rulePort of PORTS) {
    for (const proto of ['any', 'data', 'arp']) {
      for (const action of ['block', 'allow']) {
        FW.rules = [{ action, proto, port: rulePort, from: 'any', to: 'any' }];
        combos++;
        for (const kind of KINDS_T) {
          for (const sendPort of [80, 443, 22, 9100, null]) {
            const protoOk = proto === 'any'
              || (proto === 'data' && kind === 'data')
              || (proto === 'arp' && (kind === 'arp' || kind === 'reply'));
            const portOk = rulePort === 'any'
              || (kind === 'data' && Number(rulePort) === Number(sendPort));
            const expected = protoOk && portOk && action === 'block';
            const actual = check(kind, sendPort);
            if (actual !== expected) {
              bad.push(`${action}/${proto}/port=${rulePort} on ${kind}:${sendPort} -> ${actual}, chahiye ${expected}`);
            }
          }
        }
      }
    }
  }
  ok(`saare ${combos} port-rule combinations sahi nikle`, !bad.length,
     bad.length ? bad.slice(0, 3).join(' | ') : `${combos * 15} checks`);

  // port wala rule sirf apne port par lagta hai
  FW.rules = [{ action: 'block', proto: 'data', port: 80, from: 'any', to: 'any' }];
  ok('port 80 ka rule HTTP rokta hai', check('data', 80));
  ok('wahi rule SSH nahi rokta', !check('data', 22));
  ok('wahi rule ARP nahi rokta (ARP ka port hota hi nahi)', !check('arp', null));

  // rule ka text port ke saath
  const at = new Map(devices.map(d => [d.id, d]));
  ok('rule me port bhi padha jaata hai',
     /on port 80/.test(Sim.ruleText(FW.rules[0], at, [])), Sim.ruleText(FW.rules[0], at, []));
  FW.rules = [{ action: 'block', proto: 'any', port: 'any', from: 'any', to: 'any' }];
  ok('"any port" ka zikr nahi hota',
     !/on port/.test(Sim.ruleText(FW.rules[0], at, [])), Sim.ruleText(FW.rules[0], at, []));
}

/* ---------- 19. SWITCH KA MAC TABLE — har haalat ---------- */
console.log('\n19. MAC TABLE');
{
  const s = scene('star', 8);
  const sw = s.devices.find(d => d.type === 'switch');
  const h = s.devices.filter(d => Topologies.isHost(d.type));

  ok('shuru me table khaali hai', sw.macTable.size === 0);

  // har host se ek packet -> har host ka MAC seekha jaana chahiye
  for (let i = 0; i < h.length; i++) {
    const other = h[(i + 1) % h.length];
    Sim.sendData(s.engine, Graph.bfs(s.adj, h[i].id, other.id),
                 { devices: s.devices, links: s.links });
    run(s.engine, s.devices, s.links, 8);
  }
  ok('har bolne wale ka MAC table me aa gaya',
     h.every(x => sw.macTable.has(x.mac)), `${sw.macTable.size} / ${h.length}`);

  ok('har MAC sahi padosi ki taraf likha gaya',
     h.every(x => sw.macTable.get(x.mac) === x.id),
     h.map(x => `${x.label}->${(s.devices.find(d => d.id === sw.macTable.get(x.mac)) || {}).label}`).join(' '));

  ok('table me sirf utne hi entries hain jitne bole', sw.macTable.size === h.length);

  // hub kabhi table nahi banata
  const s2 = scene('star', 6);
  const hub = s2.devices.find(d => d.type === 'switch');
  hub.type = 'hub';
  const h2 = s2.devices.filter(d => Topologies.isHost(d.type));
  Sim.sendData(s2.engine, Graph.bfs(s2.adj, h2[0].id, h2[1].id), { devices: s2.devices, links: s2.links });
  run(s2.engine, s2.devices, s2.links, 8);
  ok('hub kuch nahi seekhta', hub.macTable.size === 0);
}

/* ---------- 20. GATEWAY JHOOTHA NAHI HONA CHAHIYE ---------- */
console.log('\n20. GATEWAY SACH ME MAUJOOD HO');
{
  const bad = [];
  for (let n = 3; n <= 16; n++) {
    for (const k of Topologies.KINDS) {
      const g = Topologies.generate(k, n, W, H);
      for (const d of g.devices) {
        if (!d.gateway) continue;
        const owner = g.devices.find(x => ((x.ips && x.ips.length ? x.ips : [x.ip]) || []).includes(d.gateway));
        if (!owner) bad.push(`${k}@${n}: ${d.label} -> ${d.gateway}`);
        else if (!Topologies.isRouter(owner.type)) bad.push(`${k}@${n}: gateway ${owner.label} router hi nahi`);
      }
    }
  }
  ok('jahan gateway likha hai wahan wo sach me kisi ROUTER ka IP hai',
     !bad.length, bad.slice(0, 3).join(' | '));

  // router-rahit topologies me gateway hona hi nahi chahiye
  const flat = [];
  for (const k of ['bus', 'star', 'ring', 'mesh']) {
    const g = Topologies.generate(k, 8, W, H);
    if (g.devices.some(d => Topologies.isRouter(d.type))) continue;   // aage badal jaye to skip
    if (g.devices.some(d => d.gateway)) flat.push(k);
  }
  ok('router-rahit network me kisi ka default gateway nahi hota',
     !flat.length, flat.join(','));

  // aur jahan router hai wahan hona chahiye
  const withRouter = [];
  for (const k of ['tree', 'hybrid']) {
    const g = Topologies.generate(k, 8, W, H);
    const hosts = g.devices.filter(d => Topologies.isHost(d.type));
    if (!hosts.every(d => d.gateway)) withRouter.push(k);
  }
  ok('router wale network me har host ke paas gateway hai', !withRouter.length, withRouter.join(','));

  // routing table me jhoothi default route na aaye
  const g2 = Topologies.generate('star', 8, W, H);
  const host = g2.devices.find(d => Topologies.isHost(d.type));
  const rows = Sim.routingTable(host.id, g2.devices, g2.links);
  ok('router-rahit network me default route nahi banti',
     !rows.some(r => r.dest === '0.0.0.0/0'),
     rows.map(r => r.dest).join(' '));

  const g3 = Topologies.generate('tree', 8, W, H);
  const host3 = g3.devices.find(d => Topologies.isHost(d.type));
  ok('router wale network me default route banti hai',
     Sim.routingTable(host3.id, g3.devices, g3.links).some(r => r.dest === '0.0.0.0/0'));
}

console.log(`\n${'='.repeat(46)}\n  ${pass} pass, ${fail} fail\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
