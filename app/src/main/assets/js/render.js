/* =========================================================
   TopoLab — render.js

   Canvas par network draw karta hai. Ye file "sochti" kuch nahi —
   ise jo scene diya jaata hai wahi bana deti hai. Saara faisla
   (kaun SPOF hai, kaunsa path active hai) app.js pehle hi le chuka hota hai.

   Ek renderer instance ek canvas sambhalta hai. Compare mode do
   chhote renderer bana leta hai — isliye ye factory pattern me hai.

   Sections:
   1. Palette + geometry helpers   4. Devices
   2. Renderer factory / resize    5. Packets + overlays
   3. Links                        6. Hit testing (mouse -> device/link)
   ========================================================= */

const Render = (() => {

  /* ---------------------------------------------------------
     1. PALETTE + GEOMETRY
     --------------------------------------------------------- */
  const C = {
    grid:        'rgba(176,131,247,0.045)',
    link:        '#51405f',
    linkBus:     '#675476',
    bridge:      '#ffc57a',        // critical cable — kata to network toota
    active:      '#b79cff',        // abhi packet is raaste se ja raha hai
    dead:        '#ff6e92',
    node:        '#221a2c',
    nodeEdge:    '#775c89',
    nodeDeadBg:  '#321b29',
    spof:        '#ff6e92',
    text:        '#f6f0fc',
    muted:       '#ad9fb9',
    select:      '#d7b9ff',
    src:         '#6eeab9',
    dst:         '#f7aedb',
    island:      '#ff6e92',
  };

  /* Har device ka apna rang aur naap. r = hit-testing ka radius bhi hai. */
  const SHAPES = {
    pc:       { r: 20, accent: '#b48cf6' },
    laptop:   { r: 20, accent: '#b9b5ed' },
    server:   { r: 21, accent: '#65e1c0' },
    printer:  { r: 19, accent: '#cbd5e1' },
    nas:      { r: 20, accent: '#cdabfd' },
    switch:   { r: 23, accent: '#b595f0' },
    hub:      { r: 21, accent: '#ac9aae' },
    ap:       { r: 20, accent: '#b79cff' },
    router:   { r: 23, accent: '#d2a6fc' },
    firewall: { r: 22, accent: '#ff809d' },
  };

  /* ---------------------------------------------------------
     3D ICONS

     Har device ek chhota isometric-sa model hai. Poora 3D engine nahi —
     bas teen chehre (saamne, upar, dayein) alag-alag shade me. Aankh ko
     itna hi kaafi hai ki cheez uthi hui lage.

     Har icon ek 32×32 ke khaane me banta hai jiska center (0,0) par hai;
     draw karte waqt use device ke radius ke hisaab se scale kar dete hain.
     Naya device type add karna ho to yahan ek icon function likh do.
     --------------------------------------------------------- */

  /* hex rang ko halka (amt>0) ya gehra (amt<0) karo */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => amt >= 0
      ? Math.round(c + (255 - c) * amt)
      : Math.round(c * (1 + amt));
    return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  }

  /* Ek 3D dibba: saamne ka chehra, upar ka dhalaan, aur dayein ki side.
     dx/dy = gehrai ka offset (upar-dayein ki taraf jaata hai). */
  function box3d(ctx, x, y, w, h, dx, dy, base) {
    // dayein ki side (sabse gehri)
    ctx.fillStyle = shade(base, -0.42);
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + dx, y - dy);
    ctx.lineTo(x + w + dx, y + h - dy);
    ctx.lineTo(x + w, y + h);
    ctx.closePath(); ctx.fill();

    // upar ka chehra (sabse halka)
    ctx.fillStyle = shade(base, 0.30);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y - dy);
    ctx.lineTo(x + w + dx, y - dy);
    ctx.lineTo(x + w, y);
    ctx.closePath(); ctx.fill();

    // saamne ka chehra
    ctx.fillStyle = shade(base, -0.12);
    ctx.fillRect(x, y, w, h);
  }

  const ICONS = {
    /* Monitor + stand */
    pc(ctx, a) {
      box3d(ctx, -13, -12, 24, 16, 4, 4, a);
      ctx.fillStyle = shade(a, 0.55);                 // screen
      ctx.fillRect(-10.5, -9.5, 19, 11);
      ctx.fillStyle = shade(a, 0.8);                  // screen ki chamak
      ctx.beginPath(); ctx.moveTo(-10.5, 1.5); ctx.lineTo(-1, -9.5); ctx.lineTo(3, -9.5);
      ctx.lineTo(-6.5, 1.5); ctx.closePath(); ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = shade(a, -0.3);                 // stand
      ctx.fillRect(-2.5, 4, 5, 4);
      ctx.fillRect(-8, 8, 16, 2.5);
    },

    /* Khula hua laptop */
    laptop(ctx, a) {
      ctx.fillStyle = shade(a, -0.25);                // screen ka peechla hissa
      ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, -11); ctx.lineTo(9, 2); ctx.lineTo(-9, 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(a, 0.5);                  // screen
      ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, -9); ctx.lineTo(7.6, 0.4); ctx.lineTo(-7.6, 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(a, 0.15);                 // keyboard ka deck
      ctx.beginPath(); ctx.moveTo(-12.5, 3); ctx.lineTo(12.5, 3); ctx.lineTo(14.5, 8); ctx.lineTo(-14.5, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(a, -0.4);
      ctx.fillRect(-3, 5, 6, 1.4);                    // trackpad
    },

    /* Rack server — teen slot aur do LED */
    server(ctx, a) {
      box3d(ctx, -9, -13, 18, 25, 4, 4, a);
      ctx.fillStyle = shade(a, -0.45);
      for (let i = 0; i < 3; i++) ctx.fillRect(-6.5, -10 + i * 8, 13, 4.5);
      ctx.fillStyle = '#86efac';
      ctx.fillRect(4.5, -9, 1.6, 1.6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4.5, -1, 1.6, 1.6);
    },

    /* Printer — upar se kaagaz nikalta hua */
    printer(ctx, a) {
      ctx.fillStyle = '#e8edf7';                      // kaagaz
      ctx.fillRect(-7, -13, 14, 8);
      ctx.strokeStyle = '#b9c4da'; ctx.lineWidth = 0.7;
      ctx.strokeRect(-7, -13, 14, 8);
      box3d(ctx, -12, -5, 24, 13, 4, 4, a);
      ctx.fillStyle = shade(a, -0.5);
      ctx.fillRect(-8, -2.5, 16, 2);                  // output slot
      ctx.fillStyle = '#b79cff';
      ctx.fillRect(6, 2.5, 3, 2);                     // panel light
    },

    /* NAS — teen drive bay */
    nas(ctx, a) {
      box3d(ctx, -10, -11, 20, 22, 4, 4, a);
      ctx.fillStyle = shade(a, -0.45);
      for (let i = 0; i < 3; i++) ctx.fillRect(-7 + i * 5, -8, 3.4, 16);
      ctx.fillStyle = '#86efac';
      ctx.fillRect(-7, 9, 14, 1.2);
    },

    /* Switch — chaudi patli peti, saamne bahut saare port */
    switch(ctx, a) {
      box3d(ctx, -14, -5, 28, 11, 5, 5, a);
      ctx.fillStyle = shade(a, -0.5);
      for (let i = 0; i < 7; i++) ctx.fillRect(-12 + i * 3.5, -2.5, 2.2, 3);
      ctx.fillStyle = '#b79cff';
      for (let i = 0; i < 7; i += 2) ctx.fillRect(-12 + i * 3.5, 2, 2.2, 1.2);
    },

    /* Hub — switch jaisa par chhota aur pheeka (purana zamana) */
    hub(ctx, a) {
      box3d(ctx, -12, -4, 24, 9, 4, 4, a);
      ctx.fillStyle = shade(a, -0.5);
      for (let i = 0; i < 5; i++) ctx.fillRect(-10 + i * 4.2, -1.5, 2.6, 3);
    },

    /* Access point — gol puck aur upar signal ki laharein */
    ap(ctx, a) {
      ctx.strokeStyle = shade(a, 0.35); ctx.lineWidth = 1.5;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(0, -1, 4 + i * 4.5, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();
      }
      ctx.fillStyle = shade(a, -0.35);                // puck ki side
      ctx.beginPath(); ctx.ellipse(0, 5, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-12, 1, 24, 4);
      ctx.fillStyle = shade(a, 0.18);                 // puck ka upar
      ctx.beginPath(); ctx.ellipse(0, 1, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b79cff';
      ctx.beginPath(); ctx.arc(0, 1, 1.8, 0, Math.PI * 2); ctx.fill();
    },

    /* Router — patli peti aur do antenna */
    router(ctx, a) {
      ctx.strokeStyle = shade(a, -0.2); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-11, -13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -3); ctx.lineTo(11, -13); ctx.stroke();
      ctx.fillStyle = shade(a, 0.3);
      ctx.beginPath(); ctx.arc(-11, -13.5, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -13.5, 1.6, 0, Math.PI * 2); ctx.fill();
      box3d(ctx, -13, -3, 26, 10, 5, 5, a);
      ctx.fillStyle = '#b79cff';
      for (let i = 0; i < 3; i++) ctx.fillRect(-8 + i * 6, 1, 3, 1.6);
    },

    /* Firewall — eent ki deewar */
    firewall(ctx, a) {
      box3d(ctx, -11, -9, 22, 19, 4, 4, a);
      ctx.strokeStyle = shade(a, -0.55); ctx.lineWidth = 0.9;
      for (let row = 0; row < 4; row++) {
        const y = -6.5 + row * 4.2;
        ctx.beginPath(); ctx.moveTo(-11, y); ctx.lineTo(11, y); ctx.stroke();
        const off = row % 2 ? 0 : 3.6;
        for (let bx = -11 + off; bx < 11; bx += 7.2) {
          ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y + 4.2); ctx.stroke();
        }
      }
    },
  };

  // Additional device types use the same original isometric device vocabulary.
  Object.assign(SHAPES, {
    phone: {r:18,accent:'#b38deb'}, camera:{r:20,accent:'#cfb5f5'},
    iot:{r:17,accent:'#87d8c1'}, plc:{r:22,accent:'#80c4e5'},
    dns:{r:20,accent:'#b4a3f3'}, dhcp:{r:20,accent:'#a6e1d1'},
    modem:{r:22,accent:'#ddb4ff'}, loadbalancer:{r:23,accent:'#bda1f7'},
    cloud:{r:24,accent:'#cdb5ff'}
  });
  Object.assign(ICONS, {
    phone(ctx,a) {
      // Independent smartphone glyph: rounded frame, screen, status speaker.
      box3d(ctx,-8,-14,16,28,3,3,a);
      ctx.fillStyle=shade(a,-.68);ctx.fillRect(-6.5,-11.5,13,22.1);
      ctx.fillStyle=shade(a,.55);
      ctx.beginPath();ctx.roundRect(-5.7,-10.6,11.4,19.8,1.4);ctx.fill();
      ctx.fillStyle='#e7cbff';ctx.fillRect(-2.8,-12.3,5.6,1);
      ctx.fillStyle='#d1a4f6';ctx.beginPath();ctx.arc(0,11.2,.9,0,Math.PI*2);ctx.fill();
    },camera:ICONS.pc,iot:ICONS.ap,plc:ICONS.server,
    dns:ICONS.server,dhcp:ICONS.server,modem:ICONS.router,
    loadbalancer:ICONS.switch,cloud:ICONS.router
  });

  Object.assign(SHAPES,{
    vpn:{r:23,accent:'#b2a1e0'},ids:{r:23,accent:'#df8eaa'},
    wlc:{r:21,accent:'#80c6dc'},ntp:{r:20,accent:'#afaed4'},
    mail:{r:21,accent:'#a0cab3'},voip:{r:19,accent:'#a3b8d8'},
    hypervisor:{r:23,accent:'#95c4b8'},database:{r:23,accent:'#a9b3d2'}
  });
  Object.assign(ICONS,{
    vpn:ICONS.router,ids:ICONS.firewall,wlc:ICONS.ap,ntp:ICONS.server,
    mail:ICONS.server,voip:ICONS.laptop,hypervisor:ICONS.server,database:ICONS.nas
  });

  function drawIcon(ctx, type, r) {
    const shape = SHAPES[type] || SHAPES.pc;
    const icon = ICONS[type] || ICONS.pc;
    ctx.save();
    ctx.scale(r / 16, r / 16);          // icons 32×32 ke khaane me bane hain
    icon(ctx, shape.accent);
    ctx.restore();
  }

  /* Ek cable ke saare mod-points. Normal cable seedhi line hai,
     lekin BUS ka cable device se neeche backbone tak jaata hai,
     backbone par chalta hai, phir agle device tak upar. */
  function linkPoints(link, at) {
    const A = at.get(link.a), B = at.get(link.b);
    if (!A || !B) return [];

    if (link.shape === 'bus') {
      const y = link.busY;
      return [
        { x: A.x, y: A.y },
        { x: A.x, y },
        { x: B.x, y },
        { x: B.x, y: B.y },
      ];
    }
    return [{ x: A.x, y: A.y }, { x: B.x, y: B.y }];
  }

  /* Polyline par 0..1 ke beech ka point — packet animation isi se chalta hai */
  function pointAt(points, t) {
    if (points.length < 2) return points[0] || { x: 0, y: 0 };

    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      segs.push(len);
      total += len;
    }
    if (total === 0) return points[0];

    let want = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i] || i === segs.length - 1) {
        const f = segs[i] === 0 ? 0 : want / segs[i];
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * f,
          y: points[i].y + (points[i + 1].y - points[i].y) * f,
          angle: Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x),
        };
      }
      want -= segs[i];
    }
    return points[points.length - 1];
  }

  function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------------------------------------------------
     2. RENDERER FACTORY
     --------------------------------------------------------- */
  function create(canvas, opts = {}) {
    /* `let`, `const` nahi: PNG export thodi der ke liye ise ek doosre,
       bade canvas par mod deta hai aur `finally` me wapas rakh deta hai.
       Isse poora draw code jaisa ka waisa dobara istemaal ho jaata hai —
       warna har draw function me ctx ek parameter banake ghumana padta. */
    let ctx = canvas.getContext('2d');
    const mini = !!opts.mini;             // compare mode ke chhote canvas
    let W = 0, H = 0;

    /* VIEW TRANSFORM — world se screen
       Devices ke apne coordinates "world" me hain aur canvas ke size se
       aazad hain. Screen par kya dikhega wo ye teen numbers tय karte hain.
       Isi wajah se network canvas se bada ho sakta hai — hum bas zoom
       out kar dete hain, layout ko thoosna nahi padta. */
    let scale = 1, ox = 0, oy = 0;
    const MIN_ZOOM = 0.15, MAX_ZOOM = 2.5;
    const clampZoom = z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

    const getView = () => ({ scale, ox, oy });
    function setView(v) {
      if (typeof v.scale === 'number') scale = clampZoom(v.scale);
      if (typeof v.ox === 'number') ox = v.ox;
      if (typeof v.oy === 'number') oy = v.oy;
    }

    /* Screen ke kisi point ko pakad ke zoom karo — us point ke neeche ka
       world wahi rehta hai (wheel-zoom aur button-zoom dono isi se). */
    function zoomAt(factor, sx = W / 2, sy = H / 2) {
      const next = clampZoom(scale * factor);
      const k = next / scale;
      ox = sx - (sx - ox) * k;
      oy = sy - (sy - oy) * k;
      scale = next;
    }

    function panBy(dx, dy) { ox += dx; oy += dy; }

    /* Diye hue world box ko poore canvas me fit kar do */
    function fitTo(box, pad = 34) {
      const bw = Math.max(1, box.maxX - box.minX);
      const bh = Math.max(1, box.maxY - box.minY);
      scale = clampZoom(Math.min((W - pad * 2) / bw, (H - pad * 2) / bh));
      ox = (W - bw * scale) / 2 - box.minX * scale;
      oy = (H - bh * scale) / 2 - box.minY * scale;
    }

    /* Retina/HiDPI: canvas ko device pixels me bada banate hain aur
       CSS se wapas chhota dikhate hain, warna sab dhundhla lagta hai.

       Bitmap ka size hamesha asli CSS box ke barabar hona chahiye. Pehle
       yahan Math.max(320, ...) tha — chhote box par bitmap box se bada
       ban jaata tha aur browser use dabaa ke fit karta tha, jisse poori
       drawing squash ho jaati thi. Minimum size ab CSS sambhalti hai
       (min-height), yahan sirf 0 se bachna hai.

       syncSize har draw par chalta hai. Isse timing ka jhanjhat khatam:
       chahe layout kitni bhi der se settle ho, canvas agle frame me
       apne aap sahi size le leta hai. */
    function syncSize() {
      /* Box ki ASLI (fractional) height leni zaroori hai. clientHeight
         poornaank deta hai — 561.875 ka box 562 ban jaata tha, bitmap 562
         ke hisaab se banta tha, aur browser use 561.875 me thoos ke
         dikhata tha. Us halke se rescale ki wajah se kinare ki row
         resample hoti thi aur ek patli rangeen dhaari chhod jaati thi.

         Ab bitmap box par bilkul theek baithta hai (1 bitmap pixel = 1
         device pixel), aur transform bhi usi ratio se banta hai — browser
         ko kuch rescale karna hi nahi padta. */
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));

      if (bw === canvas.width && bh === canvas.height &&
          Math.abs(cssW - W) < 0.01 && Math.abs(cssH - H) < 0.01) return false;

      W = cssW; H = cssH;
      canvas.width = bw; canvas.height = bh;
      ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
      return true;                       // size badla — caller re-layout kar sakta hai
    }

    function resize() {
      W = H = 0;                         // force — taaki syncSize dobara naapе
      syncSize();
      return { w: W, h: H };
    }

    const size = () => ({ w: W, h: H });

    /* ---------- background ---------- */
    function drawBackground() {
      /* Clear DEVICE pixels me karo, CSS units me nahi.

         Pehle yahan clearRect(0,0,W,H) tha, jo maujooda transform se
         guzarta hai. Box ki height fractional hoti hai (jaise 561.875),
         isliye 0..H ka device-space me anuvaad aakhri bitmap row tak
         zara sa kam pad jaata tha. Wo ek row kabhi clear hoti hi nahi
         thi — jo bhi rang wahan ek baar draw ho gaya, wahi baitha reh
         jaata tha. Diagram hata dene par bhi patli rangeen dhaari bachi
         rehti thi, yahi uski jad thi.

         Identity transform par poora bitmap clear karna hamesha exact hai. */
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (mini) return;
      const gap = 34;
      ctx.fillStyle = C.grid;
      for (let x = gap; x < W; x += gap) {
        for (let y = gap; y < H; y += gap) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    /* ---------------------------------------------------------
       3. LINKS
       --------------------------------------------------------- */
    function drawLinks(scene, at, time) {
      const { links, spof, ui } = scene;

      for (const l of links) {
        const pts = linkPoints(l, at);
        if (pts.length < 2) continue;

        const isDead   = l.dead;
        const isBridge = spof.bridges.has(l.id) && !isDead;
        const isActive = ui.pathLinks.has(l.id) && !isDead;
        const isHover  = ui.hoverLink === l.id;
        // min-cut: wo cables jinhe kaat kar network do tukde ho jaayega
        const isCut    = ui.cutLinks && ui.cutLinks.has(l.id) && !isDead;
        // Dense mesh networks must stay legible. Hide unrelated cable clutter,
        // keep an inspected node's links and all active paths highlighted.
        const dense = links.length > 100 && !mini;
        const related = ui.selected && (l.a === ui.selected || l.b === ui.selected);

        ctx.save();
        if(dense && !related && !isActive && !isCut && !isHover) ctx.globalAlpha=0.26;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (isDead) {
          // kata hua cable — dhundhla aur toota hua
          ctx.strokeStyle = 'rgba(244,63,94,0.35)';
          ctx.lineWidth = mini ? 1.5 : 2;
          ctx.setLineDash([4, 8]);
        } else if (isCut) {
          /* Min-cut ko route se bhi upar rakha hai: jab user poochh raha
             hai "ise kaise toda jaaye", to jawab sabse pehle dikhna
             chahiye. Mota gulaabi, taaki bridge wale narangi se alag lage. */
          ctx.strokeStyle = '#f7aedb';
          ctx.lineWidth = mini ? 3 : 5;
          ctx.shadowColor = '#f7aedb';
          ctx.shadowBlur = mini ? 6 : 14;
          ctx.setLineDash([12, 5]);
        } else if (isActive) {
          ctx.strokeStyle = C.active;
          ctx.lineWidth = mini ? 2.5 : 4;
          ctx.shadowColor = C.active;
          ctx.shadowBlur = mini ? 6 : 16;
        } else if (isBridge) {
          // critical cable — halka pulse karta hai taaki nazar me aaye
          const pulse = 0.55 + 0.35 * Math.sin(time / 420);
          ctx.strokeStyle = `rgba(245,158,11,${mini ? 0.75 : pulse})`;
          ctx.lineWidth = mini ? 1.8 : 2.6;
          ctx.setLineDash([9, 6]);
        } else {
          const style = l.medium === 'fiber' ? '#87abb1' :
            l.medium === 'coax' ? '#9b8b73' :
            l.medium === 'tunnel' ? '#bda1e2' :
            l.medium === 'wifi' ? '#82a8d3' : (l.shape === 'bus' ? C.linkBus : C.link);
          ctx.strokeStyle = (isHover || (dense && related)) ? C.select : style;
          ctx.lineWidth = l.shape === 'bus' ? (mini ? 2.5 : 5) : (mini ? 1.5 : 2.4);
          if(l.medium === 'wifi' || l.medium === 'tunnel') ctx.setLineDash([5,7]);
        }

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();

        // kate hue cable par ✕ ka nishaan
        if (isDead && !mini) {
          const mid = pointAt(pts, 0.5);
          ctx.save();
          ctx.strokeStyle = C.dead;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(mid.x - 6, mid.y - 6); ctx.lineTo(mid.x + 6, mid.y + 6);
          ctx.moveTo(mid.x + 6, mid.y - 6); ctx.lineTo(mid.x - 6, mid.y + 6);
          ctx.stroke();
          ctx.restore();
        }
      }

      // cable kheenchte waqt ki preview line
      if (ui.linkPreview) {
        const { from, to } = ui.linkPreview;
        ctx.save();
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ---------------------------------------------------------
       4. DEVICES
       --------------------------------------------------------- */
    function drawDevices(scene, time) {
      const { devices, spof, ui, islandOf } = scene;

      for (const d of devices) {
        const shape = SHAPES[d.type] || SHAPES.pc;
        const r = mini ? shape.r * 0.62 : shape.r;
        const isSpof = spof.articulation.has(d.id) && !d.dead;
        const isPath = ui.pathDevices.has(d.id);
        const isSel  = ui.selected === d.id;
        const isHov  = ui.hoverDevice === d.id;
        // agar network toot gaya hai to chhote islands ko laal rang do
        const stranded = islandOf && islandOf.get(d.id) > 0 && !d.dead;

        ctx.save();

        /* --- SPOF ka pulsing halo --- */
        if (isSpof && !mini) {
          const pulse = 0.5 + 0.5 * Math.sin(time / 380);
          ctx.beginPath();
          ctx.arc(d.x, d.y, r + 8 + pulse * 7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(244,63,94,${0.10 + pulse * 0.13})`;
          ctx.fill();
        }

        /* --- active route ka glow --- */
        if (isPath && !d.dead) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r + 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34,211,238,0.16)';
          ctx.fill();
        }

        const bh = r * 1.9;              // label ko icon ke neeche rakhne ke liye

        /* --- zameen ki parchhai: icon ko utha hua dikhati hai --- */
        if (!mini) {
          ctx.beginPath();
          ctx.ellipse(d.x, d.y + r * 0.72, r * 0.72, r * 0.22, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.fill();
        }

        /* --- haalat ka ghera (select / hover / SPOF / stranded) ---
           Icon ke peeche rehta hai taaki model saaf dikhe. */
        const ringColour = isSel ? C.select
          : d.dead ? C.dead
          : isSpof ? C.spof
          : stranded ? 'rgba(244,63,94,0.55)'
          : isHov ? C.select
          : null;
        if (ringColour) {
          roundRect(ctx, d.x - r * 1.12, d.y - r * 1.05, r * 2.24, r * 2.1, mini ? 4 : 8);
          ctx.strokeStyle = ringColour;
          ctx.lineWidth = isSel ? 2.4 : 1.6;
          ctx.stroke();
        }

        /* --- asli 3D model --- */
        ctx.save();
        ctx.translate(d.x, d.y);
        if (d.dead) ctx.globalAlpha = 0.3;   // mara hua device pheeka pad jaata hai
        drawIcon(ctx, d.type, r);
        ctx.restore();

        /* --- mara hua device: bada ✕ --- */
        if (d.dead) {
          ctx.strokeStyle = C.dead;
          ctx.lineWidth = mini ? 1.6 : 2.4;
          const k = r * 0.8;
          ctx.beginPath();
          ctx.moveTo(d.x - k, d.y - k); ctx.lineTo(d.x + k, d.y + k);
          ctx.moveTo(d.x + k, d.y - k); ctx.lineTo(d.x - k, d.y + k);
          ctx.stroke();
        }

        /* --- label + IP --- */
        if (!mini) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = d.dead ? 'rgba(147,163,192,0.5)' : C.text;
          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.fillText(d.label, d.x, d.y + bh / 2 + 6);

          if (ui.showIps && d.ip) {
            ctx.fillStyle = C.muted;
            ctx.font = '500 9.5px "JetBrains Mono", monospace';
            ctx.fillText(d.ip, d.x, d.y + bh / 2 + 20);
          }
        }

        /* --- source / destination badges --- */
        if (!mini && (ui.src === d.id || ui.dst === d.id)) {
          const isSrc = ui.src === d.id;
          ctx.beginPath();
          ctx.arc(d.x + r + 2, d.y - r - 1, 8, 0, Math.PI * 2);
          ctx.fillStyle = isSrc ? C.src : C.dst;
          ctx.fill();
          ctx.fillStyle = '#0b1020';
          ctx.font = '700 9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isSrc ? 'S' : 'D', d.x + r + 2, d.y - r);
        }

        ctx.restore();
      }
    }

    /* ---------------------------------------------------------
       5. PACKETS + OVERLAYS
       --------------------------------------------------------- */
    function drawPackets(scene, at) {
      const { packets, links } = scene;
      if (!packets || !packets.length) return;
      const linkAt = new Map(links.map(l => [l.id, l]));

      for (const p of packets) {
        const l = linkAt.get(p.linkId);
        if (!l) continue;
        const pts = linkPoints(l, at);
        if (pts.length < 2) continue;

        // packet ulti disha me ja raha ho to t ko palat do
        const t = p.reverse ? 1 - p.t : p.t;
        const pos = pointAt(pts, t);
        const colour = p.colour || C.active;

        ctx.save();

        // peeche chhodta hua trail
        for (let k = 1; k <= 4; k++) {
          const tt = Math.max(0, Math.min(1, t - k * 0.035 * (p.reverse ? -1 : 1)));
          const tp = pointAt(pts, tt);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 5 - k * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = colour.replace(')', `,${0.20 - k * 0.04})`).replace('rgb', 'rgba');
          ctx.fill();
        }

        ctx.shadowColor = colour;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.big ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();

        if (p.label && !mini) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = C.text;
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(p.label, pos.x, pos.y - 9);
        }
        ctx.restore();
      }
    }

    /* Collision (CSMA/CD) ka dhamaka */
    function drawBlasts(scene) {
      for (const b of (scene.blasts || [])) {
        const k = 1 - b.life;                 // 0 -> 1
        ctx.save();
        ctx.strokeStyle = `rgba(245,158,11,${1 - k})`;
        ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6 + k * 44, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(245,158,11,${(1 - k) * 0.9})`;
        ctx.font = '700 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        if (k < 0.6) ctx.fillText('COLLISION', b.x, b.y - 18 - k * 20);
        ctx.restore();
      }
    }

    /* EDGE FADE

       Canvas ek khidki hai — zoom in karo ya network canvas se bada ho to
       content kinare par kat'ta hai. Bina kisi treatment ke wo cut ek
       patli rangeen line jaisa dikhta hai (jis rang ka device/cable wahan
       hai, usi rang ki line), jaise koi bug ho.

       Yahan hum kinare ke paas ka content dheere-dheere mita dete hain.
       'destination-out' se hum rang nahi potte — content ka alpha kam
       karte hain, isliye neeche page ka asli background jhalakta hai
       aur fade har theme me sahi lagta hai. */
    function fadeEdges() {
      const f = 20;

      /* from* = kinara (poora mitao), to* = andar ki taraf (kuch mat mitao).
         Dono points alag hone chahiye — barabar de do to gradient ki
         lambai zero ho jaati hai aur wo kuch paint hi nahi karta. */
      const erase = (rx, ry, rw, rh, fromX, fromY, toX, toY) => {
        const gr = ctx.createLinearGradient(fromX, fromY, toX, toY);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(rx, ry, rw, rh);
      };

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      erase(0, 0,     W, f,  0, 0,     0, f);        // upar
      erase(0, H - f, W, f,  0, H,     0, H - f);    // neeche
      erase(0, 0,     f, H,  0, 0,     f, 0);        // baayein
      erase(W - f, 0, f, H,  W, 0,     W - f, 0);    // dayein
      ctx.restore();
    }

    /* Mini canvas ke liye upar corner me topology ka naam */
    function drawMiniTitle(scene) {
      if (!mini || !scene.title) return;
      ctx.save();
      ctx.fillStyle = C.muted;
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(scene.title, 12, 10);
      ctx.restore();
    }

    /* ---------- main draw ----------
       Background aur mini-title screen space me rehte hain (grid zoom ke
       saath phailna nahi chahiye). Network world space me draw hota hai. */
    /* Sirf network — background, edge fade aur title ke bina. Isi hisse
       ko PNG export dobara istemaal karta hai. */
    function drawWorld(scene, time) {
      const at = new Map(scene.devices.map(d => [d.id, d]));
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      drawLinks(scene, at, time);
      drawMstOverlay(scene, at);
      drawPackets(scene, at);
      drawDevices(scene, time);
      drawBlasts(scene);
      ctx.restore();
    }

    function draw(scene, time) {
      syncSize();
      drawBackground();
      drawWorld(scene, time);
      if (!mini) fadeEdges();
      drawMiniTitle(scene);
    }

    /* ---------------------------------------------------------
       MST OVERLAY

       Sabse sasta jodne ka tareeka maujooda cables ke UPAR ek halki hari
       lakeer ki tarah dikhta hai. Ye sujhaav nahi hai — sirf paimana:
       "itne me kaam ho sakta tha". Isliye ye asli cables ko dhakta nahi,
       unke peeche-peeche chalta hai.
       --------------------------------------------------------- */
    function drawMstOverlay(scene, at) {
      const edges = scene.mstEdges;
      if (!edges || !edges.length) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(52,211,153,0.85)';
      ctx.lineWidth = mini ? 1.5 : 2.2;
      ctx.setLineDash([7, 5]);
      ctx.lineCap = 'round';
      for (const e of edges) {
        const A = at.get(e.a), B = at.get(e.b);
        if (!A || !B) continue;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------------------------------------------------------
       6. HIT TESTING — mouse ka point kis cheez par hai?
       --------------------------------------------------------- */
    /* Screen ka point -> world ka point. Baaki poora app world me sochta
       hai (device.x, device.y world hain), isliye mouse ko yahin badal
       dete hain — zoom/pan ke baad bhi clicks sahi jagah lagte hain. */
    function toScreen(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function toLocal(evt) {
      const s = toScreen(evt);
      return { x: (s.x - ox) / scale, y: (s.y - oy) / scale };
    }

    function hitDevice(devices, x, y) {
      // ulta ghoomte hain taaki upar draw hua device pehle mile
      const slack = 3 / scale;            // zoom out par bhi pakadna aasaan rahe
      for (let i = devices.length - 1; i >= 0; i--) {
        const d = devices[i];
        const r = (SHAPES[d.type] || SHAPES.pc).r;
        if (Math.abs(x - d.x) <= r + slack && Math.abs(y - d.y) <= r + slack) return d;
      }
      return null;
    }

    function hitLink(links, devices, x, y, tol = 8) {
      tol = tol / scale;                  // tolerance screen pixels me hi mehsoos ho
      const at = new Map(devices.map(d => [d.id, d]));
      let best = null, bestDist = tol;
      for (const l of links) {
        const pts = linkPoints(l, at);
        for (let i = 0; i < pts.length - 1; i++) {
          const dist = distToSegment(x, y, pts[i], pts[i + 1]);
          if (dist < bestDist) { bestDist = dist; best = l; }
        }
      }
      return best;
    }

    /* ---------------------------------------------------------
       DIAGRAM KO PNG BANANA

       Canvas ka apna toDataURL seedha kaam nahi aata: background
       transparent hai aur bitmap sirf utna bada hai jitni screen par
       jagah thi — zoom out kiya ho to tasveer bhi dhundhli aati.

       Isliye ek alag, bada canvas banate hain, usme thos background
       bharte hain, aur POORE network ko usme fit karke dobara draw
       karte hain. Screen par us waqt kya dikh raha tha, usse koi farak
       nahi padta.
       --------------------------------------------------------- */
    function toPNG(scene, opts = {}) {
      const pad = 70;
      const zoom = opts.scale || 2;                 // 2x, taaki text saaf rahe

      const ds = scene.devices;
      if (!ds.length) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const d of ds) {
        minX = Math.min(minX, d.x - 70); maxX = Math.max(maxX, d.x + 70);
        minY = Math.min(minY, d.y - 55); maxY = Math.max(maxY, d.y + 65);
      }
      const worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxY - minY);

      const out = document.createElement('canvas');
      out.width  = Math.round((worldW + pad * 2) * zoom);
      out.height = Math.round((worldH + pad * 2) * zoom);
      const octx = out.getContext('2d');

      octx.fillStyle = opts.background || '#0b1020';
      octx.fillRect(0, 0, out.width, out.height);

      /* Renderer module-level ctx/W/H/scale/ox/oy par chalta hai, isliye
         unhe thodi der ke liye is naye canvas par mod dete hain — aur
         finally me hamesha wapas rakh dete hain, chahe draw fail ho jaaye. */
      const sCtx = ctx, sW = W, sH = H, sScale = scale, sOx = ox, sOy = oy;
      ctx = octx; W = out.width; H = out.height;
      scale = zoom; ox = (-minX + pad) * zoom; oy = (-minY + pad) * zoom;

      try {
        drawWorld(scene, 0);
      } finally {
        ctx = sCtx; W = sW; H = sH; scale = sScale; ox = sOx; oy = sOy;
      }
      return out.toDataURL('image/png');
    }

    return { resize, syncSize, size, draw, toLocal, toScreen, hitDevice, hitLink,
             getView, setView, zoomAt, panBy, fitTo, toPNG, MIN_ZOOM, MAX_ZOOM };
  }

  return { create, linkPoints, pointAt, COLORS: C };
})();

if (typeof module !== 'undefined') module.exports = Render;
