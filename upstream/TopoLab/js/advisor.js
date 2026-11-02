/* =========================================================
   TopoLab — advisor.js

   "Mere paas itne devices hain aur mujhe ye chahiye — kaunsi topology
   lagaun?" ka jawab.

   Yahan koi likha-likhaya jawab nahi hai. Har topology ko user ke asli
   device count par BANAYA jaata hai, uske asli numbers naape jaate hain
   (graph.js se), aur phir user ki priorities ke hisaab se score diya
   jaata hai. Device count badlo to jawab badal sakta hai — aur badalna
   hi chahiye, kyunki 5 device aur 30 device ka sahi jawab alag hai.

   graph.js ki tarah ye file bhi DOM se aazad hai, isliye poora engine
   Node me test ho jaata hai.

   Sections:
   1. Naapna (measure)      3. Score
   2. Normalise             4. Wajah (reasons)
   ========================================================= */

const Advisor = (() => {

  /* Ye chaar cheezein hi asal me network chunte waqt taulli jaati hain. */
  const CRITERIA = ['uptime', 'speed', 'cost', 'growth'];

  const CRITERIA_META = {
    uptime: { name: 'Staying up',  hint: 'Survives a device or cable failing' },
    speed:  { name: 'Speed',       hint: 'Fewer hops between any two devices' },
    cost:   { name: 'Cost',        hint: 'Less cable and less network gear' },
    growth: { name: 'Easy to grow', hint: 'Adding one more device stays cheap' },
  };

  /* User in teen me se chunta hai. 0 ka matlab "is cheez ki parwah nahi". */
  const WEIGHTS = { low: 0, medium: 1, high: 3 };
  const LEVELS  = ['low', 'medium', 'high'];

  /* Layout ke liye ek fix canvas maan lete hain. Cable ki lambai isi par
     nikalti hai, aur chunki SAARI topologies ka naap ek hi canvas par hota
     hai, aapas me tulna theek rehti hai. */
  const W = 1200, H = 700;

  /* ---------------------------------------------------------
     1. NAAPNA

     Har topology ko n devices par banao aur uske asli numbers lo.
     Kuch bhi anumaan nahi — sab kuch generator + graph engine se.
     --------------------------------------------------------- */
  /* Lambai ka paimana topologies.js se — poore app me ek hi paribhasha */
  function cableLength(devices, links) {
    const at = new Map(devices.map(d => [d.id, d]));
    let total = 0;
    for (const l of links) {
      const A = at.get(l.a), B = at.get(l.b);
      if (A && B) total += Topologies.metresBetween(A, B);
    }
    return total;
  }

  /* Ek switch/router ka daam kitne metre cable ke barabar maana jaaye.
     Ye ek maani hui baat hai, naapi hui nahi — par iske bina "cost" sirf
     cable ki lambai ban jaati aur mesh (jisme koi gear nahi hota) hamesha
     sasta lagta. 250 m isliye ki cable ke paimane se milta rahe: 8 devices
     ke star me cable ~400 m hota hai, to ek switch us kharche ka lagbhag
     aadha padta hai. */
  const GEAR_COST_METRES = 250;

  function measure(kind, n) {
    const g   = Topologies.generate(kind, n, W, H);
    const adj = Graph.build(g.devices, g.links);

    const stats = Graph.stats(adj);
    const res   = Graph.resilience(g.devices, g.links);

    /* Badhna kitna sasta hai? Anumaan nahi lagate — ek device zyada wali
       topology bana kar dekh lete hain ki kitne cable BADHE. Star me 1,
       ring me 2, mesh me n. */
    const bigger = Topologies.generate(kind, n + 1, W, H);
    const cablesPerNewDevice = bigger.links.length - g.links.length;

    const gear = g.devices.filter(d => !Topologies.isHost(d.type)).length;

    return {
      kind,
      devices: g.devices.length,
      links: g.links.length,
      gear,
      cableMetres: cableLength(g.devices, g.links),
      diameter: stats.diameter,
      avgHops: stats.avgHops,
      resilience: res.score,
      redundancyPct: res.redundancyPct,
      survivalPct: res.survivalPct,
      spofCount: Graph.findSPOF(adj).articulation.size,
      cablesPerNewDevice,
    };
  }

  function measureAll(n) {
    return Topologies.KINDS.map(k => measure(k, n));
  }

  /* ---------------------------------------------------------
     2. NORMALISE

     Har naap ko 0..1 me laate hain, usi set ke sabse achhe aur sabse
     bure ke beech. Isse alag-alag paimane (metre, hops, score) aapas me
     jodne layak ban jaate hain.

     Sab barabar hon to sabko 1 dete hain, 0 nahi — us haalat me koi
     bhi doosre se bura nahi hai, to sabko poore number milne chahiye.
     --------------------------------------------------------- */
  function normalise(values, higherIsBetter) {
    const min = Math.min(...values), max = Math.max(...values);
    if (max === min) return values.map(() => 1);
    return values.map(v => higherIsBetter
      ? (v - min) / (max - min)
      : (max - v) / (max - min));
  }

  /* Har criterion kis naap se banta hai, aur usme zyada achha hai ya kam */
  const AXES = {
    uptime: { pick: r => r.resilience,          higherIsBetter: true  },
    speed:  { pick: r => r.avgHops,             higherIsBetter: false },
    cost:   { pick: r => r.cableMetres + r.gear * GEAR_COST_METRES, higherIsBetter: false },
    growth: { pick: r => r.cablesPerNewDevice,  higherIsBetter: false },
  };

  /* ---------------------------------------------------------
     3. SCORE
     --------------------------------------------------------- */
  function weightOf(level) {
    return Object.prototype.hasOwnProperty.call(WEIGHTS, level) ? WEIGHTS[level] : WEIGHTS.medium;
  }

  /* prefs: { uptime: 'low'|'medium'|'high', speed: ..., cost: ..., growth: ... }
     Lautata hai har topology ka score aur uske peeche ki wajah, sabse
     achhe se sabse kam ke kram me. */
  function recommend(n, prefs = {}) {
    const rows = measureAll(n);

    // har axis par normalised value nikaal lo
    const per = {};
    for (const c of CRITERIA) {
      per[c] = normalise(rows.map(AXES[c].pick), AXES[c].higherIsBetter);
    }

    const weights = {};
    let totalWeight = 0;
    for (const c of CRITERIA) { weights[c] = weightOf(prefs[c]); totalWeight += weights[c]; }

    /* Sab kuch "low" chuna to koi paimana bacha hi nahi. Aise me sab
       barabar taulte hain — warna 0/0 aata aur poora score NaN ho jaata. */
    const flat = totalWeight === 0;

    const scored = rows.map((r, i) => {
      const parts = {};
      let sum = 0, wsum = 0;
      for (const c of CRITERIA) {
        const w = flat ? 1 : weights[c];
        parts[c] = per[c][i];
        sum  += per[c][i] * w;
        wsum += w;
      }
      return { ...r, parts, score: Math.round((sum / wsum) * 1000) / 10 };
    });

    /* Barabari par kram pakka rakhne ke liye kind ke naam se tie-break —
       warna ek hi input do baar chalane par jawab badal sakta tha. */
    scored.sort((a, b) => (b.score - a.score) || a.kind.localeCompare(b.kind));

    return {
      n,
      weights,
      usedFlatWeights: flat,
      rows: scored,
      winner: scored[0],
      reasons: reasonsFor(scored[0], scored, weights, flat, n),
    };
  }

  /* ---------------------------------------------------------
     4. WAJAH

     Jeetne wale ke baare me wahi baatein likhte hain jo NAAPI gayi hain,
     aur wahi jo user ne important boli hain. Har line ke saath asli
     number hota hai, taaki ye salah "kyunki aisa hi hota hai" jaisi na
     lage.
     --------------------------------------------------------- */
  function reasonsFor(win, rows, weights, flat, asked) {
    if (!win) return [];
    const name = k => Topologies.META[k].name;
    const out = [];
    const cares = c => flat || weights[c] > 0;

    const best = (pick, higherIsBetter) => {
      const vals = rows.map(pick);
      const target = higherIsBetter ? Math.max(...vals) : Math.min(...vals);
      return pick(win) === target;
    };

    if (cares('uptime')) {
      if (win.spofCount === 0) {
        out.push(`No single point of failure — every device has another way round, so one failure disconnects nobody.`);
      } else {
        out.push(`${win.spofCount} single point${win.spofCount === 1 ? '' : 's'} of failure; after the worst one, ${Math.round(win.survivalPct)}% of what is left stays connected.`);
      }
    }
    if (cares('speed')) {
      out.push(`Any two devices are at most ${win.diameter} hop${win.diameter === 1 ? '' : 's'} apart, ${win.avgHops.toFixed(2)} on average${best(r => r.avgHops, false) ? ' — the fastest of the six' : ''}.`);
    }
    if (cares('cost')) {
      out.push(`${win.links} cables, about ${Math.round(win.cableMetres)} m, plus ${win.gear} piece${win.gear === 1 ? '' : 's'} of network gear${best(r => r.cableMetres + r.gear * GEAR_COST_METRES, false) ? ' — the cheapest of the six once the gear is counted' : ''}.`);
    }
    if (cares('growth')) {
      out.push(`Adding one more device costs ${win.cablesPerNewDevice} extra cable${win.cablesPerNewDevice === 1 ? '' : 's'}${best(r => r.cablesPerNewDevice, false) ? ' — as cheap as growth gets here' : ''}.`);
    }

    /* Kuch topologies chhote number par ban hi nahi sakti — hybrid ko
       kam se kam ek router aur do switch chahiye. Aise me hum uska naap
       uske SABSE CHHOTE roop par lete hain. Ye baat chhupana beimaani
       hogi, kyunki phir user 3 maangta aur 5 device ka jawab milta. */
    if (asked !== undefined && win.devices !== asked) {
      out.push(`A ${name(win.kind).toLowerCase()} cannot be built with ${asked} devices — its smallest form needs ${win.devices}, and that is what these numbers describe.`);
    }

    const runnerUp = rows[1];
    if (runnerUp) {
      out.push(`Closest alternative is ${name(runnerUp.kind)} at ${runnerUp.score}, against ${name(win.kind)} at ${win.score}.`);
    }
    return out;
  }

  return { recommend, measure, measureAll, normalise,
           CRITERIA, CRITERIA_META, WEIGHTS, LEVELS, AXES, GEAR_COST_METRES };
})();

if (typeof module !== 'undefined') module.exports = Advisor;
