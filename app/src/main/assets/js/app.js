/* =========================================================
   TopoLab — app.js

   Sab kuch yahan jud'ta hai: state rakhta hai, mouse sunta hai,
   analysis chalata hai, panels bharta hai, aur har frame renderer
   ko naya scene deta hai.

   Ek hi rule: STATE badla -> refresh() -> analysis + panels update.
   Draw loop alag chalta rahta hai aur hamesha latest state dikhata hai.

   Sections:
   1. State + DOM refs        5. Analysis + panels
   2. Build / regenerate      6. Inspector
   3. Draw loop               7. Compare mode
   4. Mouse + tools           8. Controls + init
   ========================================================= */

(() => {

  /* ---------------------------------------------------------
     1. STATE + DOM
     --------------------------------------------------------- */
  const $  = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const stage  = canvas.parentElement;

  const state = {
    kind: 'star',
    count: 8,
    devices: [],
    links: [],

    tool: 'select',            // select | add | link | chaos | delete
    addType: 'pc',

    selected: null,
    hoverDevice: null,
    hoverLink: null,
    src: null,
    dst: null,

    pathLinks: new Set(),      // abhi highlight ho raha route
    pathDevices: new Set(),
    cutLinks: new Set(),       // min-cut ke cable (Capacity dabane par)
    mstEdges: null,            // sabse sasta wiring (Cheapest wiring dabane par)
    linkPreview: null,
    dragging: null,
    panning: null,
    linkFrom: null,
    showIps: true,

    // analysis ke nateeje
    adj: new Map(),
    spof: { articulation: new Set(), bridges: new Set() },
    comps: [],
    islandOf: new Map(),
    res: null,
    stats: { diameter: 0, avgHops: 0, reachablePct: 100 },
  };

  const view   = Render.create(canvas);
  const engine = Sim.createEngine(log);

  /* ---------------------------------------------------------
     2. BUILD / REGENERATE
     --------------------------------------------------------- */
  function regenerate(kind = state.kind, count = state.count, { fly = true } = {}) {
    state.kind = kind;
    state.count = count;
    syncTopoUi();               // chips aur phone ka button, dono state se

    const { w, h } = view.size();
    const gen = Topologies.generate(kind, count, w, h);

    state.devices = gen.devices;
    state.links = gen.links;

    // naye devices center se udd ke apni jagah par jaate hain
    if (fly) {
      for (const d of state.devices) {
        d.x = w / 2 + (Math.random() - 0.5) * 40;
        d.y = h / 2 + (Math.random() - 0.5) * 40;
      }
    }

    state.selected = null;
    state.linkFrom = null;
    clearOverlays();           // purana min-cut / MST naye network par bemaani hai
    closeCtx();
    clearRoute();
    engine.clear();

    pickDefaultEndpoints();
    fitView();                 // naya layout poora dikhe, chahe canvas se bada ho
    refresh();
    log(`${Topologies.META[kind].name} topology — ${state.devices.length} devices, ${state.links.length} cables`, 'good');
  }

  /* src/dst me aise do devices chunte hain jo ek doosre se sabse door hon —
     tabhi route dilchasp dikhta hai */
  function pickDefaultEndpoints() {
    const hosts = state.devices.filter(d => Topologies.isHost(d.type));
    const pool = hosts.length >= 2 ? hosts : state.devices;
    if (pool.length < 2) { state.src = state.dst = null; return; }

    const adj = Graph.build(state.devices, state.links);
    let best = { a: pool[0].id, b: pool[1].id, hops: -1 };
    for (const a of pool) {
      for (const b of pool) {
        if (a.id === b.id) continue;
        const r = Graph.bfs(adj, a.id, b.id);
        if (r && r.hops > best.hops) best = { a: a.id, b: b.id, hops: r.hops };
      }
    }
    state.src = best.a;
    state.dst = best.b;
  }

  function clearRoute() {
    state.pathLinks.clear();
    state.pathDevices.clear();
  }

  /* ---------------------------------------------------------
     VIEW — zoom / pan / fit

     Layout ab canvas ke naap se aazad hai (16 devices ka tree canvas se
     chauda ban sakta hai). Isliye "sab dikh raha hai ya nahi" ab layout
     ki nahi, VIEW ki zimmedari hai.
     --------------------------------------------------------- */
  let userMovedView = false;      // user ne khud zoom/pan kiya? phir auto-fit mat karo

  /* Saare devices ka world box, unke labels ki jagah samet. Label device
     ke neeche aur dono taraf failta hai, isliye padding barabar nahi hai. */
  function boundsOf(devices, pad = { x: 56, top: 34, bottom: 52 }) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of devices) {
      if (d.tx < minX) minX = d.tx;
      if (d.tx > maxX) maxX = d.tx;
      if (d.ty < minY) minY = d.ty;
      if (d.ty > maxY) maxY = d.ty;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      minX: minX - pad.x, maxX: maxX + pad.x,
      minY: minY - pad.top, maxY: maxY + pad.bottom,
    };
  }

  function fitView() {
    if (!state.devices.length) return;
    view.fitTo(boundsOf(state.devices));
    userMovedView = false;
    syncZoom();
  }

  /* Zoom badalne par label ka text aur IP dikhana/chhupana dono update */
  function syncZoom() {
    const { scale } = view.getView();
    $('zoomLevel').textContent = `${Math.round(scale * 100)}%`;
    /* Zoom out par IP ki 9.5px lines dhabbe ban jaati hain aur ek doosre
       me ghus jaati hain — utni chhoti par unka koi fayda bhi nahi. */
    state.showIps = scale >= 0.62;
  }

  function nudgeZoom(factor) {
    view.zoomAt(factor);
    userMovedView = true;
    syncZoom();
    renderScene(performance.now());
  }

  /* ---------------------------------------------------------
     3. DRAW LOOP
     --------------------------------------------------------- */
  let lastTime = performance.now();
  let lastSeenCount = -1;   // chune hue device ke packet-record ki ginti

  /* Draw ko alag rakha hai taaki ise rAF ke bahar se bhi bulaya ja sake.
     rAF chhupe hue tab me, battery saver me, ya reduced-motion setting par
     ruk sakta hai — tab canvas khaali reh jaata. Har state change ke baad
     ek baar seedha draw kar dene se aisa kabhi nahi hoga. */
  function renderScene(now) {
    /* Doosra pehra: agar canvas ka size kisi bhi wajah se badla hai to
       view ko turant dobara fit karo. ResizeObserver ab sahi element par
       hai, par ye check har frame par muft me chal jaata hai aur pakka
       kar deta hai ki diagram kabhi canvas se bahar na nikle. */
    if (view.syncSize() && !userMovedView) fitView();

    /* Devices apni jagah par lerp hoke jaate hain, aur wo lerp frame() me
       chalta hai. Agar rAF ruka hua hai to lerp kabhi hota hi nahi aur sab
       apni shuruaati jagah (center) par dher lage reh jaate hain. Aisi
       soorat me animation chhodo, seedha manzil par bitha do. */
    if (document.hidden) {
      for (const d of state.devices) { d.x = d.tx; d.y = d.ty; }
    }

    view.draw({
      devices: state.devices,
      links: state.links,
      spof: state.spof,
      islandOf: state.islandOf,
      packets: engine.packets(state.devices, state.links),
      blasts: engine.blasts,
      mstEdges: state.mstEdges,
      ui: {
        hoverDevice: state.hoverDevice,
        hoverLink: state.hoverLink,
        selected: state.selected,
        src: state.src,
        dst: state.dst,
        pathLinks: state.pathLinks,
        pathDevices: state.pathDevices,
        cutLinks: state.cutLinks,
        linkPreview: state.linkPreview,
        showIps: state.showIps,
      },
    }, now);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // layout animation — har device apne target ki taraf khisakta hai
    for (const d of state.devices) {
      const k = Math.min(1, dt * 9);
      d.x += (d.tx - d.x) * k;
      d.y += (d.ty - d.y) * k;
    }

    engine.update(dt, state.devices, state.links);

    /* Inspector static HTML hai. Chune hue device par naya packet aate hi
       use dobara likh dete hain, warna "Recent packets" tab tak purana
       dikhta rehta hai jab tak user kahin aur click na kare. */
    const sel = state.devices.find(d => d.id === state.selected);
    const seenNow = sel ? (sel.seen || []).length : -1;
    if (seenNow !== lastSeenCount) { lastSeenCount = seenNow; renderInspector(); }

    renderScene(now);

    if (compareOpen) {
      /* Safety net: compare khula hai par scene bana hi nahi — chahe jis
         wajah se (build fail, purana cached script, ajeeb timing) — to
         yahan bana do. Isse overlay kabhi khaali nahi reh sakta. */
      if (!cmpA || !cmpB) buildCompare();
      else drawCompare(now);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------
     4. POINTER (mouse + ungli) + TOOLS

     Ye saare handlers pehle mousedown/mousemove/mouseup par the, isliye
     phone aur tablet par canvas bilkul bekaar tha — ungli se na device
     khisakta tha, na pan hota tha, na kuch chunta tha.

     Ab Pointer Events par hain. Ek hi handler mouse, ungli aur pen
     teeno sambhal leta hai, kyunki PointerEvent me clientX/clientY aur
     button wahi hain jo MouseEvent me the — baaki poora code jaisa ka
     waisa chalta hai.

     Ungli ke liye teen cheezein alag se chahiye thi:
       - do ungliyon se pinch zoom
       - der tak dabaye rakhna = right-click wala menu
       - setPointerCapture, taaki ungli canvas se bahar nikal jaaye to
         bhi drag chalta rahe
     Aur CSS me canvas par `touch-action: none`, warna browser khud hi
     page scroll/zoom kar leta hai aur hamare paas event aata hi nahi.
     --------------------------------------------------------- */
  const pointers = new Map();        // pointerId -> { x, y } (client coords)
  let pinch = null;                  // { dist, cx, cy }
  /* { timer, x, y } — x/y wo jagah hai JAHAN ungli TIKI thi.
     Ye alag rakhna zaroori hai: pointers map har move par update ho
     jaata hai, to usse doori naapoge to hamesha 0 milegi aur hilte
     hue bhi menu khul jaayega. */
  let longPress = null;

  /* toLocal/toScreen sirf clientX/clientY padhte hain, isliye pinch ke
     beech-bindu ke liye ek nakli event bana dena kaafi hai. */
  const at = (cx, cy) => ({ clientX: cx, clientY: cy });

  const pinchState = () => {
    const pts = [...pointers.values()];
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return { dist: Math.hypot(dx, dy) || 1,
             cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
  };

  const cancelLongPress = () => { if (longPress) { clearTimeout(longPress.timer); longPress = null; } };

  /* Ek ungli ka drag/pan/link sab rok do — do ungliyaan aate hi zoom
     shuru ho jaata hai aur beech ka device khisak jaana galat lagta hai. */
  function abandonSinglePointerGesture() {
    state.panning = null;
    state.dragging = null;
    state.pendingPlacement = null;
    state.linkFrom = null;
    state.linkPreview = null;
    cancelLongPress();
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {        // doosri ungli aayi -> pinch
      abandonSinglePointerGesture();
      pinch = pinchState();
      closeCtx();
      return;
    }
    if (pointers.size > 2) return;

    // right-click sirf menu kholta hai — wo pointerdown bhi bhejta hai,
    // isliye yahan rok do warna pan/add/kill sab chal padte hain
    if (e.button === 2) return;
    closeCtx();

    /* Ungli canvas se bahar chali jaaye to bhi drag chalta rahe */
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }

    /* Ungli se der tak dabao = right-click wala menu. Hilne par cancel,
       kyunki tab wo drag hai. */
    if (e.pointerType === 'touch') {
      const startX = e.clientX, startY = e.clientY;
      longPress = { x: startX, y: startY, timer: setTimeout(() => {
        longPress = null;
        abandonSinglePointerGesture();
        const local=view.toLocal({clientX:startX,clientY:startY});
        const device=view.hitDevice(state.devices,local.x,local.y);
        const wire=device?null:view.hitLink(state.links,state.devices,local.x,local.y);
        if(!device&&!wire){
          // Quick Edit is free-Network-Lab only. Nothing opens on empty
          // builder/training canvas and the old Canvas menu is retired.
          window.PacketLabV09QuickEdit?.openAt?.(startX,startY,local,{pointerId:e.pointerId});
          return;
        }
        openMenuAt(startX, startY);
      }, 720) };
    }

    const p = view.toLocal(e);
    const d = view.hitDevice(state.devices, p.x, p.y);
    const l = d ? null : view.hitLink(state.links, state.devices, p.x, p.y);

    // A mobile cable is laid by tapping source then destination. Desktop
    // mouse users keep the original press-and-drag behavior unchanged.
    if (state.tool === 'add' && state.addType === 'cable' &&
        e.pointerType === 'touch' && window.VeyraWiring?.handleTouchDown?.(e,d,p)) {
      cancelLongPress();
      e.preventDefault();
      return;
    }

    /* Khaali jagah par Select tool se kheencho = canvas ghumao. Middle
       button se kahin se bhi. Zoom in hone ke baad ghoomne ka yahi tareeka
       hai. Pan screen pixels me hota hai, world me nahi — isliye toScreen. */
    if (e.button === 1 || (state.tool === 'select' && !d && !l)) {
      const s = view.toScreen(e);
      state.panning = { x: s.x, y: s.y, originX:s.x, originY:s.y, moved: false };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (state.tool === 'select') {
      if (d) {
        // Touch: wait for a confirmed tap. A swipe on a device pans the canvas.
        // The explicit move action still unlocks device dragging.
        if (e.pointerType === 'touch' && window.PacketLabUX?.moveArmed !== d.id) {
          const s = view.toScreen(e);
          state.panning = {x:s.x,y:s.y,originX:s.x,originY:s.y,
                           originDevice:d.id,moved:false};
          e.preventDefault();
          return;
        }
        state.selected = d.id;
        state.dragging = { id: d.id, dx: d.x - p.x, dy: d.y - p.y };
        renderInspector();
      }
      return;
    }

    /* ADD tool dono kaam karta hai — khaali jagah par click se naya device,
       aur ek device se doosre tak drag se cable. Alag "Cable" tool ki
       zarurat hi nahi thi: device rakhne ke turant baad use jodna hi hota
       hai, to tool badalna bekaar ka ek kadam tha. */
    if (state.tool === 'add') {
      if (d) {
        state.linkFrom = d.id;
        state.linkPreview = { from: { x: d.x, y: d.y }, to: p };
      } else if (state.addType === 'cable') {
        // Cable chuna hua hai — khaali jagah par kuch nahi banta
        log('Cable is selected — drag from one device to another to connect them', 'warn');
      } else if (l) {
        // seedha cable par click — device usi cable me tap ho jaata hai
        addDeviceOnLink(state.addType, l, p);
      } else if (e.pointerType === 'touch') {
        // Place on release, not pointerdown: scrolling must never create devices.
        const s = view.toScreen(e);
        state.pendingPlacement = {type:state.addType,downX:e.clientX,downY:e.clientY};
        state.panning = {x:s.x,y:s.y,originX:s.x,originY:s.y,moved:false};
      } else {
        addDevice(state.addType, p.x, p.y);
      }
      return;
    }

    if (state.tool === 'chaos') {
      if (d) return toggleDeviceDead(d);
      if (l) return toggleLinkDead(l);
      return;
    }

    if (state.tool === 'delete') {
      if (d) return removeDevice(d);
      if (l) return removeLink(l);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* PINCH: do ungliyon ke beech ki doori badle to zoom, aur unka
       beech-bindu khiske to pan. Dono ek saath — asli map jaisa. */
    if (pinch && pointers.size >= 2) {
      const now = pinchState();
      const s0 = view.toScreen(at(pinch.cx, pinch.cy));
      const s1 = view.toScreen(at(now.cx, now.cy));
      view.zoomAt(now.dist / pinch.dist, s1.x, s1.y);
      view.panBy(s1.x - s0.x, s1.y - s0.y);
      pinch = now;
      userMovedView = true;
      syncZoom();
      renderScene(performance.now());
      return;
    }

    // After long-press opens Quick Edit, pointer capture remains on canvas.
    // Stop canvas panning while the finger moves across the radial menu.
    if(window.PacketLabV09QuickEdit?.isOpen)return;
    const p = view.toLocal(e);

    /* Ungli thodi si bhi hili to wo long-press nahi, drag hai */
    if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 8) {
      cancelLongPress();
    }

    if (state.panning) {
      const s = view.toScreen(e);
      view.panBy(s.x - state.panning.x, s.y - state.panning.y);
      state.panning = {...state.panning, x:s.x,y:s.y,
        moved:state.panning.moved ||
          Math.hypot(s.x-(state.panning.originX ?? state.panning.x),
                     s.y-(state.panning.originY ?? state.panning.y))>8};
      userMovedView = true;
      renderScene(performance.now());
      return;
    }

    if (state.dragging) {
      const d = state.devices.find(x => x.id === state.dragging.id);
      if (d) {
        d.tx = d.x = p.x + state.dragging.dx;
        d.ty = d.y = p.y + state.dragging.dy;
        Topologies.recost(state.devices, state.links);
        updateCableMetric();
      }
      return;
    }

    if (state.linkFrom) {
      state.linkPreview.to = p;
    }

    const d = view.hitDevice(state.devices, p.x, p.y);
    state.hoverDevice = d ? d.id : null;
    state.hoverLink = d ? null : (view.hitLink(state.links, state.devices, p.x, p.y) || {}).id || null;

    canvas.style.cursor =
      state.tool === 'add' ? (d ? 'crosshair' : 'copy')   // device par = cable kheencho
      : state.tool === 'chaos' ? (d || state.hoverLink ? 'crosshair' : 'default')
      : state.tool === 'delete' ? (d || state.hoverLink ? 'not-allowed' : 'default')
      : d ? 'grab'
      : state.hoverLink ? 'default'
      : 'grab';                       // khaali jagah = pan ho sakta hai
  });

  /* Wheel se zoom, aur wo bhi cursor ko pakad ke — jis cheez par mouse hai
     wahi apni jagah rehti hai, screen ke beech se zoom nahi hota. */
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    closeCtx();                       // menu ek jagah pinned hai, zoom ke saath nahi chalta
    const s = view.toScreen(e);
    view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, s.x, s.y);
    userMovedView = true;
    syncZoom();
    renderScene(performance.now());
  }, { passive: false });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    cancelLongPress();

    /* Ungli hatne par hover ka nishaan bhi hata do — mouse ki tarah wo
       khud nahi hatta, aur device highlighted pada reh jaata hai. */
    if (e.pointerType === 'touch') { state.hoverDevice = null; state.hoverLink = null; }
  }

  window.addEventListener('pointercancel', (e) => {
    endPointer(e);
    abandonSinglePointerGesture();
    canvas.style.cursor = 'grab';
    renderScene(performance.now());
  });

  window.addEventListener('pointerup', (e) => {
    endPointer(e);
    if(window.PacketLabV09QuickEdit?.isOpen){
      state.panning=null;state.pendingPlacement=null;state.dragging=null;
      state.linkFrom=null;state.linkPreview=null;return;
    }
    if (state.panning) {
      const pan=state.panning;
      if (!pan.moved && state.tool === 'select') {
        state.selected = pan.originDevice || null;
        renderInspector();
      }
      state.panning = null;
      canvas.style.cursor = 'grab';
      if (state.pendingPlacement && !pan.moved &&
          Math.hypot(e.clientX-state.pendingPlacement.downX,
                     e.clientY-state.pendingPlacement.downY)<12) {
        const p=view.toLocal(e);
        addDevice(state.pendingPlacement.type,p.x,p.y);
      }
    }
    state.pendingPlacement=null;

    if (state.linkFrom) {
      const p = view.toLocal(e);
      const target = view.hitDevice(state.devices, p.x, p.y);
      if (target && target.id !== state.linkFrom) {
        addLink(state.linkFrom, target.id);
      } else if (!target) {
        // kisi device par nahi chhoda — shayad seedha cable par chhoda hai
        const l = view.hitLink(state.links, state.devices, p.x, p.y);
        if (l) spliceIntoLink(state.linkFrom, l);
      }
      state.linkFrom = null;
      state.linkPreview = null;
    }
    if (state.dragging && window.PacketLabUX?.moveArmed === state.dragging.id)
      window.PacketLabUX.moveArmed = null;
    state.dragging = null;
  });

  /* ---------- structural edits ---------- */
  function addDevice(type, x, y, { quiet = false } = {}) {
    pushHistory();
    const meta = Topologies.TYPES[type] || Topologies.TYPES.pc;
    const n = state.devices.filter(d => d.type === type).length + 1;
    const d = Topologies.device(type, `${meta.prefix}-${n}`, x, y);
    d.subnet = 1;
    d.mac = Topologies.macFor(d.id);

    /* Subnet ka agla khaali host number lo. Pehle yahan 100 + count tha,
       jisse naye devices ko .108 jaisa IP milta tha jabki generator ke
       banaye hue devices .11, .12, ... par the — list dekhne me ajeeb
       lagti thi. */
    const taken = new Set(state.devices
      .filter(x => (x.subnet === 0 ? 1 : x.subnet) === 1)
      .flatMap(x => x.ips || [x.ip])
      .filter(Boolean));
    let host = 11;
    while (taken.has(`192.168.1.${host}`)) host++;

    d.ip = `192.168.1.${host}`;
    d.ips = [d.ip];

    /* Gateway tabhi jab wo sach me maujood ho. Warna inspector ek aisa
       gateway dikhata hai jo kisi device ka nahi (dekho topologies.js). */
    const gwIp = '192.168.1.1';
    if (state.devices.some(x => (x.ips || [x.ip]).includes(gwIp))) d.gateway = gwIp;
    state.devices.push(d);
    refresh();
    if (!quiet) log(`${d.label} added — now drag a cable from it to connect it`, 'warn');
    return d;
  }

  /* ---------------------------------------------------------
     CABLE ME TAP KARNA

     Asli bus me naya device kisi doosre device se nahi judta — wo
     backbone ke taar me hi ek tap nikaal ke ghusta hai. Model me wahi
     karte hain: cable A—B ki jagah A—N aur N—B bana dete hain.

     Isse chain ka matlab bhi wahi rehta hai — beech me kahin bhi kaato
     to network do tukde — aur bus ka shape/busY dono naye cables me
     chala jaata hai, isliye rendering bhi backbone jaisi hi rehti hai.
     --------------------------------------------------------- */
  function spliceIntoLink(deviceId, l, { quiet = false } = {}) {
    if (l.a === deviceId || l.b === deviceId) {
      log('That device is already on this cable', 'warn');
      return false;
    }
    const at = new Map(state.devices.map(d => [d.id, d]));
    const A = at.get(l.a), B = at.get(l.b), N = at.get(deviceId);
    if (!A || !B || !N) return false;
    // N beech me aata hai — usme DO cable lagenge (A—N aur N—B)
    if (!needPort(N, 2)) return false;

    const shape = l.shape === 'bus' ? 'bus' : 'line';
    const extra = l.shape === 'bus' ? { busY: l.busY } : {};

    state.links = state.links.filter(x => x.id !== l.id);
    state.links.push(Topologies.link(A, N, shape, extra));
    state.links.push(Topologies.link(N, B, shape, extra));
    Topologies.recost(state.devices, state.links);
    refresh();
    if (!quiet) log(`${N.label} tapped into the ${A.label} ↔ ${B.label} cable`, 'good');
    return true;
  }

  /* Seedha cable par click karke naya device us cable me daal do */
  function addDeviceOnLink(type, l, p) {
    const at = new Map(state.devices.map(x => [x.id, x]));
    const A = at.get(l.a), B = at.get(l.b);
    if (!A || !B) return;

    /* Bus par device taar ke UPAR ya NEECHE baithta hai, taar ke andar
       nahi. Jis taraf aas-paas jagah khaali ho wahi chun lete hain. */
    let { x, y } = p;
    if (l.shape === 'bus') {
      const busyAbove = state.devices.some(d => Math.abs(d.tx - p.x) < 80 && d.ty < l.busY);
      y = l.busY + (busyAbove ? 96 : -96);
    }

    const d = addDevice(type, x, y, { quiet: true });
    if (!spliceIntoLink(d.id, l, { quiet: true })) {
      // tap nahi ho paaya to naya device wahin chhod dete hain, bas
      // seedha bata dete hain ki wo abhi kisi se juda nahi hai
      log(`${d.label} added, but it could not tap into that cable`, 'warn');
      return;
    }
    log(`${d.label} tapped into the ${A.label} ↔ ${B.label} cable`, 'good');
  }

  /* ---------------------------------------------------------
     PORTS

     Har device me ginti ke socket hote hain. Kata hua cable bhi port
     ghera rehta hai — wo abhi bhi plug hai, bas usme signal nahi ja
     raha — isliye ginti me dead links bhi aate hain.
     --------------------------------------------------------- */
  const portsTotal = (d) => d.ports || Topologies.portsFor(d.type);
  const portsUsed  = (d) => state.links.filter(l => l.a === d.id || l.b === d.id).length;
  const portsFree  = (d) => portsTotal(d) - portsUsed(d);

  function needPort(d, n = 1) {
    if (portsFree(d) >= n) return true;
    log(`${d.label} has no free ports — all ${portsTotal(d)} are in use. Right-click it and fit a bigger one.`, 'bad');
    return false;
  }

  function addLink(aId, bId) {
    const exists = state.links.some(l =>
      (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId));
    if (exists) { log('That cable already exists', 'warn'); return; }

    const A0 = state.devices.find(d => d.id === aId);
    const B0 = state.devices.find(d => d.id === bId);
    if (!A0 || !B0 || !needPort(A0) || !needPort(B0)) return;
    pushHistory();

    const A = A0, B = B0;
    state.links.push(Topologies.link(A, B));
    Topologies.recost(state.devices, state.links);
    refresh();
    log(`Cable added: ${A.label} ↔ ${B.label}`, 'good');
  }

  function removeDevice(d) {
    pushHistory();
    state.devices = state.devices.filter(x => x.id !== d.id);
    state.links = state.links.filter(l => l.a !== d.id && l.b !== d.id);
    if (state.selected === d.id) state.selected = null;
    if (state.src === d.id || state.dst === d.id) pickDefaultEndpoints();
    refresh();
    log(`${d.label} removed`, 'warn');
  }

  function removeLink(l) {
    pushHistory();
    state.links = state.links.filter(x => x.id !== l.id);
    refresh();
    log('Cable removed', 'warn');
  }

  function toggleDeviceDead(d) {
    pushHistory();
    d.dead = !d.dead;
    if (d.dead) engine.blast(d.x, d.y);
    refresh();
    if (d.dead) {
      const cut = state.comps.length > 1
        ? ` — the network broke into ${state.comps.length} pieces!`
        : ' — the network is still in one piece';
      log(`💀 ${d.label} is down${cut}`, state.comps.length > 1 ? 'bad' : 'good');
    } else {
      log(`🛠 ${d.label} is back online`, 'good');
    }
    autoReroute();
  }

  function toggleLinkDead(l) {
    pushHistory();
    l.dead = !l.dead;
    refresh();
    const A = state.devices.find(d => d.id === l.a);
    const B = state.devices.find(d => d.id === l.b);
    if (l.dead) {
      const cut = state.comps.length > 1
        ? ` — NETWORK SPLIT (${state.comps.length} islands)`
        : ' — no impact, another route exists';
      log(`✂ Cable cut: ${A.label} ↔ ${B.label}${cut}`, state.comps.length > 1 ? 'bad' : 'good');
    } else {
      log(`🛠 Cable reconnected: ${A.label} ↔ ${B.label}`, 'good');
    }
    autoReroute();
  }

  /* Kuch toota to jo route highlight ho raha tha use dobara nikalo —
     yahi "reroute" ka jaadu dikhata hai */
  function autoReroute() {
    if (!state.pathLinks.size) return;

    const at = new Map(state.devices.map(d => [d.id, d]));
    const src = at.get(state.src), dst = at.get(state.dst);
    const oldHops = state.pathDevices.size - 1;

    // agar sender ya receiver khud hi mar gaya to ye "raasta nahi mila"
    // nahi hai — endpoint hi gayab hai. Dono baatein alag hain.
    if (src?.dead || dst?.dead) {
      clearRoute();
      log(`${src?.dead ? src.label : dst.label} is down itself — a route would not help, there is nobody to send or receive`, 'bad');
      return;
    }

    const route = computeRoute();
    clearRoute();
    if (route) {
      route.linkPath.forEach(id => state.pathLinks.add(id));
      route.path.forEach(id => state.pathDevices.add(id));
      const change = route.hops > oldHops ? ` (up from ${oldHops} — a little longer now)` : '';
      log(`↩ Traffic rerouted the other way — now ${route.hops} hops${change}`, 'good');
    } else {
      log('❌ No alternate route left — this pair is cut off', 'bad');
    }
  }

  /* ---------------------------------------------------------
     RIGHT-CLICK MENU

     Jis cheez par right-click hua, sirf usi ke kaam ke options dikhte
     hain — device par kuch aur, cable par kuch aur, khaali canvas par
     kuch aur. Isse har kaam ke liye pehle tool badalne ki zarurat nahi
     rehti: seedha us cheez par jao aur bolo kya karna hai.
     --------------------------------------------------------- */
  const ctxEl = $('ctxMenu');

  function closeCtx() {
    if (ctxEl.hidden) return;
    ctxEl.hidden = true;
    ctxEl.innerHTML = '';
  }

  function openCtx(clientX, clientY, title, items) {
    ctxEl.innerHTML =
      `<div class="ctx__head">${title}</div>` +
      items.map((it, i) => it.sep
        ? '<div class="ctx__sep"></div>'
        : `<button class="ctx__item${it.danger ? ' ctx__item--danger' : ''}" data-i="${i}">
             <span class="ctx__ico">${it.icon || ''}</span><span>${it.label}</span>
           </button>`).join('');

    // pehle dikhao, phir naapo — hidden element ki width/height 0 aati hai
    ctxEl.hidden = false;
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(8, Math.min(clientX, window.innerWidth  - r.width  - 8)) + 'px';
    ctxEl.style.top  = Math.max(8, Math.min(clientY, window.innerHeight - r.height - 8)) + 'px';

    ctxEl.querySelectorAll('.ctx__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const it = items[+btn.dataset.i];
        closeCtx();
        it.action();
      });
    });
  }

  function deviceMenu(d) {
    const isSrc = state.src === d.id, isDst = state.dst === d.id;
    return [
      { icon: '🔍', label: 'Inspect this device',
        action: () => { state.selected = d.id; renderInspector(); } },
      { icon: '✎', label: 'Edit details…', action: () => openEditDialog(d) },
      ...(d.type === 'firewall'
        ? [{ icon: '🧱', label: 'Firewall rules…', action: () => openRulesDialog(d) }]
        : []),
      { sep: true },
      { icon: isSrc ? '✓' : 'S', label: 'Set as source',
        action: () => { state.src = d.id; $('srcSelect').value = d.id; clearRoute(); refresh(); } },
      { icon: isDst ? '✓' : 'D', label: 'Set as destination',
        action: () => { state.dst = d.id; $('dstSelect').value = d.id; clearRoute(); refresh(); } },
      { icon: '▶', label: 'Send a packet now', action: sendPacket },
      { sep: true },
      { icon: d.dead ? '🛠' : '☠',
        label: d.dead ? 'Bring back online' : 'Kill this device',
        danger: !d.dead, action: () => toggleDeviceDead(d) },
      { icon: '🗑', label: 'Delete device', danger: true, action: () => removeDevice(d) },
    ];
  }

  function cableMenu(l, p) {
    const at = new Map(state.devices.map(x => [x.id, x]));
    const A = at.get(l.a), B = at.get(l.b);
    const addType = state.addType === 'cable' ? 'pc' : state.addType;
    return [
      { icon: '＋', label: `Add a ${(Topologies.TYPES[addType] || Topologies.TYPES.pc).name.toLowerCase()} on this cable`,
        action: () => addDeviceOnLink(addType, l, p) },
      { sep: true },
      { icon: l.dead ? '🛠' : '✂',
        label: l.dead ? 'Reconnect this cable' : 'Cut this cable',
        danger: !l.dead, action: () => toggleLinkDead(l) },
      { icon: '🗑', label: 'Delete cable', danger: true, action: () => removeLink(l) },
      { sep: true },
      { icon: '🔍', label: `Inspect ${A ? A.label : '?'}`,
        action: () => { state.selected = l.a; renderInspector(); } },
      { icon: '🔍', label: `Inspect ${B ? B.label : '?'}`,
        action: () => { state.selected = l.b; renderInspector(); } },
    ];
  }

  function canvasMenu(p) {
    const add = (type, label, icon) => ({ icon, label, action: () => addDevice(type, p.x, p.y) });
    return [
      add('pc', 'Add a PC here', '💻'),
      add('switch', 'Add a switch here', '🔀'),
      add('router', 'Add a router here', '📡'),
      add('server', 'Add a server here', '🗄'),
      { sep: true },
      { icon: '⤢', label: 'Fit network in view',
        action: () => { fitView(); renderScene(performance.now()); } },
      { icon: '🛠', label: 'Repair everything', action: repairAll },
    ];
  }

  function cableTitle(l) {
    const at = new Map(state.devices.map(x => [x.id, x]));
    const A = at.get(l.a), B = at.get(l.b);
    return `Cable · ${A ? A.label : '?'} ↔ ${B ? B.label : '?'}`;
  }

  /* Menu kholne ka ek hi raasta — mouse ka right-click aur ungli ka
     long-press dono yahin aate hain. */
  function openMenuAt(clientX, clientY) {
    const p = view.toLocal(at(clientX, clientY));
    const d = view.hitDevice(state.devices, p.x, p.y);
    const l = d ? null : view.hitLink(state.links, state.devices, p.x, p.y);

    if (d && window.VeyraNext && window.VeyraNext.showDeviceActions) {
      window.VeyraNext.showDeviceActions(d.id);
      return;
    }
    if (d)      openCtx(clientX, clientY, `${d.type.toUpperCase()} · ${d.label}`, deviceMenu(d));
    else if (l && window.VeyraRefine && window.VeyraRefine.showCableActions) {
      window.VeyraRefine.showCableActions(l.id); return;
    }
    else if (l) openCtx(clientX, clientY, cableTitle(l), cableMenu(l, p));
    else if(window.PacketLabV09Training?.role?.()==='network'){
      window.PacketLabV09QuickEdit?.openAt?.(clientX,clientY,p,{mouse:true});
      // Never reveal the obsolete CANVAS context menu on empty free-lab space.
    } // Empty-space context menus are disabled in Training/Builder.
    // All free-lab Quick Edit actions live in the gesture controller.
  }

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  });

  // menu ke bahar kahin bhi dabao/chhuo to band
  window.addEventListener('pointerdown', (e) => {
    if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeCtx();
  });

  /* ---------------------------------------------------------
     EDIT DEVICE

     Har cheez jo device ki pehchaan banati hai — naam, type, IP, MAC,
     gateway, ports — yahin se badalti hai. Validation asli niyamon par
     hai, isliye galat value chupchaap andar nahi ghus sakti:
       - naam khaali nahi, aur kisi doosre device ka naam nahi
       - IP asli IPv4 shakal me, aur network me unique
       - MAC 6 hex jode
       - ports kabhi utne se kam nahi jitne cable pehle se lage hain
     --------------------------------------------------------- */
  const modal = $('editModal');
  let editingId = null;

  const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const MACRE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

  const validIp = (v) => {
    const m = IPV4.exec(v.trim());
    return !!m && m.slice(1).every(o => o.length <= 3 && +o >= 0 && +o <= 255);
  };

  function editError(msg) {
    const box = $('edErr');
    box.textContent = msg;
    box.hidden = !msg;
    return false;
  }

  function openEditDialog(d) {
    editingId = d.id;
    $('edTitle').textContent = `Edit ${d.label}`;
    $('edName').value  = d.label;
    $('edIp').value    = d.ip || '';
    $('edMac').value   = d.mac || '';
    $('edGw').value    = d.gateway || '';
    $('edPorts').value = portsTotal(d);

    const used = portsUsed(d);
    $('edPortNote').textContent =
      `${used} port${used === 1 ? '' : 's'} already have a cable in them, so this cannot go below ${Math.max(1, used)}.`;

    const sel = $('edType');
    sel.innerHTML = Object.entries(Topologies.TYPES)
      .map(([k, t]) => `<option value="${k}"${k === d.type ? ' selected' : ''}>${t.name}</option>`).join('');

    // router ke paas har subnet ka .1 hota hai — ek input me nahi samaata
    const multi = (d.ips || []).length > 1;
    $('edIp').disabled = multi;
    $('edIp').title = multi
      ? 'This device is a gateway on more than one subnet, so its addresses are managed automatically.'
      : '';

    editError('');
    modal.hidden = false;
    $('edName').focus();
    $('edName').select();
  }

  function closeEditDialog() {
    modal.hidden = true;
    editingId = null;
  }

  function saveEditDialog(e) {
    e.preventDefault();
    editError('');                     // pichhli koshish ka message hata do
    const d = state.devices.find(x => x.id === editingId);
    if (!d) return closeEditDialog();

    const others = state.devices.filter(x => x.id !== d.id);
    const name  = $('edName').value.trim();
    const ip    = $('edIp').value.trim();
    const mac   = $('edMac').value.trim().toUpperCase();
    const gw    = $('edGw').value.trim();
    const ports = parseInt($('edPorts').value, 10);
    const type  = $('edType').value;
    const used  = portsUsed(d);

    if (!name) return editError('Give the device a name.');
    if (others.some(x => x.label.toLowerCase() === name.toLowerCase()))
      return editError(`Another device is already called "${name}".`);

    if (!$('edIp').disabled) {
      if (!validIp(ip)) return editError('That is not a valid IPv4 address — it needs four numbers, each 0–255.');
      if (others.some(x => (x.ips || [x.ip]).includes(ip)))
        return editError(`${ip} is already taken by ${others.find(x => (x.ips || [x.ip]).includes(ip)).label}.`);
    }

    if (!MACRE.test(mac)) return editError('That is not a valid MAC address — six pairs of hex digits, like 02:1C:80:6C:83:3C.');
    if (others.some(x => (x.mac || '').toUpperCase() === mac))
      return editError('Another device already has that MAC address.');

    if (gw && !validIp(gw)) return editError('The gateway is not a valid IPv4 address.');

    if (!Number.isFinite(ports) || ports < 1) return editError('A device needs at least one port.');
    if (ports > 48) return editError('48 ports is the largest size available.');
    if (ports < used) return editError(`${used} cables are already plugged in, so this cannot go below ${used} ports.`);

    pushHistory();
    const maskInput=document.getElementById('v07-ed-subnet');
    if(maskInput){
      d.vprofile=d.vprofile||{};
      d.vprofile.subnet=maskInput.value.trim();
    }
    const oldLabel = d.label;
    d.label = name;
    d.mac   = mac.replace(/-/g, ':');
    d.ports = ports;
    d.gateway = gw || undefined;
    if(d.vprofile) d.vprofile.gateway = gw || '';

    if (!$('edIp').disabled) {
      d.ip  = ip;
      d.ips = [ip];
      if(d.vprofile)d.vprofile.ipv4 = ip;
      const octet = +IPV4.exec(ip)[3];
      d.subnet = octet;                 // 192.168.X.n -> subnet X
    }

    if (type !== d.type) {
      d.type = type;
      d.isGateway = Topologies.isRouter(type);
      d.ports = Math.max(ports, used);
      // naye type ki apni services hoti hain; purani MAC table ab bemaani hai
      d.services = Topologies.servicesFor(type);
      d.macTable = new Map();
    }

    closeEditDialog();
    refresh();
    updateEndpointSelects();
    renderInspector();
    log(`${oldLabel} updated — now ${d.label} at ${d.ip}, ${d.ports} ports`, 'good');
  }

  /* ---------------------------------------------------------
     FIREWALL RULES DIALOG

     Rules device par hi rehti hain (d.rules). Yahan sirf list dikhti hai
     aur add/delete hota hai — asli faisla Sim.firewallCheck karta hai,
     packet bhejte waqt.
     --------------------------------------------------------- */
  const rulesModal = $('rulesModal');
  let rulesFor = null;

  /* fwDirty = "neeche wale add-row me user ne kuch chheda hai jo abhi list
     me nahi gaya". Isi ek flag se do cheezein sambhal jaati hain:
       - Add rule dabaye bina Done dabaya  -> chuna hua rule add ho jaata hai
       - Add rule ke baad Done dabaya      -> dobara add NAHI hota
     Aur dialog bina kuch chhede band karo to kuch add nahi hota. */
  let fwDirty = false;

  function openRulesDialog(d) {
    rulesFor = d.id;
    d.rules = d.rules || [];              // purane snapshot se aaya device bhi chale
    $('fwTitle').textContent = `${d.label} — firewall rules`;

    /* Firewall khud dekh leta hai ki wo kis-kis ko alag kar raha hai, aur
       dropdown usi hisaab se banta hai: har side ka apna optgroup, uske
       andar "poori side" ka option aur us side ke saare devices. */
    const zones = Sim.firewallZones(state.devices, state.links, d.id);

    const options = `<option value="any">anyone</option>` + zones.map(z => `
      <optgroup label="${z.label} — ${z.count} device${z.count === 1 ? '' : 's'}">
        ${z.count > 1 ? `<option value="${z.id}">everything on ${z.label}</option>` : ''}
        ${z.devices.map(id => {
          const dev = state.devices.find(x => x.id === id);
          return dev ? `<option value="${id}">${dev.label}</option>` : '';
        }).join('')}
      </optgroup>`).join('');

    $('fwFrom').innerHTML = options;
    $('fwTo').innerHTML = options;
    $('fwAction').value = 'block';
    $('fwProto').value = 'any';

    /* Port ki list network me jo services sach me chal rahi hain unhi se
       banti hai — nakli port dikhane ka koi matlab nahi. */
    const svcs = new Map();
    state.devices.forEach(x => (x.services || []).forEach(v => svcs.set(v.port, v.name)));
    $('fwPort').innerHTML = `<option value="any">any port</option>` +
      [...svcs.entries()].sort((a, b) => a[0] - b[0])
        .map(([port, name]) => `<option value="${port}">${port} · ${name}</option>`).join('');
    $('fwPort').value = 'any';

    // do side hain to From/To pehle se hi dono taraf set kar dete hain
    if (zones.length >= 2) {
      $('fwFrom').value = zones[0].count > 1 ? zones[0].id : zones[0].devices[0];
      $('fwTo').value   = zones[1].count > 1 ? zones[1].id : zones[1].devices[0];
    }

    fwDirty = false;
    $('fwErr').hidden = true;
    renderZoneSummary(d, zones);
    renderRules();
    rulesModal.hidden = false;
  }

  /* Upar wala hissa: ye firewall kin taraf ke beech me laga hua hai */
  function renderZoneSummary(d, zones) {
    const box = $('fwZones');
    const quick = $('fwQuick');

    if (!zones.length) {
      box.innerHTML = `<p class="inspector__empty">${d.label} has no cables yet, so it is not between anything. Connect it and its sides show up here.</p>`;
      quick.hidden = true;
      return;
    }
    if (zones.length === 1) {
      box.innerHTML = `<p class="inspector__empty">${d.label} only has one side (${zones[0].label}). Traffic never passes <em>through</em> it, so no rule can ever match. Put it between two parts of the network.</p>`;
      quick.hidden = true;
      return;
    }

    box.innerHTML = `
      <p class="fld__note">${d.label} sits between ${zones.length} sides. Anything crossing from one side to another has to go through it.</p>
      <div class="zonegrid">${zones.map(z => `
        <div class="zone">
          <div class="zone__name">${z.label}</div>
          <div class="zone__devs mono">${z.devices
            .map(id => (state.devices.find(x => x.id === id) || {}).label)
            .filter(Boolean).join(' · ')}</div>
        </div>`).join('')}</div>`;

    // theek do side hon to ek click me dono disha band karne ka shortcut
    quick.hidden = zones.length !== 2;
    if (zones.length === 2) {
      quick.textContent = `Block everything between ${zones[0].label} and ${zones[1].label}`;
      quick.onclick = () => {
        const a = zones[0].count > 1 ? zones[0].id : zones[0].devices[0];
        const b = zones[1].count > 1 ? zones[1].id : zones[1].devices[0];
        $('fwAction').value = 'block'; $('fwProto').value = 'any';
        $('fwFrom').value = a; $('fwTo').value = b; addRule();
        $('fwFrom').value = b; $('fwTo').value = a; addRule();
        fwDirty = false;
      };
    }
  }

  function closeRulesDialog() {
    /* Done dabate waqt agar add-row me kuch chuna hua pada hai jo list me
       nahi gaya, to use bhi add kar do — user ne wahi to chuna tha.
       Galat rule (jaise khud se khud tak) par dialog khula rehta hai,
       warna error kabhi dikhta hi nahi. */
    if (fwDirty && !addRule({ quietDuplicate: true })) return;

    rulesModal.hidden = true;
    rulesFor = null;
    fwDirty = false;
    refresh();
  }

  function renderRules() {
    const d = state.devices.find(x => x.id === rulesFor);
    if (!d) return;
    const at = new Map(state.devices.map(x => [x.id, x]));
    const zones = Sim.firewallZones(state.devices, state.links, d.id);
    const list = $('fwList');

    list.innerHTML = (d.rules || []).length
      ? d.rules.map((r, i) => `
          <div class="fwrule fwrule--${r.action}">
            <span class="fwrule__n mono">${i + 1}</span>
            <span class="fwrule__txt">${Sim.ruleText(r, at, zones)}</span>
            <button class="btn btn--icon btn--sm" data-del="${i}" title="Delete this rule">✕</button>
          </div>`).join('')
      : `<p class="inspector__empty">No rules yet — everything is allowed through.</p>`;

    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      pushHistory();
      d.rules.splice(+b.dataset.del, 1);
      renderRules();
      log(`Rule removed from ${d.label}`, 'warn');
    }));
  }

  function addRule({ quietDuplicate = false } = {}) {
    const d = state.devices.find(x => x.id === rulesFor);
    if (!d) return true;
    const r = {
      action: $('fwAction').value,
      proto:  $('fwProto').value,
      port:   $('fwPort').value,
      from:   $('fwFrom').value,
      to:     $('fwTo').value,
    };
    const at = new Map(state.devices.map(x => [x.id, x]));
    const zones = Sim.firewallZones(state.devices, state.links, d.id);

    /* Rule refuse hone par pehle sirf event log me line jaati thi, jo
       dialog ke peeche chhup jaati hai — user ko lagta tha kuch hua hi
       nahi. Ab wajah dialog ke andar bhi dikhti hai. */
    const warn = (msg) => { $('fwErr').textContent = msg; $('fwErr').hidden = false; log(msg, 'warn'); };

    if (r.from !== 'any' && r.from === r.to) {
      warn('A rule from something to itself would never match anything.');
      return false;
    }
    const same = (d.rules || []).some(x =>
      x.action === r.action && x.proto === r.proto && (x.port || 'any') === r.port
      && x.from === r.from && x.to === r.to);
    if (same) {
      // Done se aaye ho to ye koi galti nahi — rule pehle se list me hai
      if (!quietDuplicate) warn('That rule is already in the list.');
      fwDirty = false;
      return true;
    }
    $('fwErr').hidden = true;

    pushHistory();
    d.rules = d.rules || [];
    d.rules.push(r);
    fwDirty = false;
    renderRules();

    // nayi row ko ek pal ke liye chamka do — warna pata hi nahi chalta ki kuch hua
    const rows = $('fwList').querySelectorAll('.fwrule');
    const fresh = rows[rows.length - 1];
    if (fresh) fresh.classList.add('is-new');

    log(`${d.label}: ${Sim.ruleText(r, at, zones)}`, r.action === 'block' ? 'bad' : 'good');
    return true;
  }

  function repairAll() {
    pushHistory();
    state.devices.forEach(d => d.dead = false);
    state.links.forEach(l => l.dead = false);
    refresh();
    log('🛠 Everything repaired', 'good');
  }

  /* ---------------------------------------------------------
     UNDO / REDO

     Har structural badlaav se PEHLE poore network ka ek snapshot le lete
     hain (devices + links ki gehri copy). Undo yaani wapas pichhla
     snapshot laga do.

     Diff-based undo jaan-boojh ke nahi banaya — is app me ek "action"
     kabhi-kabhi kai cheezein badalta hai (cable me tap karne se ek link
     hat'ta hai aur do bante hain, device delete karne se uske saare cable
     jaate hain). Poora snapshot rakhna 60 devices ke is paimane par
     bilkul sasta hai aur kabhi adhoora nahi hota.

     ARP cache Map hai, isliye use alag se copy karna padta hai — JSON
     wali seedhi copy Map ko khaali object bana deti.
     --------------------------------------------------------- */
  const history = { past: [], future: [], limit: 60 };

  function snapshot() {
    return {
      devices: state.devices.map(d => ({ ...d,
                                        vprofile: d.vprofile ? JSON.parse(JSON.stringify(d.vprofile)) : undefined,
                                        arp: new Map(d.arp), seen: (d.seen || []).slice(),
                                        rules: (d.rules || []).map(r => ({ ...r })),
                                        services: (d.services || []).map(x => ({ ...x })),
                                        macTable: new Map(d.macTable || []) })),
      links: state.links.map(l => ({ ...l })),
      src: state.src, dst: state.dst,
    };
  }

  function applySnapshot(s) {
    state.devices = s.devices.map(d => ({ ...d,
      vprofile: d.vprofile ? JSON.parse(JSON.stringify(d.vprofile)) : undefined,
      arp: new Map(d.arp), macTable: new Map(d.macTable || []) }));
    state.links = s.links.map(l => ({ ...l }));
    state.src = s.src; state.dst = s.dst;
    state.selected = null;
    state.linkFrom = null;
    clearRoute();
    engine.clear();
    refresh();
  }

  /* Kisi bhi structural badlaav se pehle bulao */
  function pushHistory() {
    history.past.push(snapshot());
    if (history.past.length > history.limit) history.past.shift();
    history.future.length = 0;        // naya kaam karte hi redo ki chain toot jaati hai
    syncUndoButtons();
  }

  function undo() {
    if (!history.past.length) return;
    history.future.push(snapshot());
    applySnapshot(history.past.pop());
    syncUndoButtons();
    log('↶ Undo', 'warn');
  }

  function redo() {
    if (!history.future.length) return;
    history.past.push(snapshot());
    applySnapshot(history.future.pop());
    syncUndoButtons();
    log('↷ Redo', 'warn');
  }

  function syncUndoButtons() {
    const u = $('btnUndo'), r = $('btnRedo');
    if (u) u.disabled = history.past.length === 0;
    if (r) r.disabled = history.future.length === 0;
  }

  /* ---------------------------------------------------------
     5. ANALYSIS + PANELS
     --------------------------------------------------------- */
  function refresh() {
    state.adj  = Graph.build(state.devices, state.links);
    state.spof = Graph.findSPOF(state.adj);
    state.comps = Graph.components(state.adj);
    state.stats = Graph.stats(state.adj);
    state.res  = Graph.resilience(state.devices, state.links);

    // har device kis island me hai (0 = sabse bada / main network)
    state.islandOf = new Map();
    state.comps.forEach((group, i) => group.forEach(id => state.islandOf.set(id, i)));

    updateMetrics();
    updateBanner();
    updateEndpointSelects();
    renderInspector();

    // rAF ka intezaar kiye bina turant ek frame — dekho comment upar renderScene par
    renderScene(performance.now());
    window.dispatchEvent(new Event('veyra:graphchange'));
  }

  function updateMetrics() {
    const alive = state.devices.filter(d => !d.dead);
    const aliveLinks = state.links.filter(l => !l.dead);

    $('mDevices').textContent = `${alive.length}${alive.length !== state.devices.length ? ` / ${state.devices.length}` : ''}`;
    $('mLinks').textContent = `${aliveLinks.length}${aliveLinks.length !== state.links.length ? ` / ${state.links.length}` : ''}`;
    $('mAvgHops').textContent = state.stats.avgHops.toFixed(2);
    $('mDiameter').textContent = state.stats.diameter;
    $('mReach').textContent = `${state.stats.reachablePct.toFixed(0)}%`;
    updateCableMetric();

    const r = state.res || { score: 0, redundancyPct: 0, survivalPct: 0, pathDiversity: 0, worst: null };
    $('mScore').textContent = Math.round(r.score);
    setBar('barRedundancy', 'mRedundancy', r.redundancyPct);
    setBar('barSurvival',   'mSurvival',   r.survivalPct);
    setBar('barDiversity',  'mDiversity',  r.pathDiversity);

    const ring = $('scoreRing');
    ring.style.setProperty('--pct', Math.round(r.score));
    ring.dataset.grade = r.score >= 70 ? 'good' : r.score >= 35 ? 'mid' : 'bad';

    renderWeakest(r);
  }

  function updateCableMetric() {
    const metres = state.links
      .filter(l => !l.dead)
      .reduce((sum, l) => sum + (l.metres || 0), 0);
    $('mCable').textContent = `${Math.round(metres)} m`;
  }

  function setBar(barId, valId, pct) {
    $(barId).style.width = `${Math.max(0, Math.min(100, pct))}%`;
    $(valId).textContent = `${Math.round(pct)}%`;
  }

  function renderWeakest(r) {
    const box = $('weakest');

    /* Teen alag haalat hain, aur inhe alag-alag dikhana zaroori hai.
       Pehle ye code do ko ek hi samajh raha tha: network toota pada ho
       tab bhi "koi failure ise tod nahi sakti" likh deta tha. */
    if (r.alreadySplit) {
      box.className = 'weakest weakest--broken';
      box.innerHTML = `<p class="weakest__none">💥 Network is already broken — repair it first to see where it is weakest.</p>`;
      return;
    }
    if (!r.worst) {
      box.className = 'weakest weakest--safe';
      box.innerHTML = `<p class="weakest__none">✅ No single failure can break this network.</p>`;
      return;
    }
    box.className = 'weakest';
    const at = new Map(state.devices.map(d => [d.id, d]));
    let what, name;
    if (r.worst.kind === 'device') {
      const d = at.get(r.worst.id);
      what = 'Device'; name = d ? d.label : '?';
    } else {
      const l = state.links.find(x => x.id === r.worst.id);
      const A = l && at.get(l.a), B = l && at.get(l.b);
      what = 'Cable'; name = A && B ? `${A.label} ↔ ${B.label}` : '?';
    }

    box.innerHTML = `
      <div class="weakest__head">Weakest point</div>
      <div class="weakest__name">${what}: <b>${name}</b></div>
      <div class="weakest__note">Kill this and only <b>${Math.round(r.survivalPct)}%</b> of what is left stays connected</div>
      <button class="btn btn--sm btn--danger" id="btnKillWeakest">☠ Kill it and see</button>`;

    $('btnKillWeakest').addEventListener('click', () => {
      if (r.worst.kind === 'device') {
        const d = at.get(r.worst.id);
        if (d && !d.dead) toggleDeviceDead(d);
      } else {
        const l = state.links.find(x => x.id === r.worst.id);
        if (l && !l.dead) toggleLinkDead(l);
      }
    });
  }

  /* Banner ka poora text HAMESHA ek hi child element ke andar jaata hai.

     Wajah: .banner ek flex container hai (taaki stretch hone par text
     beech me rahe). Flex me har text-node aur har element ALAG flex item
     ban jaata hai. Pehle yahan seedha `⚠ <b>NETWORK SPLIT</b> — baaki...`
     set hota tha, to teen alag items ban jaate the aur ek row me lag
     jaate the — "NETWORK SPLIT" beech se toot kar do line me chala jaata
     tha aur baaki text ajeeb tarah indent ho jaata tha.

     Ek hi wrapper hone se text normal paragraph ki tarah behta hai,
     chahe usme <b> ho ya na ho. Naya banner likho to text isi wrapper
     ke andar hi rakhna. */
  function setBanner(kind, html) {
    const b = $('banner');
    if (!html) { b.hidden = true; return; }
    b.hidden = false;
    b.className = `banner banner--${kind}`;
    b.innerHTML = `<span class="banner__text">${html}</span>`;
  }

  function updateBanner() {
    const islands = state.comps.length;
    if (islands > 1) {
      const stranded = state.comps.slice(1).reduce((n, g) => n + g.length, 0);
      setBanner('bad', `⚠ <b>NETWORK SPLIT</b> — ${islands} separate islands, ${stranded} device${stranded > 1 ? 's are' : ' is'} cut off from the main network`);
    } else if (state.spof.articulation.size > 0) {
      setBanner('warn', `⚠ ${state.spof.articulation.size} single point${state.spof.articulation.size > 1 ? 's' : ''} of failure — lose any one of the red-glowing devices and the network breaks`);
    } else if (state.devices.length) {
      setBanner('good', `✅ No single point of failure — every device has an alternate route`);
    } else {
      setBanner(null, null);
    }
  }

  function updateEndpointSelects() {
    for (const [sel, key] of [[$('srcSelect'), 'src'], [$('dstSelect'), 'dst']]) {
      const cur = state[key];
      sel.innerHTML = state.devices
        .map(d => `<option value="${d.id}" ${d.id === cur ? 'selected' : ''}>${d.label}${d.dead ? ' (down)' : ''}</option>`)
        .join('');
      if (!state.devices.some(d => d.id === cur) && state.devices.length) {
        state[key] = state.devices[0].id;
        sel.value = state[key];
      }
    }
  }

  /* ---------------------------------------------------------
     6. INSPECTOR
     --------------------------------------------------------- */
  /* Inspect karte hi Inspector right panel me sabse upar aa jaata hai, aur
     panel bhi upar scroll ho jaata hai — warna neeche pada section dikhta
     hi nahi tha. Scroll sirf tab hota hai jab CHUNA HUA device badle;
     packet aane par ye function har baar chalta hai, aur har baar scroll
     karta to user ka apna scroll baar-baar upar khinch jaata. */
  const rightPanel = document.querySelector('.panel--right');
  let lastInspected = null;

  function renderInspector() {
    const box = $('inspector');
    const d = state.devices.find(x => x.id === state.selected);

    rightPanel.classList.toggle('is-inspecting', !!d);
    if (d && d.id !== lastInspected) { rightPanel.scrollTop = 0; lastInspected = d.id; }
    if (!d) lastInspected = null;

    if (!d) {
      box.innerHTML = `<p class="inspector__empty">Click any device to see its IP, MAC, ARP cache and routing table here.</p>`;
      return;
    }

    const degree = state.links.filter(l => !l.dead && (l.a === d.id || l.b === d.id)).length;
    const isSpof = state.spof.articulation.has(d.id);
    const routes = Sim.routingTable(d.id, state.devices, state.links);

    const used  = portsUsed(d);
    const total = portsTotal(d);
    const pct   = Math.min(100, Math.round((used / Math.max(1, total)) * 100));
    const portHtml = `${used} / ${total} used
      <i class="portbar${used >= total ? ' portbar--full' : ''}"><b style="width:${pct}%"></b></i>`;

    /* Type ke hisaab se ek section: firewall ke rules, ya hub/AP ka
       samjhaava ki wo switch se alag kyun hai. */
    let gearHtml = '';
    if (d.type === 'firewall') {
      const at = new Map(state.devices.map(x => [x.id, x]));
      const rules = d.rules || [];
      const zones = Sim.firewallZones(state.devices, state.links, d.id);
      gearHtml = `
        <h3 class="insp__sub">Firewall</h3>
        <div class="notebox">${zones.length >= 2
          ? `Sits between <b>${zones.length} sides</b> — ${zones.map(z => `${z.label} (${z.count})`).join(' · ')}`
          : `Not between anything yet, so traffic never passes through it and no rule can match.`}</div>
        ${rules.length
          ? `<ol class="fwmini">${rules.map(r =>
              `<li class="fwmini__item fwmini__item--${r.action}">${Sim.ruleText(r, at, zones)}</li>`).join('')}</ol>`
          : `<p class="inspector__empty">No rules — this firewall is currently letting everything through.</p>`}
        <button class="btn btn--sm btn--wide" id="btnRulesFromInsp">🧱 Edit firewall rules</button>`;
    } else if (Topologies.isSharedMedium(d.type)) {
      gearHtml = `<div class="notebox">${Topologies.isWireless(d.type)
        ? `<b>One radio channel.</b> Every device associated with this access point shares the same airtime, so only one can transmit at a time. Wi-Fi uses CSMA/CA — a station listens first and waits rather than colliding.`
        : `<b>One collision domain.</b> A hub is a repeater, not a switch: every frame arriving on one port goes out of all the others, and two devices transmitting at once collide inside it.`}</div>`;
    } else if (Topologies.isSwitch(d.type)) {
      /* Switch ki asli pehchaan yahi table hai. Khaali ho to bhi dikhate
         hain — kyunki "abhi kuch seekha nahi" khud ek jawab hai: tab har
         frame sab ports par jaati hai. */
      const table = (d.macTable instanceof Map) ? [...d.macTable.entries()] : [];
      gearHtml = `
        <h3 class="insp__sub">MAC address table</h3>
        ${table.length
          ? `<table class="tbl mono"><thead><tr><th>MAC</th><th>Seen towards</th></tr></thead><tbody>
              ${table.map(([mac, via]) => {
                const v = state.devices.find(x => x.id === via);
                return `<tr><td>${mac}</td><td>${v ? v.label : '—'}</td></tr>`;
              }).join('')}
             </tbody></table>`
          : `<p class="inspector__empty">Nothing learned yet. Until a MAC is in this table, frames for it go out of every port — send a packet and watch it fill.</p>`}`;
    } else if (Topologies.isRouter(d.type) && d.type !== 'firewall') {
      gearHtml = `<div class="notebox"><b>Edge of the broadcast domain.</b> Broadcasts stop here: a device on one side never hears an ARP from the other. That is why a host outside its own subnet asks this router for a MAC instead of the far host.</div>`;
    }

    /* Services har device par — data packet inhi me se pehli par jaata hai */
    const svcList = d.services || [];
    const svcHtml = `
      <h3 class="insp__sub">Listening on</h3>
      ${svcList.length
        ? `<table class="tbl mono"><thead><tr><th>Port</th><th>Service</th></tr></thead><tbody>
            ${svcList.map((x, i) => `<tr${i === 0 ? ' class="is-primary"' : ''}><td>${x.port}</td><td>${x.name}${i === 0 ? ' · default' : ''}</td></tr>`).join('')}
           </tbody></table>`
        : `<p class="inspector__empty">Not listening on any port — traffic sent here is refused.</p>`}`;

    const seen = d.seen || [];
    const seenHtml = seen.length
      ? seen.map(packetRow).join('')
      : `<p class="inspector__empty">Nothing yet — send a packet and every frame that passes through ${d.label} shows up here.</p>`;

    const arpRows = [...d.arp.entries()];
    const arpHtml = arpRows.length
      ? `<table class="tbl mono"><thead><tr><th>IP</th><th>MAC</th></tr></thead><tbody>
          ${arpRows.map(([ip, mac]) => `<tr><td>${ip}</td><td>${mac}</td></tr>`).join('')}
         </tbody></table>`
      : `<p class="inspector__empty">ARP cache is empty — run "ARP resolve" to fill it.</p>`;

    const routeHtml = routes.length
      ? `<table class="tbl mono"><thead><tr><th>Destination</th><th>Via</th><th>Hops</th></tr></thead><tbody>
          ${routes.map(r => `<tr class="${r.via === 'unreachable' ? 'is-bad' : ''}">
              <td>${r.dest}</td><td>${r.via}</td><td>${r.hops === Infinity ? '∞' : r.hops}</td></tr>`).join('')}
         </tbody></table>`
      : '';

    box.innerHTML = `
      <div class="insp__head">
        <span class="insp__type insp__type--${d.type}">${d.type.toUpperCase()}</span>
        <b>${d.label}</b>
        <span class="pill ${d.dead ? 'pill--bad' : 'pill--good'}">${d.dead ? 'DOWN' : 'UP'}</span>
      </div>

      <dl class="kv mono">
        <dt>IP</dt><dd>${(d.ips || [d.ip]).join('<br>')}</dd>
        <dt>MAC</dt><dd>${d.mac}</dd>
        <dt>Subnet</dt><dd>192.168.${d.subnet === 0 ? 1 : d.subnet}.0/24</dd>
        ${d.gateway ? `<dt>Gateway</dt><dd>${d.gateway}</dd>` : ''}
        <dt>Cables</dt><dd>${degree} live / ${used} plugged</dd>
        <dt>Ports</dt><dd>${portHtml}</dd>
      </dl>

      <button class="btn btn--sm btn--wide" id="btnEditFromInsp">✎ Edit this device</button>

      ${gearHtml}
      ${svcHtml}

      ${isSpof ? `<div class="warnbox">⚠ This device is a <b>single point of failure</b> — Tarjan's articulation-point test flagged it. Remove it and the network breaks apart.</div>` : ''}

      <h3 class="insp__sub">Recent packets</h3>
      ${seenHtml}

      <h3 class="insp__sub">ARP cache</h3>
      ${arpHtml}

      <h3 class="insp__sub">Routing table</h3>
      ${routeHtml}`;

    const edit = $('btnEditFromInsp');
    if (edit) edit.addEventListener('click', () => openEditDialog(d));
    const rulesBtn = $('btnRulesFromInsp');
    if (rulesBtn) rulesBtn.addEventListener('click', () => openRulesDialog(d));
  }

  /* ---------------------------------------------------------
     PACKET RECORD -> HTML

     Har entry ek asli frame ka khaka hai: kaun se do MAC ke beech,
     kaun se do IP ke beech, kitna bada, aur TTL kitna bacha. Yahi
     cheezein Wireshark me bhi sabse pehle dikhti hain.
     --------------------------------------------------------- */
  const DIR_LABEL = { sent: 'Sent', received: 'Received', forwarded: 'Forwarded',
                      heard: 'Heard', blocked: 'Blocked' };

  function packetRow(p) {
    const hop = (p.hop !== null && p.hops !== null)
      ? `hop ${p.hop} of ${p.hops}` : 'broadcast';
    return `<details class="pkt pkt--${p.kind}">
      <summary>
        <span class="pkt__dir">${DIR_LABEL[p.dir] || p.dir}</span>
        <span class="pkt__proto">${p.proto}</span>
        <span class="pkt__time mono">${p.time}</span>
      </summary>
      <dl class="kv kv--tight mono">
        <dt>From</dt><dd>${p.fromLabel} · ${p.fromIp}<br>${p.fromMac}</dd>
        <dt>To</dt><dd>${p.toLabel} · ${p.toIp}<br>${p.toMac}</dd>
        ${p.question ? `<dt>Asks</dt><dd>${p.question}</dd>` : ''}
        ${p.hint ? `<dt>Why</dt><dd>${p.hint}</dd>` : ''}
        ${p.port ? `<dt>Port</dt><dd>${p.port}</dd>` : ''}
        <dt>Size</dt><dd>${p.bytes} bytes</dd>
        ${p.ttl !== null ? `<dt>TTL</dt><dd>${p.ttl}</dd>` : ''}
        <dt>Position</dt><dd>${hop}</dd>
      </dl>
    </details>`;
  }

  /* ---------------------------------------------------------
     LOG
     --------------------------------------------------------- */
  function log(msg, kind = '') {
    const ul = $('eventLog');
    const li = document.createElement('li');
    li.className = `log__item ${kind ? 'log__item--' + kind : ''}`;
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(3);
    li.innerHTML = `<span class="log__time">${time}</span> ${msg}`;
    ul.prepend(li);
    // panel me ab zyada jagah hai, isliye lamba history rakh sakte hain
    while (ul.children.length > 80) ul.removeChild(ul.lastChild);
  }

  /* ---------------------------------------------------------
     SEND / ARP / COLLISION
     --------------------------------------------------------- */
  function computeRoute() {
    const algo = $('routeAlgo').value;
    const adj = Graph.build(state.devices, state.links);
    if (!state.src || !state.dst || state.src === state.dst) return null;
    return algo === 'dijkstra'
      ? Graph.dijkstra(adj, state.src, state.dst)
      : Graph.bfs(adj, state.src, state.dst);
  }

  /* Packet ko firewall tak udao aur wahin gira do */
  function dropAtFirewall(route, wall, label) {
    const at = new Map(state.devices.map(d => [d.id, d]));
    const fw = wall.at;
    const why = Sim.ruleText(wall.rule, at, wall.zones);

    const land = () => {
      engine.blast(fw.x, fw.y);
      log(`⛔ ${label} blocked by ${fw.label} — rule: "${why}"`, 'bad');
      fw.seen = fw.seen || [];
      fw.seen.unshift({
        time: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(3),
        kind: 'block', proto: label === 'ARP?' ? 'ARP request' : 'DATA', dir: 'blocked',
        fromLabel: at.get(route.path[0]).label, fromIp: at.get(route.path[0]).ip,
        fromMac: at.get(route.path[0]).mac,
        toLabel: at.get(route.path[route.path.length - 1]).label,
        toIp: at.get(route.path[route.path.length - 1]).ip,
        toMac: at.get(route.path[route.path.length - 1]).mac,
        hop: wall.index, hops: route.hops,
        bytes: label === 'ARP?' ? 64 : 1500, ttl: null,
        hint: `Dropped here — ${why}`,
      });
      if (fw.seen.length > 8) fw.seen.length = 8;
      renderInspector();
      setTimeout(clearRoute, 1400);
    };

    if (wall.index === 0) { land(); return; }

    // firewall tak ka adhoora raasta
    Sim.sendData(engine, {
      path: route.path.slice(0, wall.index + 1),
      linkPath: route.linkPath.slice(0, wall.index),
      hops: wall.index,
    }, { label, devices: state.devices, links: state.links, onDone: land });
  }

  function sendPacket() {
    const at = new Map(state.devices.map(d => [d.id, d]));
    const src = at.get(state.src), dst = at.get(state.dst);
    if (!src || !dst || src === dst) { log('Pick two different devices as source and destination', 'warn'); return; }
    if (src.dead || dst.dead) { log('Source or destination is down', 'bad'); return; }

    const route = computeRoute();
    if (!route) {
      log(`❌ ${src.label} → ${dst.label}: no route (the network is broken)`, 'bad');
      return;
    }

    clearRoute();
    route.linkPath.forEach(id => state.pathLinks.add(id));
    route.path.forEach(id => state.pathDevices.add(id));

    const algo = $('routeAlgo').value;
    const names = route.path.map(id => at.get(id).label).join(' → ');
    log(`${algo === 'dijkstra' ? 'Dijkstra' : 'BFS'} explored ${route.visitedOrder.length} devices · route: ${names}`, '');

    /* FIREWALL — packet ko chupchaap gayab nahi karte: use firewall TAK
       udaate hain aur wahin girate hain, taaki dikh sake ki rok kahan lagi.

       Data wali jaanch yahan nahi, DELIVER ke andar hai. Wajah: asli
       zindagi me pehle ARP hota hai, phir data. Agar rule sirf data rokta
       hai to ARP ko chalna chahiye aur data ko uske baad rukna chahiye —
       tabhi "block data" aur "block ARP" me farq dikhta hai. Pehle jaanch
       upar thi, to dono rule bilkul ek jaise dikhte the. */
    /* Data kis service par jaa raha hai. Har host kuch ports par sun raha
       hota hai; packet uski pehli service par jaata hai. Jo kuch sun hi
       nahi raha (jaise hub), uspar bhejna "connection refused" hai. */
    const svc = Sim.serviceOf(dst);

    const deliver = () => {
      const wall = Sim.firewallCheck(state.devices, state.links, route.path, 'data',
                                     svc ? svc.port : null);
      if (wall.blocked) return dropAtFirewall(route, wall, 'DATA');
      return Sim.sendData(engine, route, {
        label: svc ? `:${svc.port}` : 'DATA',
        port: svc ? svc.port : null,
        devices: state.devices,        // taaki har hop apna packet record likh sake
        links: state.links,            // hub/AP flooding ke liye
        onDone: () => {
          const extra = route.cost !== undefined ? ` · cost ${route.cost}` : '';
          if (!svc) {
            log(`⚠ Reached ${dst.label}, but it is not listening on any port — connection refused`, 'warn');
          } else {
            log(`✅ Delivered to ${dst.label}:${svc.port} (${svc.name}) — ${route.hops} hops${extra}`, 'good');
          }
          setTimeout(clearRoute, 1400);
        },
      });
    };

    // asli zindagi: MAC pata nahi to pehle ARP, phir data
    /* Kiska MAC chahiye? Apne subnet me ho to destination ka, warna
       GATEWAY ka — machine apne subnet ke bahar kabhi ARP nahi karti.
       Ye seedha isi baat se nikalta hai ki router broadcast rok deta
       hai, isliye door wale host ka ARP pahunchta hi nahi. */
    const need = Sim.arpTargetFor(state.devices, src.id, dst.id);
    const who = need.target;

    if (who && !src.arp.has(who.ip)) {
      const arpPath = Graph.bfs(state.adj, src.id, who.id);
      const arpWall = arpPath
        ? Sim.firewallCheck(state.devices, state.links, arpPath.path, 'arp')
        : { blocked: false };
      if (arpWall.blocked) return dropAtFirewall(arpPath, arpWall, 'ARP?');

      log(need.viaGateway
        ? `${dst.ip} is on another subnet, so ${src.label} does not ARP for it — it asks for its gateway ${who.ip} instead`
        : `ARP cache miss — the MAC for ${who.ip} is unknown, so a broadcast goes out first`, 'warn');

      const ok = Sim.sendArp(engine, Graph.build(state.devices, state.links),
        state.devices, state.links, src.id, who.id, () => {
          log(`ARP resolved — ${who.ip} is at ${who.mac}`, 'good');
          deliver();
        }, (stoppedAt) => {
          log(`The ARP broadcast stopped at ${stoppedAt.join(', ')} — a router is the edge of a broadcast domain`, 'warn');
        });
      if (!ok) log('The ARP broadcast reached nobody', 'bad');
    } else {
      log(`ARP cache hit — the MAC for ${who ? who.ip : dst.ip} is already known, sending straight away`, 'good');

      /* Agar koi rule ARP rokta hai par cache pehle se bhara hai, to ARP
         hoga hi nahi aur rule kabhi lagega hi nahi. Ye baat chupi rahe to
         lagta hai firewall kaam nahi kar raha — isliye saaf keh dete hain. */
      const arpWall = Sim.firewallCheck(state.devices, state.links, route.path, 'arp');
      if (arpWall.blocked) {
        log(`${arpWall.at.label} would have blocked the ARP, but no ARP was needed — clear ${src.label}'s cache to see that rule work`, 'warn');
      }
      deliver();
    }
  }

  function doArp() {
    const at = new Map(state.devices.map(d => [d.id, d]));
    const src = at.get(state.src), dst = at.get(state.dst);
    if (!src || !dst || src === dst) { log('Pick two different devices as source and destination', 'warn'); return; }
    src.arp.delete(dst.ip);

    /* Yahan bhi firewall se poochhna ZAROORI hai. Pehle ye jaanch sirf
       "Send packet" me thi, to ARP-rok wala rule is button se poori tarah
       bypass ho jaata tha — aur upar se MAC cache me chala jaata tha,
       jisse agla Send packet bhi nikal jaata (ARP ki zarurat hi nahi
       bachti thi). Ek hi rule do jagah se lagta hai, to jaanch bhi dono
       jagah honi chahiye. */
    const arpRoute = computeRoute();
    if (arpRoute) {
      const wall = Sim.firewallCheck(state.devices, state.links, arpRoute.path, 'arp');
      if (wall.blocked) { dropAtFirewall(arpRoute, wall, 'ARP?'); return; }
    }

    log(`ARP broadcast: "Who has ${dst.ip}? Tell ${src.ip}"`, 'warn');
    const ok = Sim.sendArp(engine, Graph.build(state.devices, state.links),
      state.devices, state.links, src.id, dst.id, () => {
        log(`ARP reply: "${dst.ip} is at ${dst.mac}" — cached`, 'good');
        renderInspector();
      });
    if (!ok) log('The broadcast never reached the destination — the network is broken', 'bad');
  }

  function doCollision() {
    const hosts = state.devices.filter(d => !d.dead && Topologies.isHost(d.type));
    if (hosts.length < 3) { log('The collision demo needs at least 3 devices', 'warn'); return; }
    const target = state.devices.find(d => d.id === state.dst && !d.dead) || hosts[hosts.length - 1];
    const senders = hosts.filter(d => d.id !== target.id).slice(0, 2);

    /* Ye demo bhi asli data bhejta hai, to firewall isi par bhi lagna
       chahiye — warna ek hi rule kahin lagta aur kahin nahi lagta. */
    const adj = Graph.build(state.devices, state.links);
    for (const snd of senders) {
      const r = Graph.bfs(adj, snd.id, target.id);
      if (!r) continue;
      const wall = Sim.firewallCheck(state.devices, state.links, r.path, 'data');
      if (wall.blocked) {
        log(`⛔ The collision demo cannot run — ${wall.at.label} blocks ${snd.label} → ${target.label} ("${Sim.ruleText(wall.rule, new Map(state.devices.map(d => [d.id, d])), wall.zones)}")`, 'bad');
        return;
      }
    }
    Sim.collisionDemo(engine, Graph.build(state.devices, state.links),
      state.devices, state.links, senders[0].id, senders[1].id, target.id, log);
  }

  /* ---------------------------------------------------------
     ANALYSIS — CAPACITY (max-flow / min-cut) aur CHEAPEST WIRING (MST)

     Dono hisaab flow.js karta hai, jo DOM se aazad hai aur alag se test
     hota hai. Yahan sirf sawaal poochha jaata hai aur jawab dikhaya
     jaata hai.

     Ye maang par chalte hain, har frame par nahi: max-flow har jodde par
     Edmonds-Karp chalata hai, jo baaki metrics se kaafi bhaari hai.
     --------------------------------------------------------- */
  function clearOverlays() {
    state.cutLinks = new Set();
    state.mstEdges = null;
  }

  function runCapacity() {
    const at = new Map(state.devices.map(d => [d.id, d]));
    const src = at.get(state.src), dst = at.get(state.dst);
    const box = $('analysis');
    clearOverlays();

    if (!src || !dst || src === dst) {
      box.innerHTML = `<p class="inspector__empty">Pick two different devices as source and destination first.</p>`;
      renderScene(performance.now());
      return;
    }

    const r = Flow.maxFlow(state.devices, state.links, src.id, dst.id);
    state.cutLinks = new Set(r.cut);

    const names = id => (at.get(id) || {}).label || '?';
    const cutNames = r.cut.map(id => {
      const l = state.links.find(x => x.id === id);
      return l ? `${names(l.a)}↔${names(l.b)}` : '?';
    });

    let verdict;
    if (r.flow === 0) {
      verdict = `<div class="anly__note anly__note--warn">There is no route between them at all — the network is already split here.</div>`;
    } else if (r.flow === 1) {
      verdict = `<div class="anly__note anly__note--warn">Only one route. Cutting the single cable below disconnects ${src.label} from ${dst.label} completely.</div>`;
    } else {
      verdict = `<div class="anly__note anly__note--good">${r.flow} routes that share no cable. All ${r.flow} of the cables below would have to be cut at once to separate them.</div>`;
    }

    box.innerHTML = `
      <div class="anly__head">
        <span class="anly__big">${r.flow}</span>
        <span class="anly__unit">independent route${r.flow === 1 ? '' : 's'} · ${src.label} → ${dst.label}</span>
      </div>
      ${verdict}
      ${r.cut.length ? `<dl class="kv mono">
        <dt>Min cut</dt><dd class="anly__cut">${cutNames.join('<br>')}</dd>
      </dl>` : ''}
      ${r.paths.length ? `<ul class="anly__paths">${r.paths
        .map(p => `<li>${p.map(names).join(' → ')}</li>`).join('')}</ul>` : ''}`;

    log(`Capacity ${src.label} → ${dst.label}: ${r.flow} independent route${r.flow === 1 ? '' : 's'}${
      r.cut.length ? `, min cut ${cutNames.join(', ')}` : ''}`, r.flow > 1 ? 'good' : 'warn');
    renderScene(performance.now());
  }

  function runCheapestWiring() {
    const box = $('analysis');
    clearOverlays();

    const rep = Flow.cableReport(state.devices, state.links);
    if (rep.devices < 2) {
      box.innerHTML = `<p class="inspector__empty">Needs at least two live devices.</p>`;
      renderScene(performance.now());
      return;
    }

    state.mstEdges = rep.edges;

    const saved = Math.round(rep.savingMetres);
    const pct = rep.currentMetres > 0
      ? Math.round((rep.savingMetres / rep.currentMetres) * 100) : 0;

    /* MST ko "behtar" kehna galat hoga — usme koi redundancy nahi hoti,
       har cable ek bridge hai. Isliye ise paimana batate hain, sujhaav
       nahi. */
    const verdict = saved > 0
      ? `<div class="anly__note">Your layout uses <b>${saved} m more cable</b> than the shortest possible tree (${pct}% extra). That is not automatically waste — a minimum spanning tree has no spare route anywhere, so every one of its cables is a single point of failure.</div>`
      : `<div class="anly__note anly__note--good">Your cabling is already as short as a spanning tree can be. That also means there is no redundancy left to lose.</div>`;

    box.innerHTML = `
      <div class="anly__head">
        <span class="anly__big">${Math.round(rep.mstMetres)}<span class="anly__unit"> m</span></span>
        <span class="anly__unit">cheapest possible · ${rep.mstCables} cables</span>
      </div>
      <dl class="kv mono">
        <dt>Your layout</dt><dd>${Math.round(rep.currentMetres)} m · ${rep.currentCables} cables</dd>
        <dt class="anly__mst">Shortest tree</dt><dd class="anly__mst">${Math.round(rep.mstMetres)} m · ${rep.mstCables} cables</dd>
        <dt>Difference</dt><dd>${saved > 0 ? `+${saved} m · +${rep.extraCables} cables` : 'none'}</dd>
      </dl>
      ${verdict}`;

    log(`Cheapest wiring: ${Math.round(rep.mstMetres)} m with ${rep.mstCables} cables, against ${Math.round(rep.currentMetres)} m now`, 'good');
    renderScene(performance.now());
  }

  /* ---------------------------------------------------------
     PNG EXPORT

     Browser me file "save" karne ka tareeka yahi hai: ek <a download>
     banao, uspar click karo, hata do. Naam me topology aur device count
     daal dete hain taaki kai tasveerein saath rakhne par pata rahe
     kaunsi kis cheez ki hai.
     --------------------------------------------------------- */
  function exportPNG() {
    const url = view.toPNG({
      devices: state.devices,
      links: state.links,
      spof: state.spof,
      islandOf: state.islandOf,
      packets: [],
      blasts: [],
      mstEdges: state.mstEdges,
      ui: {
        hoverDevice: null, hoverLink: null, selected: null,
        src: state.src, dst: state.dst,
        pathLinks: state.pathLinks, pathDevices: state.pathDevices,
        cutLinks: state.cutLinks, linkPreview: null,
        showIps: state.showIps,
      },
    });

    if (!url) { log('Nothing to export — the canvas is empty', 'warn'); return; }

    if (window.VeyraNative && typeof window.VeyraNative.savePng === 'function') {
      window.VeyraNative.savePng(url);
      log('Diagram exported to Android Downloads', 'good');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = `topolab-${state.kind}-${state.devices.length}-devices.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    log(`Diagram saved as ${a.download}`, 'good');
  }

  /* ---------------------------------------------------------
     ADVISOR

     "Itne devices hain, ye cheezein maayne rakhti hain — kya banaun?"

     UI ka kaam sirf sawaal poochhna aur jawab dikhana hai. Poora hisaab
     advisor.js karta hai, jo DOM se aazad hai aur alag se test hota hai.
     Isliye yahan koi score ka formula nahi likha — warna do jagah do
     alag jawab ban jaate.
     --------------------------------------------------------- */
  const adviseModal = $('adviseModal');

  function buildAdvisorForm() {
    $('advPrefs').innerHTML = Advisor.CRITERIA.map(c => {
      const m = Advisor.CRITERIA_META[c];
      return `<div class="advpref">
        <span>
          <span class="advpref__name">${m.name}</span><br>
          <span class="advpref__hint">${m.hint}</span>
        </span>
        <select data-pref="${c}">
          ${Advisor.LEVELS.map(l =>
            `<option value="${l}"${l === 'medium' ? ' selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('')}
        </select>
      </div>`;
    }).join('');

    $('advPrefs').querySelectorAll('select')
      .forEach(sel => sel.addEventListener('change', runAdvisor));
  }

  function currentPrefs() {
    const p = {};
    $('advPrefs').querySelectorAll('select').forEach(sel => { p[sel.dataset.pref] = sel.value; });
    return p;
  }

  function runAdvisor() {
    const n = +$('advCount').value;
    $('advCountVal').textContent = n;

    const result = Advisor.recommend(n, currentPrefs());
    const win = result.winner;
    const meta = Topologies.META[win.kind];

    $('advWinner').innerHTML = `
      <div class="advwin__head">
        <span class="advwin__ico">${meta.icon}</span>
        <span class="advwin__name">${meta.name}</span>
        <span class="advwin__score">match <b>${win.score}</b>/100</span>
      </div>
      <p class="advwin__blurb">${meta.blurb}</p>
      <ul class="advwin__why">${result.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
      <button class="btn btn--primary advwin__build" id="btnAdvBuild">Build this ${meta.name.toLowerCase()} with ${n} devices</button>`;

    $('btnAdvBuild').addEventListener('click', () => {
      closeAdvisor();
      $('nodeCount').value = n;
      $('nodeCountVal').textContent = n;
      regenerate(win.kind, n);
      log(`Advisor: built a ${meta.name.toLowerCase()} with ${n} devices`, 'good');
    });

    $('advTable').innerHTML = `
      <table class="advtable">
        <thead><tr>
          <th>Topology</th><th>Match</th><th>Cables</th><th>Cable</th>
          <th>Hops</th><th>Resilience</th><th>+1 device</th>
        </tr></thead>
        <tbody>
          ${result.rows.map((r, i) => `
            <tr class="${i === 0 ? 'is-win' : ''}">
              <td>${Topologies.META[r.kind].icon} ${Topologies.META[r.kind].name}${
                r.devices !== n ? ` <span class="advtable__note">${r.devices} devices min</span>` : ''}</td>
              <td><i class="advtable__bar"><b style="width:${r.score}%"></b></i>${r.score}</td>
              <td class="mono">${r.links}</td>
              <td class="mono">${Math.round(r.cableMetres)} m</td>
              <td class="mono">${r.avgHops.toFixed(2)}</td>
              <td class="mono">${Math.round(r.resilience)}</td>
              <td class="mono">${r.cablesPerNewDevice}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function openAdvisor() {
    $('advCount').value = state.count;
    runAdvisor();
    adviseModal.hidden = false;
  }

  const closeAdvisor = () => { adviseModal.hidden = true; };

  /* ---------------------------------------------------------
     TOPOLOGY PICKER (phone)

     Phone par chhe chips ek line me nahi aate. Wahan topbar me ek button
     hota hai jo poori list ek window me kholta hai — har topology ka naam,
     nishaan aur ek line ka matlab, taaki chunte waqt pata rahe ki kya
     chun rahe hain. Chips aur ye button dono ek hi regenerate() ko bulate
     hain, isliye dono raaste bilkul ek jaisa kaam karte hain.
     --------------------------------------------------------- */
  const topoModal = $('topoModal');

  /* Chalu topology ka nishaan HAMESHA state.kind se banta hai, kisi click
     handler se nahi.

     Pehle "is-active" class chip ke apne click handler me lagti thi. Uska
     matlab: topology kisi aur raaste se badli — advisor ka "Build this",
     ya phone ka picker — to chip purani hi highlighted rehti thi. Canvas
     par ring hota tha aur upar Star chamak raha hota tha. */
  function syncTopoUi() {
    const m = Topologies.META[state.kind];
    if (!m) return;
    document.querySelectorAll('#topoBar .topo').forEach(b =>
      b.classList.toggle('is-active', b.dataset.topo === state.kind));
    $('topoPickIco').textContent = m.icon;
    $('topoPickName').textContent = m.name;
  }

  function openTopoPicker() {
    $('topoList').innerHTML = Topologies.KINDS.map(k => {
      const m = Topologies.META[k];
      return `<button class="topocard${k === state.kind ? ' is-active' : ''}" data-kind="${k}">
        <span class="topocard__ico">${m.icon}</span>
        <span>
          <span class="topocard__name">${m.name}</span>
          <span class="topocard__blurb">${m.blurb}</span>
          ${k === state.kind ? '<span class="topocard__tag">CURRENT</span>' : ''}
        </span>
      </button>`;
    }).join('');

    $('topoList').querySelectorAll('.topocard').forEach(btn =>
      btn.addEventListener('click', () => {
        closeTopoPicker();
        regenerate(btn.dataset.kind, state.count);
      }));

    topoModal.hidden = false;
  }

  const closeTopoPicker = () => { topoModal.hidden = true; };

  /* ---------------------------------------------------------
     7. COMPARE MODE
     --------------------------------------------------------- */
  let compareOpen = false;
  let cmpA = null, cmpB = null;
  const cmpViewA = Render.create($('cmpCanvasA'), { mini: true });
  const cmpViewB = Render.create($('cmpCanvasB'), { mini: true });

  function analyse(gen) {
    const adj = Graph.build(gen.devices, gen.links);
    const spof = Graph.findSPOF(adj);
    return {
      ...gen,
      adj, spof,
      stats: Graph.stats(adj),
      res: Graph.resilience(gen.devices, gen.links),
      metres: Math.round(gen.links.reduce((s, l) => s + (l.metres || 0), 0)),
    };
  }

  function buildCompare() {
    const n = +$('cmpCount').value;
    $('cmpCountVal').textContent = n;

    try {
      const sa = cmpViewA.resize(), sb = cmpViewB.resize();
      cmpA = analyse(Topologies.generate($('cmpA').value, n, sa.w, sa.h));
      cmpB = analyse(Topologies.generate($('cmpB').value, n, sb.w, sb.h));
      // yaad rakho kis size ke liye layout bana tha — canvas ka size baad me
      // badla to drawCompare khud dobara bana lega
      cmpA.builtFor = sa; cmpB.builtFor = sb;

      // mini canvas par labels draw nahi hote, isliye padding chhoti chalegi
      const miniPad = { x: 26, top: 26, bottom: 26 };
      cmpViewA.fitTo(boundsOf(cmpA.devices, miniPad));
      cmpViewB.fitTo(boundsOf(cmpB.devices, miniPad));

      $('cmpLabelA').textContent = `${Topologies.META[cmpA.kind].name} — ${Topologies.META[cmpA.kind].blurb}`;
      $('cmpLabelB').textContent = `${Topologies.META[cmpB.kind].name} — ${Topologies.META[cmpB.kind].blurb}`;

      renderCompareTable();

      /* Canvas ko yahin, abhi draw karte hain — rAF loop ka intezaar nahi.
         rAF chhupe hue tab me rukta hai, aur compare me koi animation hai
         bhi nahi (devices seedha apni jagah par bante hain), isliye ek
         synchronous draw kaafi hai. */
      drawCompare(performance.now());

    } catch (err) {
      // khaali screen se behtar hai ki galti dikh jaaye
      console.error('Compare build fail:', err);
      cmpA = cmpB = null;
      $('cmpTable').innerHTML = `<p class="cmp__err">Could not build the comparison: <b>${err.message}</b></p>`;
      $('cmpVerdict').textContent = 'Try a hard refresh (Ctrl+Shift+R). If it persists, the full error is in the console.';
    }
  }

  const ROWS = [
    { key: 'cables',   label: 'Cables needed',       get: c => c.links.length,                 better: 'low'  },
    { key: 'metres',   label: 'Cable length',        get: c => c.metres, unit: ' m',            better: 'low'  },
    { key: 'avgHops',  label: 'Avg hops',            get: c => +c.stats.avgHops.toFixed(2),     better: 'low'  },
    { key: 'diameter', label: 'Diameter (worst hops)', get: c => c.stats.diameter,              better: 'low'  },
    { key: 'spof',     label: 'Single points of failure', get: c => c.spof.articulation.size,   better: 'low'  },
    { key: 'bridges',  label: 'Critical cables',     get: c => c.spof.bridges.size,             better: 'low'  },
    { key: 'redun',    label: 'Redundancy',          get: c => Math.round(c.res.redundancyPct), unit: '%', better: 'high' },
    { key: 'surv',     label: 'Worst-case survival', get: c => Math.round(c.res.survivalPct),   unit: '%', better: 'high' },
    { key: 'score',    label: 'Resilience score',    get: c => Math.round(c.res.score),         better: 'high' },
  ];

  function renderCompareTable() {
    const rows = ROWS.map(r => {
      const a = r.get(cmpA), b = r.get(cmpB);
      let aw = '', bw = '';
      if (a !== b) {
        const aBetter = r.better === 'low' ? a < b : a > b;
        aw = aBetter ? 'is-win' : 'is-lose';
        bw = aBetter ? 'is-lose' : 'is-win';
      }
      return `<tr>
        <td class="${aw} mono">${a}${r.unit || ''}</td>
        <th>${r.label}</th>
        <td class="${bw} mono">${b}${r.unit || ''}</td>
      </tr>`;
    }).join('');

    $('cmpTable').innerHTML = `
      <table class="cmp">
        <thead><tr>
          <th class="mono">${Topologies.META[cmpA.kind].name}</th>
          <th></th>
          <th class="mono">${Topologies.META[cmpB.kind].name}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    const A = Topologies.META[cmpA.kind], B = Topologies.META[cmpB.kind];
    const scoreA = cmpA.res.score, scoreB = cmpB.res.score;
    const cheapA = cmpA.links.length <= cmpB.links.length;
    const tough = scoreA > scoreB ? A : B;
    const cheap = cheapA ? A : B;

    $('cmpVerdict').innerHTML = tough.name === cheap.name
      ? `<b>${tough.name} wins on every count</b> — more resilience for less cable. That is exactly why it shows up in ${tough.realWorld}.`
      : `<b>${tough.name}</b> is the tougher of the two (${tough.pro.toLowerCase()}), but <b>${cheap.name}</b> is cheaper
         (${Math.min(cmpA.links.length, cmpB.links.length)} vs ${Math.max(cmpA.links.length, cmpB.links.length)} cables).
         The call comes down to whether downtime costs you more than cable does — which is why real companies
         reach for <b>Hybrid</b>: ${cheap.name.toLowerCase()} at the access layer, ${tough.name.toLowerCase()} on the backbone.`;
  }

  let rebuilding = false;

  function drawCompare(now) {
    // canvas ka size layout settle hone ke baad badal sakta hai. Aisa hua to
    // us naye size ke liye layout dobara banao — warna topology apne box se
    // bahar ya ek kone me sikud ke reh jaati hai.
    if (!rebuilding && cmpA && cmpB) {
      const stale = [[cmpViewA, cmpA], [cmpViewB, cmpB]].some(([v, c]) => {
        v.syncSize();
        const s = v.size();
        return !c.builtFor || Math.abs(c.builtFor.w - s.w) > 2 || Math.abs(c.builtFor.h - s.h) > 2;
      });
      if (stale) {
        rebuilding = true;               // buildCompare khud drawCompare bulata hai — loop se bachao
        buildCompare();
        rebuilding = false;
        return;
      }
    }

    for (const [v, c] of [[cmpViewA, cmpA], [cmpViewB, cmpB]]) {
      if (!c) continue;
      for (const d of c.devices) {
        d.x += (d.tx - d.x) * 0.2;
        d.y += (d.ty - d.y) * 0.2;
      }
      v.draw({
        devices: c.devices, links: c.links, spof: c.spof,
        islandOf: null, packets: [], blasts: [],
        ui: { pathLinks: new Set(), pathDevices: new Set(), hoverDevice: null, hoverLink: null, showIps: false },
      }, now);
    }
  }

  function openCompare() {
    compareOpen = true;
    $('compare').hidden = false;
    buildCompare();
  }

  /* Overlay khulte hi canvas ka size galat aa sakta hai (layout abhi
     settle nahi hua). RO baad me sahi size par dobara build kar deta hai. */
  new ResizeObserver(() => { if (compareOpen) buildCompare(); })
    .observe($('compare').querySelector('.compare__body'));

  function closeCompare() {
    compareOpen = false;
    $('compare').hidden = true;
  }

  /* ---------------------------------------------------------
     8. CONTROLS + INIT
     --------------------------------------------------------- */
  const TOOL_HINTS = {
    select: 'Drag devices to arrange them. Click one and the inspector shows its IP, MAC and routing table.',
    add:    'Click empty canvas to drop a new device. Drag from one device to another to run a cable between them.',
    chaos:  'Click any device or cable to kill it. Watch whether the network copes or falls apart.',
    delete: 'Click a device or cable to remove it for good.',
  };

  /* Add tool ka hint us par nirbhar karta hai ki abhi kya "add" hoga */
  function addHint() {
    if (state.addType === 'cable') {
      return 'Drag from one device to another to run a cable. Drop onto an existing cable to tap into it.';
    }
    const name = (Topologies.TYPES[state.addType] || Topologies.TYPES.pc).name;
    return `Click empty canvas to drop a ${name.toLowerCase()}, or click straight onto a cable to tap it into that line.`;
  }

  /* SELECT ab default haalat hai — uska koi button nahi.
     Chaos/Delete aur device chips sab TOGGLE hain: jo chalu hai usi par
     dobara click karo to wapas select mode aa jaata hai. */
  function setTool(tool) {
    state.tool = tool;
    state.linkFrom = null;
    state.linkPreview = null;
    closeCtx();

    document.querySelectorAll('#toolBar .tool').forEach(b =>
      b.classList.toggle('is-active', b.dataset.tool === tool));

    // add mode nahi hai to koi bhi device chip highlighted nahi rehna chahiye
    if (tool !== 'add') {
      document.querySelectorAll('#deviceTypes .chip').forEach(b => b.classList.remove('is-active'));
    }
    $('toolHint').textContent = tool === 'add' ? addHint() : TOOL_HINTS[tool];
    window.dispatchEvent(new CustomEvent('veyra:toolchange',{
      detail:{tool:state.tool,addType:state.addType}
    }));
  }

  function wire() {
    document.querySelectorAll('#topoBar .topo').forEach(btn => {
      // is-active regenerate() lagata hai, yahan nahi — dekho syncTopoUi()
      btn.addEventListener('click', () => regenerate(btn.dataset.topo, state.count));
    });

    // Chaos/Delete toggle hain — chalu wale par dobara click = select mode
    document.querySelectorAll('#toolBar .tool').forEach(btn =>
      btn.addEventListener('click', () =>
        setTool(state.tool === btn.dataset.tool ? 'select' : btn.dataset.tool)));

    // Device chips bhi toggle — chalu chip par dobara click = select mode
    document.querySelectorAll('#deviceTypes .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const already = state.tool === 'add' && state.addType === btn.dataset.dtype;
        if (already) { setTool('select'); return; }

        document.querySelectorAll('#deviceTypes .chip').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.addType = btn.dataset.dtype;
        setTool('add');                   // 'add' me setTool chips ko saaf nahi karta
      });
    });

    /* ---- left / right panel band-khol ----
       Column 0 hone se canvas bada ho jaata hai; canvas par laga
       ResizeObserver refit khud kar deta hai. */
    const workspace = document.querySelector('.workspace');
    function togglePanel(side, btn) {
      const cls = side === 'left' ? 'is-left-collapsed' : 'is-right-collapsed';
      const collapsed = workspace.classList.toggle(cls);
      btn.setAttribute('aria-pressed', String(!collapsed));
      renderScene(performance.now());
    }
    $('btnToggleLeft').addEventListener('click', e => togglePanel('left', e.currentTarget));
    $('btnToggleRight').addEventListener('click', e => togglePanel('right', e.currentTarget));

    $('nodeCount').addEventListener('input', (e) => {
      $('nodeCountVal').textContent = e.target.value;
    });
    $('nodeCount').addEventListener('change', (e) => regenerate(state.kind, +e.target.value));

    $('srcSelect').addEventListener('change', e => { state.src = e.target.value; clearRoute(); });
    $('dstSelect').addEventListener('change', e => { state.dst = e.target.value; clearRoute(); });

    $('btnSend').addEventListener('click', sendPacket);
    $('btnArp').addEventListener('click', doArp);
    $('btnCollide').addEventListener('click', doCollision);

    $('btnRepair').addEventListener('click', repairAll);
    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);

    $('btnReset').addEventListener('click', () => {
      state.devices.forEach(d => d.arp.clear());
      regenerate(state.kind, state.count);
    });

    $('btnZoomIn').addEventListener('click', () => nudgeZoom(1.25));
    $('btnZoomOut').addEventListener('click', () => nudgeZoom(1 / 1.25));
    $('btnZoomFit').addEventListener('click', () => { fitView(); renderScene(performance.now()); });

    $('btnCompare').addEventListener('click', openCompare);
    $('btnCloseCompare').addEventListener('click', closeCompare);

    // edit dialog
    $('editForm').addEventListener('submit', saveEditDialog);
    $('btnEditClose').addEventListener('click', closeEditDialog);
    $('btnEditCancel').addEventListener('click', closeEditDialog);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeEditDialog(); });

    // analysis + export
    $('btnFlow').addEventListener('click', runCapacity);
    $('btnMst').addEventListener('click', runCheapestWiring);
    $('btnExport').addEventListener('click', exportPNG);

    // advisor
    buildAdvisorForm();
    $('btnAdvise').addEventListener('click', openAdvisor);
    $('btnAdviseClose').addEventListener('click', closeAdvisor);
    $('advCount').addEventListener('input', runAdvisor);
    adviseModal.addEventListener('pointerdown', (e) => { if (e.target === adviseModal) closeAdvisor(); });

    // topology picker (phone)
    $('btnTopoPick').addEventListener('click', openTopoPicker);
    $('btnTopoClose').addEventListener('click', closeTopoPicker);
    topoModal.addEventListener('pointerdown', (e) => { if (e.target === topoModal) closeTopoPicker(); });

    // firewall rules dialog
    $('btnFwAdd').addEventListener('click', () => addRule());
    ['fwAction', 'fwProto', 'fwPort', 'fwFrom', 'fwTo'].forEach(id =>
      $(id).addEventListener('change', () => { fwDirty = true; $('fwErr').hidden = true; }));
    $('btnRulesClose').addEventListener('click', closeRulesDialog);
    $('btnRulesDone').addEventListener('click', closeRulesDialog);
    rulesModal.addEventListener('pointerdown', (e) => { if (e.target === rulesModal) closeRulesDialog(); });
    $('cmpA').addEventListener('change', buildCompare);
    $('cmpB').addEventListener('change', buildCompare);
    $('cmpCount').addEventListener('input', buildCompare);

    // compare ke dropdowns bharo
    const opts = Topologies.KINDS.map(k =>
      `<option value="${k}">${Topologies.META[k].name}</option>`).join('');
    $('cmpA').innerHTML = opts; $('cmpA').value = 'star';
    $('cmpB').innerHTML = opts; $('cmpB').value = 'mesh';

    // keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      /* Ye check INPUT wale check se PEHLE hai — Escape aksar kisi input
         ke andar se hi dabaya jaata hai, aur wahan se return ho jaate to
         dialog band hi na hota. */
      if (!modal.hidden || !rulesModal.hidden || !topoModal.hidden || !adviseModal.hidden) {
        if (e.key === 'Escape') {
          closeEditDialog(); closeRulesDialog(); closeTopoPicker(); closeAdvisor();
        }
        return;
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      /* Ctrl+Z / Ctrl+Y (aur Ctrl+Shift+Z, jo Mac/Linux ki aadat hai).
         Ye tool-shortcuts se PEHLE handle karte hain, warna 'z'/'y' neeche
         wale map me chala jaata. */
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
      }

      const map = { v: 'select', x: 'chaos', d: 'delete' };   // 'a' hata diya — Add ab chips se hota hai
      if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      if (e.key === ' ') { e.preventDefault(); sendPacket(); }
      if (e.key === 'Escape') { closeCtx(); if (compareOpen) closeCompare(); }
      if (e.key === 'f' || e.key === 'F') { fitView(); renderScene(performance.now()); }
      if (e.key === '+' || e.key === '=') nudgeZoom(1.25);
      if (e.key === '-' || e.key === '_') nudgeZoom(1 / 1.25);
      if (e.key === '[') $('btnToggleLeft').click();
      if (e.key === ']') $('btnToggleRight').click();
    });

    /* RESIZE
       Structure wahi rehta hai, bas positions ko proportionally kheench
       dete hain taaki layout naye canvas me fit ho jaaye.

       ResizeObserver use kiya hai, window.resize nahi — kyunki canvas ka
       size sirf window se nahi badalta: panels reflow ho sakte hain, page
       chhupi hui tab me khul sakta hai (jahan pehla measurement 0 aata
       hai), ya fonts load hone par layout khisak sakta hai. RO in sab par
       firing deta hai, window.resize sirf window par. */
    let lastW = 0, lastH = 0;

    function handleResize() {
      const { w, h } = view.resize();
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;

      /* Pehle yahan har device ki position ko proportionally kheencha jaata
         tha, kyunki layout canvas ke naap se bandha hua tha. Ab world
         coordinates apni jagah rehte hain aur sirf VIEW dobara fit hoti
         hai — isse cable lengths bhi nahi badalti (pehle window resize
         karne par "cable used" ka number badal jaata tha, jo galat tha). */
      if (!userMovedView) fitView();
      syncZoom();
      renderScene(performance.now());
      if (compareOpen) buildCompare();
    }

    /* CANVAS ko observe karo, stage ko nahi.

       Stage ek grid cell hai — uski height fix hai aur wo kabhi badalti
       hi nahi. Canvas uske andar ka lachila hissa hai, aur wo TAB-TAB
       chhota-bada hota hai jab:
         - banner pehli baar dikhta hai (shuruaat me wo hidden hota hai)
         - banner ki lambi line do row me wrap hoti hai
         - stage bar ya legend chhoti screen par wrap hote hain

       Pehle stage par lagi hui thi, isliye ye kabhi fire hi nahi hoti thi.
       Nateeja: view purane, bade canvas ke hisaab se fit rehti thi aur
       diagram ka neeche wala hissa canvas ke bahar kat jaata tha. */
    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);
    window.addEventListener('resize', handleResize);


    const first = view.size();
    lastW = first.w; lastH = first.h;
  }

  /* ---------- go ---------- */
  view.resize();
  wire();
  setTool('select');
  /* Debug hook. Browser console se network ki asli haalat dekhne ke liye:
     TopoLab.state.devices, TopoLab.state.links, TopoLab.view.toScreen(...)
     Isi se automated checks bhi chalte hain. UI ka koi hissa ise nahi
     padhta — sirf bahar dekhne ke liye hai. */

  /* Veyra Project API: checked, offline JSON import/export, source-compatible snapshots */
  window.VeyraProject = {
    dump() {
      return JSON.stringify({
        format: 'veyra-packetlab/1',
        topology: state.kind,
        snapshot: snapshot(),
      }, (_k, value) => value instanceof Map
        ? { __veyraMap: Array.from(value.entries()) } : value, 2);
    },
    load(raw) {
      if (typeof raw !== 'string' || raw.length > 4000000) throw new Error('Datei ist zu groß');
      const doc = JSON.parse(raw, (_k, v) =>
        v && Array.isArray(v.__veyraMap) ? new Map(v.__veyraMap) : v);
      if (!doc || doc.format !== 'veyra-packetlab/1' || !doc.snapshot)
        throw new Error('Kein Veyra PacketLab Projekt');
      const s = doc.snapshot;
      if (!Array.isArray(s.devices) || !Array.isArray(s.links) ||
          s.devices.length < 0 || s.devices.length > 60 || s.links.length > 800)
        throw new Error('Ungültiges oder zu großes Netzwerk');
      const allowed = new Set(['pc', 'laptop', 'server', 'nas', 'printer', 'switch', 'hub', 'ap', 'router', 'firewall', 'phone', 'camera', 'iot', 'plc', 'dns', 'dhcp', 'modem', 'loadbalancer', 'cloud', 'vpn', 'ids', 'wlc', 'ntp', 'mail', 'voip', 'hypervisor', 'database']);
      const ids = new Set();
      for (const d of s.devices) {
        if (!d || typeof d.id !== 'string' || d.id.length > 80 || ids.has(d.id) ||
            !allowed.has(d.type) || !Number.isFinite(d.tx) || !Number.isFinite(d.ty))
          throw new Error('Ungültiges Gerät in Projektdatei');
        ids.add(d.id);
        d.label = String(d.label || d.type).slice(0, 18).replace(/[<>&"']/g, '');
        d.arp = d.arp instanceof Map ? d.arp : new Map();
        d.macTable = d.macTable instanceof Map ? d.macTable : new Map();
        d.rules = Array.isArray(d.rules) ? d.rules.slice(0, 100) : [];
        d.services = Array.isArray(d.services) ? d.services.slice(0, 32) : [];
        d.seen = Array.isArray(d.seen) ? d.seen.slice(-8) : [];
      }
      for (const l of s.links) {
        if (!l || !ids.has(l.a) || !ids.has(l.b) || l.a === l.b)
          throw new Error('Ungültiges Kabel in Projektdatei');
      }
      s.src = ids.has(s.src) ? s.src : (s.devices[0] ? s.devices[0].id : null);
      s.dst = ids.has(s.dst) ? s.dst : (s.devices.length ? s.devices[Math.min(1, s.devices.length - 1)].id : null);
      pushHistory();
      state.kind = Topologies.KINDS.includes(doc.topology) ? doc.topology : 'star';
      state.count = s.devices.length;
      applySnapshot(s);
      syncTopoUi();
      fitView();
      log('Veyra PacketLab project restored: ' + state.devices.length + ' devices', 'good');
      window.dispatchEvent(new Event('veyra-project-loaded'));
      if (window.VeyraNative) window.VeyraNative.notifyUser('Netzwerk geladen');
      return true;
    },
    loadBase64(encoded) {
      try {
        const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
        return this.load(new TextDecoder('utf-8').decode(bytes));
      } catch (e) {
        log('Import error: ' + String(e.message).replace(/[<>&"']/g, ''), 'bad');
        if (window.VeyraNative) window.VeyraNative.notifyUser('Import fehlgeschlagen: ' + e.message);
        return false;
      }
    },
  };

  // Stable integration surface for PacketLab 0.3: leave TopoLab's working algorithms intact.
  window.VeyraCore = {
    state, view, engine, get snapshot() { return snapshot(); },
    regenerate, refresh, applySnapshot, pushHistory, addDevice, addLink,
    removeDevice(id) {
      const d=state.devices.find(x=>x.id===id);
      if(!d)return false;
      removeDevice(d);
      return true;
    },
    connectDevices(from,to) {
      if(!from||!to||from===to)return false;
      const before=state.links.length;
      addLink(from,to);
      return state.links.length===before+1;
    },
    editDevice(id) { const d = state.devices.find(x => x.id === id); if(d) openEditDialog(d); },
    sendPacket, doArp, repairAll, setTool, fitView, renderInspector,
    selectDevice(id) { state.selected = id; renderInspector(); },
    setPower(id, on) {
      const d = state.devices.find(x => x.id === id);
      if (!d || d.dead === !on) return false;
      toggleDeviceDead(d); return true;
    },
    empty() {
      pushHistory(); state.devices = []; state.links = [];
      state.src = null; state.dst = null; state.selected = null;
      state.kind = 'star'; state.count = 0;
      state.pathLinks.clear(); state.pathDevices.clear();
      engine.clear(); refresh(); fitView();
    },
    replace(nodes, links, src, dst) {
      pushHistory(); state.kind = 'hybrid'; state.count = nodes.length;
      applySnapshot({devices:nodes, links, src, dst}); fitView();
    },
    record(message, level='') { log(String(message).replace(/[<>&"']/g, ''), level); }
  };

  window.TopoLab = { state, view, engine, select: (id) => { state.selected = id; renderInspector(); } };

  regenerate('star', 8);
  log('TopoLab ready — pick a topology, or grab the Chaos tool and break something', 'good');
  requestAnimationFrame(frame);

})();
