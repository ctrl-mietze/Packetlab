/* =========================================================
   advisor.js ke tests — browser ki zarurat nahi.

   Chalao:  node tests/advisor.test.js

   Yahan "har combination" ka matlab sach me har combination hai:
   4 criteria x 3 levels = 81 preference sets, aur har set ko kai device
   counts par chalaya jaata hai. Kul milaakar hazaaron recommendations.
   ========================================================= */
globalThis.Graph      = require('../js/graph.js');
globalThis.Render     = require('../js/render.js');
globalThis.Topologies = require('../js/topologies.js');
const Advisor = require('../js/advisor.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const KINDS = Topologies.KINDS;
const LEVELS = Advisor.LEVELS;
const COUNTS = [4, 5, 6, 8, 10, 12, 16, 20];

/* saare 81 preference combinations */
const ALL_PREFS = [];
for (const uptime of LEVELS) for (const speed of LEVELS)
  for (const cost of LEVELS) for (const growth of LEVELS)
    ALL_PREFS.push({ uptime, speed, cost, growth });

/* ---------- 1. NAAP SAHI HAIN? ---------- */
console.log('\n1. NAAP (measure)');
{
  for (const n of [6, 8, 12]) {
    const rows = Advisor.measureAll(n);
    ok(`n=${n}: chhe topologies naapi gayin`, rows.length === 6);
    ok(`n=${n}: har topology me n devices hain`,
       rows.every(r => r.devices >= n), rows.map(r => `${r.kind}:${r.devices}`).join(' '));
    ok(`n=${n}: koi bhi naap NaN nahi hai`,
       rows.every(r => Object.values(r).every(v => typeof v !== 'number' || Number.isFinite(v))));
  }

  const at8 = Object.fromEntries(Advisor.measureAll(8).map(r => [r.kind, r]));
  ok('MESH ka diameter 1 hai', at8.mesh.diameter === 1);
  ok('BUS ka diameter sabse zyada hai',
     at8.bus.diameter === Math.max(...KINDS.map(k => at8[k].diameter)));
  ok('MESH sabse zyada cable khaata hai',
     at8.mesh.links === Math.max(...KINDS.map(k => at8[k].links)));
  ok('MESH aur RING me koi SPOF nahi', at8.mesh.spofCount === 0 && at8.ring.spofCount === 0);
  ok('STAR me theek 1 SPOF hai (hub)', at8.star.spofCount === 1);

  ok('STAR me naya device 1 cable me juddta hai', at8.star.cablesPerNewDevice === 1);
  ok('MESH me naya device sabse mehnga padta hai',
     at8.mesh.cablesPerNewDevice === Math.max(...KINDS.map(k => at8[k].cablesPerNewDevice)),
     `mesh ${at8.mesh.cablesPerNewDevice} cables`);
  ok('RING me naya device 1 se zyada cable maangta hai', at8.ring.cablesPerNewDevice >= 1);
}

/* ---------- 2. NORMALISE ---------- */
console.log('\n2. NORMALISE');
{
  ok('zyada-achha wale me sabse bade ko 1 milta hai',
     Advisor.normalise([1, 5, 3], true).join(',') === '0,1,0.5');
  ok('kam-achha wale me sabse chhote ko 1 milta hai',
     Advisor.normalise([1, 5, 3], false).join(',') === '1,0,0.5');
  ok('sab barabar hon to sabko 1 milta hai',
     Advisor.normalise([7, 7, 7], true).join(',') === '1,1,1');
  ok('sab barabar, ulta paimana — phir bhi sabko 1',
     Advisor.normalise([7, 7, 7], false).join(',') === '1,1,1');
}

/* ---------- 3. HAR COMBINATION KI SEHAT ---------- */
console.log('\n3. HAR PREFERENCE COMBINATION (81 x device counts)');
{
  let runs = 0;
  const bad = { count: [], nan: [], range: [], sorted: [], missing: [], reasons: [] };

  for (const n of COUNTS) {
    for (const prefs of ALL_PREFS) {
      const r = Advisor.recommend(n, prefs);
      runs++;

      if (r.rows.length !== 6) bad.count.push(`n=${n} ${JSON.stringify(prefs)}`);
      if (r.rows.some(x => !Number.isFinite(x.score))) bad.nan.push(`n=${n} ${JSON.stringify(prefs)}`);
      if (r.rows.some(x => x.score < 0 || x.score > 100)) bad.range.push(`n=${n} ${JSON.stringify(prefs)}`);
      for (let i = 1; i < r.rows.length; i++) {
        if (r.rows[i - 1].score < r.rows[i].score) { bad.sorted.push(`n=${n} ${JSON.stringify(prefs)}`); break; }
      }
      const kinds = r.rows.map(x => x.kind).sort().join(',');
      if (kinds !== [...KINDS].sort().join(',')) bad.missing.push(`n=${n} ${JSON.stringify(prefs)}`);
      if (!r.reasons.length || r.reasons.some(x => /undefined|NaN/.test(x))) {
        bad.reasons.push(`n=${n} ${JSON.stringify(prefs)}`);
      }
    }
  }

  ok(`${runs} recommendations chalayi gayin`, runs === COUNTS.length * 81, `${COUNTS.length} counts x 81 prefs`);
  ok('har baar chhe ki chhe topologies aayin', !bad.count.length, bad.count[0] || '');
  ok('kabhi koi score NaN nahi hua', !bad.nan.length, bad.nan[0] || '');
  ok('har score 0 se 100 ke beech raha', !bad.range.length, bad.range[0] || '');
  ok('nateeja hamesha ghatte kram me aaya', !bad.sorted.length, bad.sorted[0] || '');
  ok('koi topology kabhi gaayab nahi hui', !bad.missing.length, bad.missing[0] || '');
  ok('wajah hamesha likhi gayi aur saaf thi', !bad.reasons.length, bad.reasons[0] || '');
}

/* ---------- 4. EK-EK PRIORITY: jawab wahi hona chahiye jo naap kehta hai ---------- */
console.log('\n4. AKELI PRIORITY KA JAWAB');
{
  const only = (c) => {
    const p = { uptime: 'low', speed: 'low', cost: 'low', growth: 'low' };
    p[c] = 'high';
    return p;
  };
  const bad = [];

  for (const n of COUNTS) {
    const rows = Advisor.measureAll(n);
    const checks = {
      uptime: { pick: r => r.resilience,                 hi: true  },
      speed:  { pick: r => r.avgHops,                    hi: false },
      cost:   { pick: r => r.cableMetres + r.gear * Advisor.GEAR_COST_METRES,  hi: false },
      growth: { pick: r => r.cablesPerNewDevice,         hi: false },
    };

    for (const c of Advisor.CRITERIA) {
      const { pick, hi } = checks[c];
      const vals = rows.map(pick);
      const target = hi ? Math.max(...vals) : Math.min(...vals);
      const win = Advisor.recommend(n, only(c)).winner;
      if (pick(rows.find(r => r.kind === win.kind)) !== target) {
        bad.push(`n=${n} ${c}: jeeta ${win.kind}`);
      }
    }
  }
  ok('sirf ek priority high ho to jeetne wala usi naap me sabse achha hai',
     !bad.length, bad.slice(0, 3).join(' | '));

  // seedhe-saade, samajh me aane wale nateeje
  const upt = Advisor.recommend(8, only('uptime')).winner.kind;
  ok('sirf uptime chahiye -> MESH ya RING', ['mesh', 'ring'].includes(upt), upt);
  const spd = Advisor.recommend(8, only('speed')).winner.kind;
  ok('sirf speed chahiye -> MESH', spd === 'mesh', spd);
  const cst = Advisor.recommend(8, only('cost')).winner.kind;
  ok('sirf sasta chahiye -> MESH kabhi nahi', cst !== 'mesh', cst);
  const grw = Advisor.recommend(8, only('growth')).winner.kind;
  ok('sirf badhna aasaan chahiye -> MESH kabhi nahi', grw !== 'mesh', grw);
}

/* ---------- 5. WEIGHT BADHAO TO NATEEJA USI DISHA ME JAAYE ---------- */
console.log('\n5. WEIGHT KA ASAR SAHI DISHA ME');
{
  /* uptime ka weight badhao to har topology ka score uske resilience ke
     hisaab se hi upar-neeche hona chahiye — jo sabse mazboot hai wo
     kabhi neeche nahi gir sakta. */
  const bad = [];
  for (const n of COUNTS) {
    const base = { uptime: 'low', speed: 'medium', cost: 'medium', growth: 'medium' };
    const rank = (prefs) => Object.fromEntries(
      Advisor.recommend(n, prefs).rows.map((r, i) => [r.kind, i]));

    const low  = rank({ ...base, uptime: 'low' });
    const high = rank({ ...base, uptime: 'high' });

    const rows = Object.fromEntries(Advisor.measureAll(n).map(r => [r.kind, r]));
    const strongest = KINDS.reduce((a, b) => rows[a].resilience >= rows[b].resilience ? a : b);
    if (high[strongest] > low[strongest]) {
      bad.push(`n=${n}: ${strongest} uptime badhane par ${low[strongest]} se ${high[strongest]} par gir gaya`);
    }
  }
  ok('uptime ka weight badhane par sabse mazboot topology kabhi neeche nahi girti',
     !bad.length, bad[0] || '');

  const bad2 = [];
  for (const n of COUNTS) {
    const base = { uptime: 'medium', speed: 'medium', cost: 'low', growth: 'medium' };
    const rank = (prefs) => Object.fromEntries(
      Advisor.recommend(n, prefs).rows.map((r, i) => [r.kind, i]));
    const rows = Object.fromEntries(Advisor.measureAll(n).map(r => [r.kind, r]));
    const priciest = KINDS.reduce((a, b) =>
      (rows[a].cableMetres + rows[a].gear * Advisor.GEAR_COST_METRES) >=
      (rows[b].cableMetres + rows[b].gear * Advisor.GEAR_COST_METRES) ? a : b);

    const low  = rank({ ...base, cost: 'low' });
    const high = rank({ ...base, cost: 'high' });
    if (high[priciest] < low[priciest]) {
      bad2.push(`n=${n}: ${priciest} sasta chahne par ${low[priciest]} se ${high[priciest]} par chadh gaya`);
    }
  }
  ok('cost ka weight badhane par sabse mehngi topology kabhi upar nahi chadhti',
     !bad2.length, bad2[0] || '');
}

/* ---------- 6. EK HI INPUT, EK HI JAWAB ---------- */
console.log('\n6. DOHRAANE PAR WAHI JAWAB');
{
  let same = true, ties = 0;
  for (const prefs of ALL_PREFS) {
    const a = Advisor.recommend(9, prefs);
    const b = Advisor.recommend(9, prefs);
    if (JSON.stringify(a.rows.map(r => [r.kind, r.score])) !==
        JSON.stringify(b.rows.map(r => [r.kind, r.score]))) same = false;
    // barabar score par kram naam se tay hota hai
    for (let i = 1; i < a.rows.length; i++) {
      if (a.rows[i - 1].score === a.rows[i].score) {
        ties++;
        if (a.rows[i - 1].kind.localeCompare(a.rows[i].kind) > 0) same = false;
      }
    }
  }
  ok('ek hi input do baar chalane par bilkul wahi jawab', same, `${ties} barabari ke jodde mile`);
}

/* ---------- 7. ANOKHE INPUT ---------- */
console.log('\n7. ANOKHE INPUT');
{
  const allLow = Advisor.recommend(8, { uptime: 'low', speed: 'low', cost: 'low', growth: 'low' });
  ok('sab kuch "low" chunne par bhi jawab aata hai (NaN nahi)',
     allLow.rows.every(r => Number.isFinite(r.score)) && allLow.usedFlatWeights);
  ok('sab "low" par sab barabar taule jaate hain',
     Object.values(allLow.weights).every(w => w === 0));

  const noPrefs = Advisor.recommend(8);
  ok('bina prefs ke bhi chalta hai (sab medium)', noPrefs.rows.length === 6 && !!noPrefs.winner);

  const junk = Advisor.recommend(8, { uptime: 'banana', speed: null, cost: 42, growth: undefined });
  ok('bekaar values medium maan li jaati hain',
     junk.rows.length === 6 && junk.rows.every(r => Number.isFinite(r.score)));

  const tiny = Advisor.recommend(3, { uptime: 'high', speed: 'high', cost: 'high', growth: 'high' });
  ok('3 device par bhi jawab milta hai', tiny.rows.length === 6 && !!tiny.winner);

  const big = Advisor.recommend(24, { uptime: 'high', speed: 'low', cost: 'high', growth: 'high' });
  ok('24 device par bhi jawab milta hai', big.rows.length === 6 && !!big.winner);
  ok('bade network me MESH sasta wala jawab nahi ban jaata', big.winner.kind !== 'mesh', big.winner.kind);
}

/* ---------- 8. JAWAB DEVICE COUNT KE SAATH BADALTA HAI ---------- */
console.log('\n8. DEVICE COUNT MAAYNE RAKHTA HAI');
{
  const prefs = { uptime: 'high', speed: 'high', cost: 'high', growth: 'high' };
  const winners = COUNTS.map(n => Advisor.recommend(n, prefs).winner.kind);
  ok('naap device count ke saath sach me badalte hain',
     new Set(COUNTS.map(n => Advisor.measure('mesh', n).links)).size === COUNTS.length);
  ok('har count par ek saaf jeetne wala milta hai',
     winners.every(Boolean), COUNTS.map((n, i) => `${n}:${winners[i]}`).join(' '));
}

/* ---------- 9. JO TOPOLOGY UTNI CHHOTI BAN HI NAHI SAKTI ---------- */
console.log('\n9. CHHOTE NETWORK KI SACHCHAI');
{
  const h3 = Advisor.measure('hybrid', 3);
  ok('hybrid 3 device me nahi banta — uska sabse chhota roop bada hai',
     h3.devices > 3, `${h3.devices} devices`);

  // aisa ho to jawab me ye baat saaf likhi honi chahiye
  const bad = [];
  for (const n of [3, 4]) {
    for (const prefs of ALL_PREFS) {
      const r = Advisor.recommend(n, prefs);
      if (r.winner.devices !== n && !r.reasons.some(x => /cannot be built with/.test(x))) {
        bad.push(`n=${n} winner=${r.winner.kind} par batai nahi gayi`);
      }
      if (r.winner.devices === n && r.reasons.some(x => /cannot be built with/.test(x))) {
        bad.push(`n=${n} ${r.winner.kind} par jhoothi line aayi`);
      }
    }
  }
  ok('chhote size par jawab batata hai ki wo utna chhota ban hi nahi sakta',
     !bad.length, bad[0] || '');

  const bad2 = [];
  for (const n of COUNTS) {
    for (const prefs of ALL_PREFS) {
      const r = Advisor.recommend(n, prefs);
      if (r.reasons.some(x => /cannot be built with/.test(x)) && r.winner.devices === n) {
        bad2.push(`n=${n} ${r.winner.kind}`);
      }
    }
  }
  ok('jahan zarurat nahi wahan ye line kabhi nahi aati', !bad2.length, bad2[0] || '');

  // har topology ka sabse chhota roop
  const mins = {};
  for (const k of KINDS) mins[k] = Advisor.measure(k, 3).devices;
  ok('sirf hybrid hi 3 se bada shuru hota hai',
     KINDS.filter(k => mins[k] > 3).join(',') === 'hybrid',
     KINDS.map(k => `${k}:${mins[k]}`).join(' '));
}

console.log(`\n${'='.repeat(46)}\n  ${pass} pass, ${fail} fail\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
