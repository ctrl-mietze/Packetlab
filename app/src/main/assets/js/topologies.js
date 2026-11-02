/* =========================================================
   TopoLab — topologies.js

   Har topology ke liye do cheezein banata hai:
     1. STRUCTURE — kaunsa device kis se juda hai (graph)
     2. LAYOUT    — har device screen par kahan baithega (x, y)

   Layout isliye yahan hai (renderer me nahi) kyunki har topology ka
   shape uski pehchaan hai — ring gol dikhna chahiye, tree seedha
   neeche girna chahiye, bus ek line par baithna chahiye.

   Sections:
   1. Meta (har topology ka intro)   4. Addressing (IP / MAC / subnet)
   2. Helpers                        5. Public API
   3. Generators (6 topologies)
   ========================================================= */

const Topologies = (() => {

  /* ---------------------------------------------------------
     1. META — UI aur compare mode dono yahi se text uthate hain
     --------------------------------------------------------- */
  const META = {
    bus: {
      name: 'Bus',
      icon: '⎯',
      blurb: 'Every device taps into one shared backbone cable.',
      realWorld: 'Old 10BASE-2 Ethernet; today, CAN bus in vehicles',
      pro: 'The least cable of any layout — the cheapest to wire',
      con: 'Cut the backbone anywhere and the network splits in two',
    },
    star: {
      name: 'Star',
      icon: '✳',
      blurb: 'Every device connects to one central switch.',
      realWorld: 'Every home and office LAN today — Ethernet plus a switch',
      pro: 'One device going down leaves the rest untouched',
      con: 'The switch dies and the whole network dies with it',
    },
    ring: {
      name: 'Ring',
      icon: '◯',
      blurb: 'Each device links to its two neighbours, closing a loop.',
      realWorld: 'Token Ring, FDDI, and today SONET and metro fibre rings',
      pro: 'Two routes between any pair — survives a single cut',
      con: 'Two cuts and the ring breaks into separate arcs',
    },
    mesh: {
      name: 'Mesh',
      icon: '✳',
      blurb: 'Every device connects directly to every other device.',
      realWorld: 'Internet backbone, data-centre spine, military links',
      pro: 'Almost unbreakable — alternate routes everywhere',
      con: 'n(n-1)/2 cables — cost and wiring blow up fast',
    },
    tree: {
      name: 'Tree',
      icon: '⑂',
      blurb: 'Router down to switches, switches down to devices, in layers.',
      realWorld: 'Campus and enterprise networks (core / distribution / access)',
      pro: 'Scales cleanly — just hang another branch off it',
      con: 'Lose a node up top and every branch beneath it is cut off',
    },
    hybrid: {
      name: 'Hybrid',
      icon: '❈',
      blurb: 'Several star clusters whose switches are linked in a ring.',
      realWorld: 'Real large companies — star on each floor, ring on the backbone',
      pro: 'The tidiness of star plus the backup path of a ring',
      con: 'Harder to design and harder to troubleshoot',
    },
  };

  const KINDS = Object.keys(META);

  /* ---------------------------------------------------------
     DEVICE TYPES

     Ek hi jagah se sab tय hota hai: label ka prefix, UI me dikhne wala
     naam, aur sabse zaroori — device network me karta kya hai:

       host   = end device (isko IP milta hai, ye traffic bhejta/leta hai)
       infra  = beech ka saamaan (switch/hub/AP) — management IP milta hai
       router = subnets ko jodta hai, har subnet me gateway banta hai,
                aur iski routing table banti hai

     Naya type add karna ho to bas yahan ek line jodo, phir render.js me
     uska icon bana do. Baaki sab apne aap kaam karta rahega.
     --------------------------------------------------------- */
  /* ports = us cheez me kitne network socket hote hain. Asli hardware
     me PC ke paas ek-do NIC hote hain aur switch 8/16/24/48 port ka
     aata hai — isiliye ye numbers itne alag hain. */
  /* services = ye device kaun se TCP port par sun raha hai.

     Ye sirf sajawat nahi hai: data packet destination ki pehli service
     par jaata hai, firewall rule kisi ek port ko rok sakta hai, aur jo
     device kuch sun hi nahi raha uspar bheja packet "connection refused"
     ho jaata hai — bilkul asli zindagi ki tarah. */
  const TYPES = {
    pc:       { prefix: 'PC',  name: 'PC',           role: 'host',   ports: 2,
                services: [{ port: 445, name: 'File sharing' }] },
    laptop:   { prefix: 'LT',  name: 'Laptop',       role: 'host',   ports: 2,
                services: [{ port: 445, name: 'File sharing' }] },
    server:   { prefix: 'SRV', name: 'Server',       role: 'host',   ports: 4,
                services: [{ port: 80, name: 'HTTP' }, { port: 443, name: 'HTTPS' },
                           { port: 22, name: 'SSH' }] },
    printer:  { prefix: 'PRN', name: 'Printer',      role: 'host',   ports: 2,
                services: [{ port: 9100, name: 'Raw printing' }, { port: 631, name: 'IPP' }] },
    nas:      { prefix: 'NAS', name: 'NAS',          role: 'host',   ports: 2,
                services: [{ port: 445, name: 'SMB file share' }, { port: 2049, name: 'NFS' }] },
    switch:   { prefix: 'SW',  name: 'Switch',       role: 'infra',  ports: 8,
                services: [{ port: 80, name: 'Web admin' }] },
    hub:      { prefix: 'HUB', name: 'Hub',          role: 'infra',  ports: 8,
                services: [] },
    ap:       { prefix: 'AP',  name: 'Access point', role: 'infra',  ports: 4,
                services: [{ port: 80, name: 'Web admin' }] },
    router:   { prefix: 'R',   name: 'Router',       role: 'router', ports: 4,
                services: [{ port: 80, name: 'Web admin' }, { port: 22, name: 'SSH' }] },
    firewall: { prefix: 'FW',  name: 'Firewall',     role: 'router', ports: 4,
                services: [{ port: 443, name: 'Admin console' }, { port: 22, name: 'SSH' }] },
  };

  // Additional network learning devices; preserve all original TopoLab types unchanged.
  Object.assign(TYPES, {
    phone: {prefix:'PH',name:'Smartphone',role:'host',ports:2,services:[{port:443,name:'HTTPS'}]},
    camera: {prefix:'CAM',name:'IP-Kamera',role:'host',ports:2,services:[{port:554,name:'RTSP'},{port:80,name:'Web UI'}]},
    iot: {prefix:'IOT',name:'IoT-Sensor',role:'host',ports:2,services:[{port:1883,name:'MQTT'}]},
    plc: {prefix:'PLC',name:'Industrie SPS',role:'host',ports:4,services:[{port:502,name:'Modbus TCP'}]},
    dns: {prefix:'DNS',name:'DNS-Server',role:'host',ports:4,services:[{port:53,name:'DNS'}]},
    dhcp: {prefix:'DHCP',name:'DHCP-Server',role:'host',ports:4,services:[{port:67,name:'DHCP'}]},
    modem: {prefix:'MODEM',name:'WAN-Modem',role:'router',ports:4,services:[]},
    loadbalancer: {prefix:'LB',name:'Load Balancer',role:'infra',ports:16,
      services:[{port:80,name:'HTTP'},{port:443,name:'HTTPS'}]},
    cloud: {prefix:'WAN',name:'Cloud / WAN',role:'router',ports:16,services:[{port:443,name:'Cloud HTTPS'}]},
  });

  Object.assign(TYPES,{
    vpn: {prefix:'VPN',name:'VPN Gateway',role:'router',ports:8,services:[{port:51820,name:'VPN Tunnel'}]},
    ids: {prefix:'IDS',name:'IDS / IPS',role:'infra',ports:8,services:[{port:443,name:'Security Console'}]},
    wlc: {prefix:'WLC',name:'WLAN Controller',role:'infra',ports:16,services:[{port:443,name:'Controller'}]},
    ntp: {prefix:'NTP',name:'NTP Server',role:'host',ports:4,services:[{port:123,name:'NTP'}]},
    mail: {prefix:'MAIL',name:'Mail Server',role:'host',ports:4,services:[{port:25,name:'SMTP'},{port:993,name:'IMAPS'}]},
    voip: {prefix:'VOIP',name:'VoIP Telefon',role:'host',ports:2,services:[{port:5060,name:'SIP'}]},
    hypervisor: {prefix:'HV',name:'Hypervisor',role:'host',ports:8,services:[{port:443,name:'Management'}]},
    database: {prefix:'DB',name:'Datenbank',role:'host',ports:4,services:[{port:5432,name:'PostgreSQL'}]}
  });

  const servicesFor = (type) => ((TYPES[type] || TYPES.pc).services || []).map(x => ({ ...x }));

  /* Hardware asli zindagi me ginti ke sizes me milta hai — 4-port switch
     hai, 5-port nahi. Jab preset ko kisi device par zyada cable chahiye
     (mesh me 8 devices matlab har device par 7 cable), to hum uske liye
     is ladder se agla bada size utha lete hain. */
  const PORT_LADDER = [1, 2, 4, 8, 16, 24, 48];
  const portsFor = (type) => (TYPES[type] || TYPES.pc).ports;

  function ladderUp(n) {
    for (const size of PORT_LADDER) if (size >= n) return size;
    return Math.ceil(n / 48) * 48;
  }

  /* Har device ko itne port do ki uske saare cable fit ho jaayein, par
     type ke default se kam kabhi nahi. */
  function fitPorts(devices, links) {
    const deg = new Map(devices.map(d => [d.id, 0]));
    for (const l of links) {
      deg.set(l.a, (deg.get(l.a) || 0) + 1);
      deg.set(l.b, (deg.get(l.b) || 0) + 1);
    }
    for (const d of devices) {
      d.ports = Math.max(portsFor(d.type), ladderUp(deg.get(d.id) || 0));
    }
    return devices;
  }

  const roleOf   = t => (TYPES[t] || TYPES.pc).role;
  const isRouter = t => roleOf(t) === 'router';
  const isHost   = t => roleOf(t) === 'host';

  /* SHARED MEDIUM — hub aur access point.

     Switch har port ko apna alag collision domain deta hai: wo frame ko
     poora padhta hai, buffer me rakhta hai, phir sirf sahi port par
     bhejta hai. Hub aisa kuch nahi karta — wo bas ek electrical repeater
     hai. Jo bhi ek port par aata hai, wo baaki SAB ports par nikal jaata
     hai, aur poora hub ek hi collision domain hota hai.

     Access point wahi cheez hawa me karta hai: ek channel, sab usi par.
     Farq sirf itna ki wire par CSMA/CD hota hai (takrao ke BAAD pata
     chalta hai) aur Wi-Fi par CSMA/CA (pehle sun kar takrao TAALA jaata
     hai, kyunki radio bhejte waqt sun nahi sakta). */
  const isSharedMedium = t => t === 'hub' || t === 'ap';
  const isWireless     = t => t === 'ap';

  /* ---------------------------------------------------------
     2. HELPERS
     --------------------------------------------------------- */
  let uid = 0;
  const nextId = (p) => `${p}${++uid}`;

  function device(type, label, x, y, extra = {}) {
    return {
      id: nextId('d'),
      type,                 // 'pc' | 'switch' | 'router' | 'server'
      label,
      x, y,                 // abhi kahan hai (animation ke liye badalta rehta hai)
      tx: x, ty: y,         // kahan pahunchna hai
      dead: false,
      subnet: 0,
      ports: (TYPES[type] || TYPES.pc).ports,
      arp: new Map(),       // ip -> mac (ARP resolve hone par bharta hai)
      seen: [],             // aakhri kuch packets jo yahan se guzre
      rules: [],            // sirf firewall istemaal karta hai
      services: servicesFor(type),
      macTable: new Map(),  // sirf switch bharta hai: mac -> kis padosi ki taraf
      ...extra,
    };
  }

  /* Cable ka cost = uski asli lambai. Lamba cable = zyada latency,
     isliye Dijkstra chhote cables wala raasta pasand karta hai.
     40px ≈ 1 unit rakha hai taaki numbers padhne me aasaan rahein. */
  function link(a, b, shape = 'line', extra = {}) {
    return { id: nextId('L'), a: a.id, b: b.id, dead: false, cost: 1, shape, ...extra };
  }

  /* Canvas ke pixel se metre ka paimana — POORE app me sirf yahi ek.

     Pehle ye do jagah alag-alag likha hua tha: yahan 4 px = 1 m, aur
     advisor/flow me 40 px = 1 m. Nateeja ye ki ek hi screen par
     "Cable used 2136 m" aur "Your layout 214 m" saath me dikh rahe the —
     ek hi cheez ke do jawab. Ab jise bhi lambai chahiye wo metresBetween()
     hi bulata hai. */
  const PX_PER_METRE = 4;

  const posOf = (d) => ({ x: d.tx !== undefined ? d.tx : d.x,
                          y: d.ty !== undefined ? d.ty : d.y });

  function metresBetween(a, b) {
    const A = posOf(a), B = posOf(b);
    return Math.hypot(A.x - B.x, A.y - B.y) / PX_PER_METRE;
  }

  function recost(devices, links) {
    const at = new Map(devices.map(d => [d.id, d]));
    for (const l of links) {
      const A = at.get(l.a), B = at.get(l.b);
      if (!A || !B) continue;
      /* cost Dijkstra ke liye hai — chhote, padhne layak numbers
         (10 m ka cable = cost 1), taaki latency ki tulna aasaan rahe. */
      l.cost = Math.max(1, Math.round(metresBetween(A, B) / 10));
      /* Bina round kiye rakhte hain. Pehle har cable alag-alag round hota
         tha aur phir jode jaate the, jisse "Cable used" aur analysis wala
         "Your layout" 2-3 metre alag aa jaate the. Ab round sirf dikhate
         waqt hota hai — ek hi baar, poore jod par. */
      l.metres = metresBetween(A, B);
    }
  }

  const ring_ = (i, n, cx, cy, r, startDeg = -90) => {
    const a = (startDeg + (360 / n) * i) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  /* Har device ke neeche uska naam aur IP likha jaata hai — mila ke
     lagbhag 100px chaudi patti. Do padosi devices ke centre isse kam
     door hue to text aapas me chipak jaata hai (16 devices par bilkul
     yahi ho raha tha).

     Layout ab canvas ke naap ka gulaam nahi hai: agar itni jagah chahiye
     to layout canvas se bada ban jaata hai, aur view use zoom out karke
     fit kar leta hai. Pehle hum ulta karte the — devices ko available
     jagah me thoos dete the, isliye labels ek doosre par chadh jaate the. */
  const MIN_GAP = 104;

  /* n cheezein ek circle par rakhni hain to radius kam se kam kitna ho */
  const ringRadius = (n, base) =>
    Math.max(base, (n * MIN_GAP) / (2 * Math.PI));

  /* ---------------------------------------------------------
     3. GENERATORS

     Har generator ko canvas ki width/height milti hai aur wo
     { devices, links } return karta hai.
     --------------------------------------------------------- */

  /* --- BUS: ek horizontal backbone, devices upar-neeche tap karte hain ---
     Cable ko hum consecutive devices ke beech ka segment maante hain.
     Isliye beech ka koi bhi segment kaato -> network exactly do tukde.
     Bilkul asli bus jaisa behaviour. */
  function bus(n, w, h) {
    const backboneY = h * 0.5;
    const margin = Math.min(120, w * 0.1);
    /* Devices baari-baari upar-neeche lagte hain, isliye ek hi kataar ke
       padosi 2 step door hote hain — aadhe se thoda zyada gap kaafi hai. */
    const step = Math.max(MIN_GAP * 0.62, n > 1 ? (w - margin * 2) / (n - 1) : 0);
    const startX = (w - step * (n - 1)) / 2;

    const devices = [];
    for (let i = 0; i < n; i++) {
      const x = startX + step * i;
      const y = backboneY + (i % 2 === 0 ? -96 : 96);
      const isServer = i === n - 1;
      devices.push(device(
        isServer ? 'server' : 'pc',
        isServer ? 'SRV-1' : `PC-${i + 1}`,
        x, y
      ));
    }

    const links = [];
    for (let i = 0; i < n - 1; i++) {
      links.push(link(devices[i], devices[i + 1], 'bus', { busY: backboneY }));
    }
    return { devices, links };
  }

  /* --- STAR: beech me switch, baaki uske around --- */
  function star(n, w, h) {
    const cx = w / 2, cy = h / 2;
    const r = ringRadius(Math.max(1, n - 1), Math.min(w, h) * 0.33);
    const spokes = Math.max(1, n - 1);

    const hub = device('switch', 'SW-1', cx, cy);
    const devices = [hub];
    for (let i = 0; i < spokes; i++) {
      const p = ring_(i, spokes, cx, cy, r);
      const isServer = i === spokes - 1;
      devices.push(device(
        isServer ? 'server' : 'pc',
        isServer ? 'SRV-1' : `PC-${i + 1}`,
        p.x, p.y
      ));
    }

    const links = devices.slice(1).map(d => link(hub, d));
    return { devices, links };
  }

  /* --- RING: circle, har device do padosiyon se juda --- */
  function ring(n, w, h) {
    const cx = w / 2, cy = h / 2;
    const r = ringRadius(n, Math.min(w, h) * 0.36);

    const devices = [];
    for (let i = 0; i < n; i++) {
      const p = ring_(i, n, cx, cy, r);
      const isServer = i === 0;
      devices.push(device(
        isServer ? 'server' : 'pc',
        isServer ? 'SRV-1' : `PC-${i}`,
        p.x, p.y
      ));
    }

    const links = [];
    for (let i = 0; i < n; i++) {
      links.push(link(devices[i], devices[(i + 1) % n]));   // aakhri wala pehle se judta hai — yahi ring band karta hai
    }
    return { devices, links };
  }

  /* --- MESH: har jodi ke beech cable. n(n-1)/2 cables banti hain --- */
  function mesh(n, w, h) {
    const cx = w / 2, cy = h / 2;
    const r = ringRadius(n, Math.min(w, h) * 0.37);

    const devices = [];
    for (let i = 0; i < n; i++) {
      const p = ring_(i, n, cx, cy, r);
      devices.push(device('router', `R-${i + 1}`, p.x, p.y));
    }

    const links = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) links.push(link(devices[i], devices[j]));
    }
    return { devices, links };
  }

  /* --- TREE: root router -> switches -> end devices ---
     Teen layer: core (router), distribution (switches), access (PCs).
     Har switch apna subnet banata hai — isliye routing table dilchasp
     ho jaati hai (router ko pata hona chahiye kaunsa subnet kis taraf). */
  function tree(n, w, h) {
    const rootY = h * 0.16, midY = h * 0.5, leafY = h * 0.84;
    const cx = w / 2;

    // kitne switches? har switch ke neeche ~3 devices achhe lagte hain
    const switchCount = Math.max(2, Math.min(4, Math.ceil((n - 1) / 4)));
    const leafCount = Math.max(0, n - 1 - switchCount);

    const root = device('router', 'R-CORE', cx, rootY);
    const devices = [root];
    const links = [];

    // leaves ko switches me baant do (round-robin)
    const buckets = Array.from({ length: switchCount }, () => []);
    for (let i = 0; i < leafCount; i++) buckets[i % switchCount].push(i);

    /* SAARE leaves ek hi kataar me baithte hain, har ek MIN_GAP door.
       Pehle har switch ko ek fixed 150px chaudi patti milti thi aur uske
       3 bachhe usi me thoos diye jaate the — 50px par, jabki label 100px
       ka hai. Isliye 16 devices par neeche ke naam ek doosre par chadh
       jaate the. Ab kataar ki chaudai bachhon ki ginti se banti hai, aur
       har switch apne bachhon ke beech me aa jaata hai. */
    const gapBetweenGroups = MIN_GAP * 0.6;      // alag switch ke bachhon ke beech thodi saans
    const rowWidth = leafCount * MIN_GAP + (switchCount - 1) * gapBetweenGroups;
    let penX = cx - rowWidth / 2;

    const switches = [];
    const leafRows = [];

    buckets.forEach((bucket, si) => {
      const groupStart = penX;
      bucket.forEach((_, k) => {
        leafRows.push({ si, k, x: penX + MIN_GAP / 2 });
        penX += MIN_GAP;
      });
      const groupEnd = penX;
      penX += gapBetweenGroups;

      // switch apne group ke theek beech me, aur agar bachhe nahi to bhi kahin to ho
      const swX = bucket.length ? (groupStart + groupEnd) / 2 : groupStart + MIN_GAP / 2;
      const sw = device('switch', `SW-${si + 1}`, swX, midY, { subnet: si + 1 });
      switches.push(sw);
      devices.push(sw);
      links.push(link(root, sw));
    });

    for (const { si, k, x } of leafRows) {
      const isServer = si === 0 && k === 0;
      const leaf = device(
        isServer ? 'server' : 'pc',
        isServer ? 'SRV-1' : `PC-${si + 1}${k + 1}`,
        x, leafY, { subnet: si + 1 }
      );
      devices.push(leaf);
      links.push(link(switches[si], leaf));
    }

    return { devices, links };
  }

  /* --- HYBRID: kai star clusters, aur switches aapas me ring me ---
     Yahi asli companies me hota hai: har floor pe star, aur floors ke
     switches ko ring me jod dete hain taaki ek cable kate to bhi
     traffic doosri taraf se ghoom ke nikal jaaye. */
  function hybrid(n, w, h) {
    const cx = w / 2, cy = h / 2;
    const clusterCount = n >= 10 ? 3 : 2;

    const core = device('router', 'R-CORE', cx, cy);
    const devices = [core];
    const links = [];

    const leafTotal = Math.max(clusterCount, n - 1 - clusterCount);
    const perCluster = Math.floor(leafTotal / clusterCount);
    const extra = leafTotal % clusterCount;

    /* Radii ko ginti se nikalte hain, canvas ke naap se nahi.

       leafR: bachhe switch ke bahar 120° ke arc me lagte hain. Us arc ki
       lambai = leafR × 2.094 rad. Usme (count-1) gaps aane hain, har gap
       MIN_GAP ka — isliye leafR utna bada hona chahiye.

       clusterR: do padosi clusters ke centre ki doori
       2·clusterR·sin(π/clusterCount) hoti hai. Wo kam se kam itni ho ki
       dono ke bachhe aapas me na takrayein.

       16 devices par purana fixed leafR (~105px) 5 bachhon ko 40px par
       bitha deta tha — wahi overlap tera screenshot me dikh raha tha. */
    const maxPerCluster = perCluster + (extra > 0 ? 1 : 0);
    const arcRad = 120 * Math.PI / 180;
    const leafR = Math.max(120, ((maxPerCluster - 1) * MIN_GAP) / arcRad);

    const minCentreGap = 2 * leafR + MIN_GAP;
    const clusterR = Math.max(
      Math.min(w, h) * 0.30,
      minCentreGap / (2 * Math.sin(Math.PI / clusterCount))
    );

    const switches = [];
    for (let c = 0; c < clusterCount; c++) {
      const p = ring_(c, clusterCount, cx, cy, clusterR);
      const sw = device('switch', `SW-${c + 1}`, p.x, p.y, { subnet: c + 1 });
      switches.push(sw);
      devices.push(sw);
      links.push(link(core, sw));                 // cluster -> core

      const count = perCluster + (c < extra ? 1 : 0);
      // leaves ko cluster ke bahar ki taraf arc me rakho (center se door)
      const outAngle = Math.atan2(p.y - cy, p.x - cx);
      for (let k = 0; k < count; k++) {
        const spreadDeg = 120;
        const t = count === 1 ? 0 : (k / (count - 1)) - 0.5;
        const a = outAngle + (t * spreadDeg * Math.PI / 180);
        const isServer = c === 0 && k === 0;
        const leaf = device(
          isServer ? 'server' : 'pc',
          isServer ? 'SRV-1' : `PC-${c + 1}${k + 1}`,
          p.x + leafR * Math.cos(a),
          p.y + leafR * Math.sin(a),
          { subnet: c + 1 }
        );
        devices.push(leaf);
        links.push(link(sw, leaf));
      }
    }

    // switches ka backup ring — hybrid ki asli taakat yahi hai
    if (clusterCount > 2) {
      for (let c = 0; c < clusterCount; c++) {
        links.push(link(switches[c], switches[(c + 1) % clusterCount], 'line', { backup: true }));
      }
    } else if (clusterCount === 2) {
      links.push(link(switches[0], switches[1], 'line', { backup: true }));
    }

    return { devices, links };
  }

  const BUILDERS = { bus, star, ring, mesh, tree, hybrid };

  /* ---------------------------------------------------------
     4. ADDRESSING — IP, MAC aur gateway

     Flat topologies (bus/star/ring/mesh) me sab ek hi subnet me hain:
       192.168.1.x
     Router waali topologies (tree/hybrid) me har switch apna subnet
     leke chalta hai:
       192.168.1.x, 192.168.2.x, ...
     aur router har subnet me .1 (gateway) hota hai.

     MAC device id se deterministic banate hain, taaki har render pe
     badle nahi (warna ARP table bakwaas lagegi).
     --------------------------------------------------------- */
  function macFor(id) {
    // chhota sa hash — crypto ki zarurat nahi, bas stable hona chahiye
    let hash = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    const bytes = [0x02];                       // 0x02 = locally administered
    for (let i = 0; i < 5; i++) bytes.push((hash >>> (i * 5)) & 0xff);
    return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  }

  function assignAddresses(devices) {
    const counters = new Map();                 // subnet -> agla host number

    for (const d of devices) {
      d.mac = macFor(d.id);
    }

    // routers har subnet me gateway hote hain
    const subnets = [...new Set(devices.map(d => d.subnet))].sort((a, b) => a - b);

    /* Gateway sirf tab jab network me sach me koi router ho.

       Pehle har host ko chupchaap 192.168.1.1 ka gateway de diya jaata
       tha — bus, star, ring aur mesh me, jahan koi router hota hi nahi.
       Wo IP kisi device ki thi hi nahi: inspector ek aisa gateway dikhata
       tha jo maujood nahi, aur routing table me "0.0.0.0/0 via 192.168.1.1"
       wali ek jhoothi default route aa jaati thi.

       Asli baat ye hai ki router-rahit flat LAN ka koi default gateway
       hota hi nahi — apne subnet ke bahar wo baat kar hi nahi sakta. */
    const hasRouter = devices.some(d => isRouter(d.type));

    for (const d of devices) {
      if (isRouter(d.type)) {
        // router/firewall har subnet me .1 rakhte hain
        d.ips = subnets.map(s => `192.168.${s === 0 ? 1 : s}.1`);
        d.ip = d.ips[0];
        d.isGateway = true;
      } else {
        const s = d.subnet === 0 ? 1 : d.subnet;
        const next = (counters.get(s) || 10) + 1;
        counters.set(s, next);
        d.ip = `192.168.${s}.${next}`;
        d.ips = [d.ip];
        if (hasRouter) d.gateway = `192.168.${s}.1`;
        else delete d.gateway;
        d.isGateway = false;
      }
    }
    return devices;
  }

  /* ---------------------------------------------------------
     5. PUBLIC API
     --------------------------------------------------------- */
  function generate(kind, n, w, h) {
    const build = BUILDERS[kind] || BUILDERS.star;
    const { devices, links } = build(Math.max(3, n), w, h);
    assignAddresses(devices);
    fitPorts(devices, links);
    recost(devices, links);
    return { devices, links, kind };
  }

  const isSwitch = t => t === 'switch';

  return { generate, recost, META, KINDS, TYPES, roleOf, isRouter, isHost,
           isSharedMedium, isWireless, isSwitch, servicesFor,
           metresBetween, PX_PER_METRE,
           macFor, device, link, fitPorts, portsFor, ladderUp, PORT_LADDER };
})();

if (typeof module !== 'undefined') module.exports = Topologies;
