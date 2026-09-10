/* MemoLogs page script. Everything bespoke lives here; the engine is untouched.
   Three parts: the 3D mark (hero + close), the demo scenario (computed from
   data in this file, labelled a sample on the page), and the decision record
   (the signature move: it fills as you read and only ever appends). */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var smallMQ = matchMedia('(max-width: 860px)');
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var smooth = function (x) { x = clamp01(x); return x * x * (3 - 2 * x); };
  var range = function (x, a, b) { return smooth((x - a) / (b - a)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  /* Act progress, read from the engine rather than back out of the cascade.
     --sc-p is published as a custom property for CSS to use, but asking for it
     with getComputedStyle is a synchronous style flush, and the engine has just
     dirtied :root in the same frame — so each of these calls was costing a full
     recalc of the document (~2ms measured), five times a frame. The engine
     already holds the number; take it from there and fall back to the property
     only if an element turns out not to be a mounted act. */
  /* A test hook, not a rendering input: only touch the DOM when it changes. */
  function verify(el, v) { if (el && el.__scv !== v) { el.__scv = v; el.setAttribute('data-sc-verify-state', v); } }

  var actIndex = null;
  function actRecord(el) {
    if (!actIndex) {
      var inst = window.ScrollCraft && window.ScrollCraft.instances[0];
      if (!inst) return null;                       // not mounted yet this frame
      actIndex = new Map();
      for (var i = 0; i < inst.acts.length; i++) actIndex.set(inst.acts[i].el, inst.acts[i]);
    }
    return actIndex.get(el) || null;
  }
  var pOf = function (el) {
    var a = actRecord(el);
    if (a) return a.p;
    return parseFloat(getComputedStyle(el).getPropertyValue('--sc-p')) || 0;
  };

  var heroAct = document.querySelector('[data-ml-hero]');
  var closeAct = document.querySelector('[data-ml-close]');
  var demoAct = document.querySelector('[data-ml-demo]');
  var heroStage = heroAct.querySelector('[data-sc-stage]');
  var snapAct = document.querySelector('[data-ml-act="snap"]');
  var snapStage = snapAct && snapAct.querySelector('.snap__stage');
  var closeStage = closeAct.querySelector('[data-sc-stage]');

  /* ======================================================= the 3D mark == */
  var views = {
    hero: document.querySelector('canvas[data-ml-view="hero"]'),
    close: document.querySelector('canvas[data-ml-view="close"]'),
    fw: document.querySelector('canvas[data-ml-view="fw"]'),
    bd: document.querySelector('canvas[data-ml-view="bd"]')
  };
  var gl = null;

  // exponential smoothing that behaves the same at 60fps and 144fps
  function damp(cur, to, tau, dt) { return cur + (to - cur) * (1 - Math.exp(-dt / tau)); }

  // Each visible canvas gets its own renderer, so every scene draws straight into
  // the pixels it is shown in at the device's real pixel ratio. (The previous
  // single offscreen renderer copied through a 2D canvas every frame: a GPU
  // readback per frame, and a 1.75x buffer stretched onto 2x screens.)
  function makeRenderer(canvas) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.82;
    r.setClearColor(0x000000, 0);
    return r;
  }
  var renderers = {};
  function rendererFor(name) {
    if (!renderers[name]) { try { renderers[name] = makeRenderer(views[name]); } catch (e) { return null; } }
    var R = renderers[name], rect = views[name].getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (R._w !== w || R._h !== h) { R._w = w; R._h = h; R.setSize(w, h, false); }
    return R;
  }

  function buildScene() {
    if (!window.THREE) return null;
    var renderer;
    try { renderer = rendererFor('hero'); } catch (e) { return null; }
    if (!renderer) return null;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.2, 10);

    scene.add(new THREE.HemisphereLight(0x6fe0cb, 0x06101c, 0.26));
    var key = new THREE.DirectionalLight(0xe6fffa, 0.95); key.position.set(4, 6, 5); scene.add(key);
    var rim = new THREE.DirectionalLight(0x2ef0cb, 0.6); rim.position.set(-5, 2, -3); scene.add(rim);
    var under = new THREE.PointLight(0x1fd9b6, 0.45, 30); under.position.set(0, -5, 4); scene.add(under);

    var bead = new THREE.MeshPhysicalMaterial({
      color: 0x12c4a2, roughness: 0.36, metalness: 0.0,
      clearcoat: 0.9, clearcoatRoughness: 0.2,
      emissive: 0x0a5a4d, emissiveIntensity: 0.22
    });
    var rodMat = new THREE.MeshPhysicalMaterial({ color: 0x12a58b, roughness: 0.5, metalness: 0.0, clearcoat: 0.5, emissive: 0x063d35, emissiveIntensity: 0.2 });
    var holeMat = new THREE.MeshStandardMaterial({ color: 0x07322f, roughness: 0.95, metalness: 0 });

    var group = new THREE.Group();
    scene.add(group);

    function makeBead(r) {
      var g = new THREE.Group();
      var s = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), bead);
      var hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.27, r * 0.27, r * 2.02, 32, 1, false), holeMat);
      hole.rotation.x = Math.PI / 2;
      g.add(s); g.add(hole);
      return g;
    }

    var HUB_R = 1.0, SAT_R = 0.76, DIST = 2.75;
    var hubMat = bead.clone();
    var hub = makeBead(HUB_R); hub.children[0].material = hubMat;
    group.add(hub);

    var angles = [90, 162, 18, 234, 306];
    var home = angles.map(function (a) { var t = a * Math.PI / 180; return new THREE.Vector3(Math.cos(t) * DIST, Math.sin(t) * DIST, 0); });
    // scattered starting positions, authored, not random: wide, uneven, some behind
    var away = [
      new THREE.Vector3(-0.6, 2.5, -2.4), new THREE.Vector3(-1.1, -0.9, -1.6), new THREE.Vector3(4.2, 3.4, -3.0),
      new THREE.Vector3(0.6, -3.0, -0.8), new THREE.Vector3(3.9, -1.3, -1.8)
    ];
    var sats = home.map(function () { var b = makeBead(SAT_R); group.add(b); return b; });

    var rods = home.map(function (v, i) {
      var len = DIST - HUB_R * 0.55 - SAT_R * 0.55;
      var geo = new THREE.CylinderGeometry(0.2, 0.2, len, 24, 1, false);
      geo.translate(0, len / 2, 0);            // pivot at the hub end
      var m = new THREE.Mesh(geo, rodMat);
      var dir = v.clone().normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.position.copy(dir.clone().multiplyScalar(HUB_R * 0.55));
      m.scale.set(1, 0.0001, 1);
      group.add(m);
      return m;
    });

    var state = { s: 0, c: 0, mode: 'hero', px: 0, py: 0, tx: 0, ty: 0, t: 0, beat: -1 };
    var tmp = new THREE.Vector3();

    function update(dt) {
      state.t += dt;
      var s = state.s, c = state.c, t = state.t;
      var mobile = smallMQ.matches;
      // hub
      var hs = lerp(0.42, 1, range(s, 0, 0.55));
      hub.scale.setScalar(hs);
      // satellites drift while loose, lock while ordered
      for (var i = 0; i < 5; i++) {
        var k = range(s, 0.05 + i * 0.07, 0.62 + i * 0.07);
        tmp.copy(away[i]); if (mobile) { tmp.y = tmp.y < 0 ? tmp.y * 0.45 + 0.6 : tmp.y * 0.8; tmp.x *= 0.8; } else { tmp.x += 1.5; }
        tmp.lerp(home[i], k);
        var loose = 1 - k;
        tmp.x += Math.sin(t * 0.7 + i * 1.7) * 0.35 * loose;
        tmp.y += Math.cos(t * 0.55 + i * 2.3) * 0.3 * loose;
        tmp.z += Math.sin(t * 0.4 + i) * 0.4 * loose;
        sats[i].position.copy(tmp);
        sats[i].rotation.set(0.3 * loose * Math.sin(t + i), 0.4 * loose * Math.cos(t * 0.8 + i), 0);
        sats[i].scale.setScalar(lerp(0.82, 1, k));
        // rods: the four that exist in the mark; the fifth only appears at the close
        var rk = i === 0 ? 0 : range(s, 0.38 + i * 0.05, 0.86 + i * 0.03);
        rods[i].scale.set(1, Math.max(rk, 0.0001), 1);
        rods[i].visible = rk > 0.02;
      }
      // the three beats of the hero copy light their part of the mark: satellites (Prove), rods (Act), hub (Remember)
      var b = state.mode === 'hero' ? state.beat : -1, pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      bead.emissiveIntensity += (((b === 0) ? 0.5 + 0.25 * pulse : 0.22) - bead.emissiveIntensity) * 0.08;
      rodMat.emissiveIntensity += (((b === 1) ? 0.7 + 0.3 * pulse : 0.2) - rodMat.emissiveIntensity) * 0.08;
      hubMat.emissiveIntensity += (((b === 2) ? 0.6 + 0.3 * pulse : 0.22) - hubMat.emissiveIntensity) * 0.08;
      // group pose
      var settled = range(s, 0.2, 0.9);
      var idle = 0.05 * Math.sin(t * 0.35);
      var targetRy = lerp(-0.85, 0.0, settled) + idle + state.px * 0.28;
      var targetRx = lerp(0.35, 0.08, settled) - state.py * 0.18;
      group.rotation.y += (targetRy - group.rotation.y) * 0.08;
      group.rotation.x += (targetRx - group.rotation.x) * 0.08;
      if (state.mode === 'close') {
        group.rotation.y += ((0.0 + state.px * 0.2 + idle * 0.5) - group.rotation.y) * 0.08;
        group.rotation.x += ((0.04 - state.py * 0.1) - group.rotation.x) * 0.08;
      }
      // placement
      var gx, gy, cz, look = 0.55;
      if (mobile) {
        gx = 0; gy = lerp(8.8, 7.5, settled); cz = lerp(33, 34, settled);
        if (state.mode === 'close') { gx = 0; gy = 10.6; cz = 37; }
      } else if (state.mode === 'close') {
        gy = -0.8; cz = 18.6;
        gx = (0.69 - 0.5) * 2 * cz * Math.tan(camera.fov * Math.PI / 360) * (camera.aspect || 1.6) / (1 - look);
      } else {
        gy = lerp(0.1, 0.5, settled); cz = lerp(15.0, 18.2, settled);
        // Aim for a screen position, not a world offset: a fixed world x reads as
        // centred on a wide monitor and off-canvas on a laptop. Solve for the x that
        // lands the mark's centre at `fx` of the viewport width at this distance.
        var wHalf = cz * Math.tan(camera.fov * Math.PI / 360) * (camera.aspect || 1.6);
        var fx = reduce ? 0.72 : lerp(0.66, 0.72, settled);
        gx = (fx - 0.5) * 2 * wHalf / (1 - look);
      }
      group.position.set(gx, gy, 0);
      camera.position.z += (cz - camera.position.z) * 0.1;
      camera.lookAt(gx * look, gy * 0.5, 0);
    }

    function size(w, h) {
      if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    }

    return { renderer: renderer, scene: scene, camera: camera, update: update, size: size, state: state };
  }


  /* ============================================ the 3D decision loop == */
  function buildLoopScene(renderer) {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0x6fe0cb, 0x06101c, 0.28));
    var key = new THREE.DirectionalLight(0xe6fffa, 0.95); key.position.set(4, 7, 5); scene.add(key);
    var rim = new THREE.DirectionalLight(0x2ef0cb, 0.55); rim.position.set(-5, 3, -4); scene.add(rim);
    var packetLight = new THREE.PointLight(0x2ef0cb, 0.9, 6); scene.add(packetLight);

    var beadOn = new THREE.MeshPhysicalMaterial({ color: 0x12c4a2, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: 0x0a5a4d, emissiveIntensity: 0.22 });
    var beadOff = new THREE.MeshPhysicalMaterial({ color: 0x0f3a3a, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, emissive: 0x041a1a, emissiveIntensity: 0.3 });
    var beadActive = new THREE.MeshPhysicalMaterial({ color: 0x2ef0cb, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, emissive: 0x1a9c86, emissiveIntensity: 0.55 });
    var beadAmber = new THREE.MeshPhysicalMaterial({ color: 0xf3c969, roughness: 0.4, clearcoat: 0.8, emissive: 0x7a5a1a, emissiveIntensity: 0.35 });
    var beadAmberOn = new THREE.MeshPhysicalMaterial({ color: 0xffd97a, roughness: 0.35, clearcoat: 0.9, emissive: 0xc08a1c, emissiveIntensity: 0.6 });
    var holeMat = new THREE.MeshStandardMaterial({ color: 0x07322f, roughness: 0.95 });
    var ringMat = new THREE.MeshPhysicalMaterial({ color: 0x0c2b30, roughness: 0.6, clearcoat: 0.4, emissive: 0x03110f, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    var fillMat = new THREE.MeshPhysicalMaterial({ color: 0x1fd9b6, roughness: 0.35, clearcoat: 0.8, emissive: 0x15a58a, emissiveIntensity: 0.5 });
    var spokeMat = new THREE.MeshStandardMaterial({ color: 0x1fd9b6, roughness: 0.5, emissive: 0x0d6b59, emissiveIntensity: 0.3, transparent: true, opacity: 0.25 });
    var packetMat = new THREE.MeshPhysicalMaterial({ color: 0xeafff9, roughness: 0.2, clearcoat: 1, emissive: 0x9ffbe8, emissiveIntensity: 0.9 });

    var group = new THREE.Group(); scene.add(group);
    var R = 3.1, NODE_R = 0.46, HUB_R = 0.78;
    function ringPos(u) { var a = (-90 + u * 60) * Math.PI / 180; return new THREE.Vector3(R * Math.cos(a), 0, R * Math.sin(a)); }
    function bead(r, mat) {
      var g = new THREE.Group();
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat);
      var hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.27, r * 0.27, r * 2.02, 24, 1, false), holeMat);
      hole.rotation.x = 0.95; // faces the tilted camera
      g.add(m); g.add(hole); g.userData.mesh = m;
      return g;
    }
    // base ring
    var ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.075, 12, 96), ringMat);
    ring.rotation.x = Math.PI / 2; group.add(ring);
    // hub
    var hub = bead(HUB_R, beadOn); group.add(hub);
    // nodes
    var nodes = [], nodePos = [];
    for (var i = 0; i < 6; i++) { var pnt = ringPos(i); nodePos.push(pnt); var b = bead(NODE_R, beadOff); b.position.copy(pnt); group.add(b); nodes.push(b); }
    // arcs: tube i from node i to node i+1, drawn via draw range
    var arcs = [];
    for (i = 0; i < 6; i++) {
      (function (i) {
        var pts = [];
        for (var k = 0; k <= 32; k++) { var u = i + 0.14 + (k / 32) * 0.72; pts.push(ringPos(u)); }
        var curve = new THREE.CatmullRomCurve3(pts);
        var geo = new THREE.TubeGeometry(curve, 32, 0.13, 10, false);
        var m = new THREE.Mesh(geo, fillMat); m.visible = false; group.add(m);
        arcs.push({ mesh: m, total: geo.index.count });
      })(i);
    }
    // a small lit cap where each completed arc meets its node, instead of arrow cones
    var heads = [];
    for (i = 0; i < 6; i++) {
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), fillMat);
      cap.position.copy(ringPos(i + 0.86)); cap.visible = false;
      group.add(cap); heads.push(cap);
    }
    // one continuous outer guide ring: the three verb arcs used to sit here and read
    // as broken hoops, so the pairing now lives in the caption strip instead
    var guideMat = new THREE.MeshBasicMaterial({ color: 0x1a8f7a, transparent: true, opacity: 0.22 });
    var guide = new THREE.Mesh(new THREE.TorusGeometry(R + 0.62, 0.028, 8, 128), guideMat);
    guide.rotation.x = Math.PI / 2; guide.position.y = -0.05; group.add(guide);
    // gate bead on arc 2 (Decide -> Act)
    var gate = new THREE.Mesh(new THREE.SphereGeometry(0.26, 28, 20), beadAmber);
    var gatePos = ringPos(2.5); gate.position.copy(gatePos); group.add(gate);
    // spokes: Learn -> hub, hub -> Evaluate
    function spoke(a, b) {
      var dir = b.clone().sub(a); var len = dir.length();
      var geo = new THREE.CylinderGeometry(0.05, 0.05, len, 10, 1, false); geo.translate(0, len / 2, 0);
      var m = new THREE.Mesh(geo, spokeMat.clone()); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); m.position.copy(a);
      group.add(m); return m;
    }
    var spokeIn = spoke(nodePos[5].clone().multiplyScalar(0.82), new THREE.Vector3(0, 0, 0).add(nodePos[5].clone().normalize().multiplyScalar(HUB_R * 1.1)));
    var spokeOut = spoke(new THREE.Vector3(0, 0, 0).add(nodePos[1].clone().normalize().multiplyScalar(HUB_R * 1.1)), nodePos[1].clone().multiplyScalar(0.82));
    // packet
    var packet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), packetMat); group.add(packet);
    var packetGlow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), new THREE.MeshBasicMaterial({ color: 0x2ef0cb, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); packet.add(packetGlow);
    // a short trail behind the packet so its motion reads even between frames
    var trail = [];
    for (i = 0; i < 6; i++) {
      var tmesh = new THREE.Mesh(new THREE.SphereGeometry(0.15 - i * 0.02, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9ffbe8, transparent: true, opacity: 0.16 - i * 0.022, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      group.add(tmesh); trail.push(tmesh);
    }

    // pose: a tilted disc, like a table seen from a standing viewer
    group.rotation.x = 0.02;
    var st = { t: 0, px: 0, py: 0 };
    function update(f, dt, pointer) {
      st.t += dt;
      var mobile = smallMQ.matches;
      camera.position.set(0, mobile ? 9.6 : 9.3, mobile ? 15.2 : 13.2);
      camera.lookAt(0, -0.25, 0);
      group.rotation.y = 0.04 * Math.sin(st.t * 0.3) + (pointer ? pointer.px * 0.12 : 0);
      group.rotation.x = 0.02 + (pointer ? -pointer.py * 0.05 : 0);
      for (var i = 0; i < 6; i++) {
        var fr = f.fills[i];
        var a = arcs[i]; a.mesh.visible = fr > 0.004;
        a.mesh.geometry.setDrawRange(0, Math.max(0, Math.floor(a.total * Math.min(1, fr) / 6) * 6));
        heads[i].visible = fr >= 0.995;
        var n = nodes[i], active = f.active === i, done = f.done[i];
        n.userData.mesh.material = active ? beadActive : (done ? beadOn : beadOff);
        var target = active ? 1.26 : (done ? 1.06 : 1);
        n.scale.setScalar(damp(n.scale.x, target, 0.11, dt));
        n.position.y = damp(n.position.y, active ? 0.08 : 0, 0.13, dt);
      }
      guideMat.opacity = damp(guideMat.opacity, 0.16 + 0.16 * Math.min(1, f.u / 6), 0.25, dt);
      gate.material = f.gateOn ? beadAmberOn : beadAmber;
      packet.material.emissive.setHex(f.packetGated ? 0xd9a83a : 0x9ffbe8);
      packetGlow.material.color.setHex(f.packetGated ? 0xf3c969 : 0x2ef0cb);
      packetLight.color.setHex(f.packetGated ? 0xf3c969 : 0x2ef0cb);
      spokeIn.material.opacity = damp(spokeIn.material.opacity, f.spokeIn ? 0.9 : 0.2, 0.14, dt);
      spokeOut.material.opacity = damp(spokeOut.material.opacity, f.spokeOut ? 0.9 : 0.2, 0.14, dt);
      var pp = ringPos(f.u); pp.y = 0.8; packet.position.copy(pp); packetLight.position.copy(pp).add(new THREE.Vector3(0, 0.6, 0));
      packetGlow.scale.setScalar(1 + 0.12 * Math.sin(st.t * 4));
      for (i = 0; i < trail.length; i++) {
        var tu = f.u - (i + 1) * 0.028, tp = ringPos(Math.max(0, tu)); tp.y = 0.8;
        trail[i].position.copy(tp); trail[i].visible = tu > 0.02;
      }
    }
    function size(w, h) { if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); } }
    // screen projection for labels
    var v = new THREE.Vector3();
    function project(p3) { v.copy(p3).applyMatrix4(group.matrixWorld).project(camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }
    function labelPoints() {
      // the disc is seen from above, so screen-vertical is heavily foreshortened:
      // push the labels well clear of the ring and lift the back row / drop the front
      // row so the six never crowd into the same horizontal band.
      var out = [];
      for (var i = 0; i < 6; i++) {
        var q = nodePos[i].clone().multiplyScalar((R + 1.7) / R);
        q.y = nodePos[i].z < -0.5 ? 1.25 : (nodePos[i].z > 0.5 ? -0.8 : 0);
        out.push(project(q));
      }
      out.push(project(new THREE.Vector3(0, HUB_R + 0.22, 0)));                // company memory, just above the hub
      out.push(project(new THREE.Vector3(gatePos.x * 1.22, -0.95, gatePos.z * 1.22)));  // approved rules, outside the arc
      for (var g = 0; g < 3; g++) out.push([0, 0]);                            // verb pills live in the caption now
      return out;
    }
    return { scene: scene, camera: camera, update: update, size: size, labelPoints: labelPoints };
  }

  /* ======================================= the investment boundary scene == */
  function buildBoundaryScene() {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0x6fe0cb, 0x06101c, 0.3));
    var key = new THREE.DirectionalLight(0xe6fffa, 0.8); key.position.set(3, 8, 6); scene.add(key);
    var rim = new THREE.DirectionalLight(0x2ef0cb, 0.42); rim.position.set(-6, 3, -4); scene.add(rim);
    var fill = new THREE.DirectionalLight(0x9fd8ff, 0.22); fill.position.set(5, 2, -6); scene.add(fill);
    var wallLight = new THREE.PointLight(0x2ef0cb, 0.6, 9); wallLight.position.set(0, 1.6, 0); scene.add(wallLight);

    var teal = new THREE.MeshPhysicalMaterial({ color: 0x12c4a2, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: 0x0a5a4d, emissiveIntensity: 0.22 });
    var amber = new THREE.MeshPhysicalMaterial({ color: 0xf3c969, roughness: 0.4, clearcoat: 0.8, emissive: 0x7a5a1a, emissiveIntensity: 0.35 });
    var grey = new THREE.MeshPhysicalMaterial({ color: 0x4a5a63, roughness: 0.55, clearcoat: 0.4, emissive: 0x141c22, emissiveIntensity: 0.4 });
    var dim = new THREE.MeshPhysicalMaterial({ color: 0x0f3a3a, roughness: 0.5, clearcoat: 0.6, emissive: 0x041a1a, emissiveIntensity: 0.3 });
    var laneMat = new THREE.MeshPhysicalMaterial({ color: 0x11413f, roughness: 0.75, clearcoat: 0.25, emissive: 0x07322f, emissiveIntensity: 0.45, transparent: true, opacity: 0.92 });
    var laneGlow = new THREE.MeshBasicMaterial({ color: 0x2ef0cb, transparent: true, opacity: 0.22 });
    var wallMat = new THREE.MeshPhysicalMaterial({ color: 0x0f4d4c, roughness: 0.16, transmission: 0, transparent: true, opacity: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x0a6b5c, emissiveIntensity: 0.3, side: THREE.DoubleSide });
    var wallEdge = new THREE.MeshBasicMaterial({ color: 0x2ef0cb, transparent: true, opacity: 0.8 });
    var binMat = new THREE.MeshPhysicalMaterial({ color: 0x123c40, roughness: 0.72, clearcoat: 0.3, clearcoatRoughness: 0.4, emissive: 0x07282b, emissiveIntensity: 0.5 });
    var rimMat = new THREE.MeshBasicMaterial({ color: 0x2ef0cb, transparent: true, opacity: 0.3 });

    // ---- shared builders: rounded slabs and soft floor gradients keep the scene
    // from reading as a pile of raw boxes
    function roundedShape(w, d, r) {
      var sh = new THREE.Shape(), x = -w / 2, y = -d / 2;
      r = Math.min(r, w / 2, d / 2);
      sh.moveTo(x + r, y);
      sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
      sh.lineTo(x + w, y + d - r); sh.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
      sh.lineTo(x + r, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - r);
      sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
      return sh;
    }
    function slab(w, d, h, r, mat) {
      var bev = Math.min(0.035, h * 0.3);
      var geo = new THREE.ExtrudeGeometry(roundedShape(w, d, r), { depth: Math.max(0.001, h - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 10 });
      geo.rotateX(-Math.PI / 2);
      return new THREE.Mesh(geo, mat);
    }
    function radialTex(stops) {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      stops.forEach(function (st) { rg.addColorStop(st[0], st[1]); });
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    var glowTex = radialTex([[0, 'rgba(46,240,203,0.42)'], [0.45, 'rgba(20,96,96,0.16)'], [1, 'rgba(7,13,23,0)']]);
    var shadeTex = radialTex([[0, 'rgba(2,8,12,0.6)'], [0.6, 'rgba(2,8,12,0.22)'], [1, 'rgba(2,8,12,0)']]);
    function flat(tex, w, d, o) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o }));
      m.rotation.x = -Math.PI / 2; return m;
    }

    var group = new THREE.Group(); scene.add(group);
    var OPX = -5.6, WALLX = 0, BINX = 5.2;
    var opZ = [-1.9, 0, 1.9], binZ = [-2.7, -0.9, 0.9, 2.7];
    var FLOOR = -0.42;
    // a soft floor so nothing floats in a void
    var floorGlow = flat(glowTex, 24, 16, 0.8); floorGlow.position.set(0.4, FLOOR - 0.02, 0.4); group.add(floorGlow);
    // lanes from operators to the wall: rounded tracks with a lit centre line
    var LANE_LEN = 4.4, LANE_CX = -2.9;
    var lanes = opZ.map(function (z) {
      var m = slab(LANE_LEN, 0.5, 0.075, 0.07, laneMat); m.position.set(LANE_CX, FLOOR, z); group.add(m);
      var g = slab(LANE_LEN - 0.34, 0.075, 0.02, 0.03, laneGlow.clone()); g.position.set(LANE_CX, FLOOR + 0.08, z); group.add(g);
      var sh = flat(shadeTex, 5.6, 2.0, 0.4); sh.position.set(LANE_CX, FLOOR - 0.03, z + 0.1); group.add(sh);
      m.userData.glow = g; return m;
    });
    // the wall (MemoLogs): a rounded pane of glass standing across the lanes
    var wallGeo = new THREE.ExtrudeGeometry(roundedShape(6.0, 1.22, 0.3), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 });
    wallGeo.rotateY(Math.PI / 2); wallGeo.translate(-0.15, 0, 0);
    var wall = new THREE.Mesh(wallGeo, wallMat); wall.position.set(WALLX, 0.2, 0); group.add(wall);   // stands on the floor
    var edge = slab(0.34, 6.05, 0.035, 0.017, wallEdge); edge.position.set(WALLX, 0.82, 0); group.add(edge);
    var wallFoot = slab(0.62, 6.3, 0.06, 0.28, binMat); wallFoot.position.set(WALLX, FLOOR, 0); group.add(wallFoot);
    // two functions inside: a teal core (AI context) and an amber core (rules)

    // bins on the right: rounded trays with a lit rim
    var bins = binZ.map(function (z) {
      var m = slab(2.25, 1.2, 0.09, 0.3, binMat); m.position.set(BINX, FLOOR, z); group.add(m);
      var r = slab(1.98, 0.96, 0.016, 0.26, rimMat.clone()); r.position.set(BINX, FLOOR + 0.095, z); group.add(r);
      var sh = flat(shadeTex, 3.4, 2.4, 0.5); sh.position.set(BINX, FLOOR - 0.03, z + 0.12); group.add(sh);
      m.userData.rim = r; return m;
    });
    // operator plinths
    var ops = opZ.map(function (z) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 40), binMat); m.position.set(OPX, FLOOR + 0.07, z); group.add(m);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 10, 40), rimMat.clone()); ring.rotation.x = Math.PI / 2; ring.position.set(OPX, FLOOR + 0.145, z); group.add(ring);
      var sh = flat(shadeTex, 1.7, 1.7, 0.5); sh.position.set(OPX, FLOOR - 0.03, z + 0.06); group.add(sh);
      var pip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), rimMat.clone());
      pip.material.opacity = 0.85; pip.position.set(OPX, FLOOR + 0.15, z); group.add(pip);
      m.userData.ring = ring; m.userData.pip = pip; return m;
    });
    // a soft shaft of light where the wall stands, so the barrier reads as active
    var wallShaft = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    wallShaft.rotation.y = Math.PI / 2; wallShaft.position.set(WALLX, 0.55, 0); group.add(wallShaft);
    // a lit slot in the wall in front of each lane: the checkpoint each request passes
    opZ.forEach(function (z) {
      var sl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.055), wallEdge.clone());
      sl.material.opacity = 0.26; sl.position.set(WALLX, 0.14, z); group.add(sl);
    });
    // external route: an ungoverned path that runs past the wall, drawn as a broken
    // line so it reads as outside the system rather than as another lane
    var extSegs = [];
    for (var e = 0; e < 7; e++) {
      var seg = slab(0.32, 0.14, 0.02, 0.06, laneGlow.clone());
      seg.material.color.setHex(0x8fa3ad); seg.material.opacity = 0.24;
      seg.position.set(1.15 + e * 0.62, FLOOR + 0.01, 4.0); group.add(seg); extSegs.push(seg);
    }
    var extMarker = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 12, 40), grey); extMarker.rotation.x = Math.PI / 2; extMarker.position.set(BINX - 0.4, FLOOR + 0.06, 4.0); group.add(extMarker);

    // request beads
    var beads = [];
    function makeBead(mat) { var m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20), mat); m.visible = false; group.add(m); return m; }
    for (var i = 0; i < 6; i++) beads.push(makeBead(teal));
    var stackCount = [0, 0, 0, 0];

    var st = { t: 0 };
    var tmpV = new THREE.Vector3();
    function update(f, dt, pointer) {
      st.t += dt;
      var mobile = smallMQ.matches;
      // phones look down more steeply so the three lanes spread apart on screen
      camera.position.set(mobile ? 0 : 0.2, mobile ? 21.5 : 12.0, mobile ? 13.5 : 18.6);
      camera.lookAt(0, -0.4, mobile ? 0.5 : 0.2);
      group.position.x = mobile ? 0 : (matchMedia('(max-width: 1400px)').matches ? 0.95 : 0.3);
      group.rotation.y = -0.04 + 0.018 * Math.sin(st.t * 0.22) + (pointer ? pointer.px * 0.05 : 0);
      group.rotation.x = 0.012 * Math.sin(st.t * 0.17) - (pointer ? pointer.py * 0.02 : 0);
      var pulse = 0.35 + 0.15 * Math.sin(st.t * 3);
      wallMat.emissiveIntensity = damp(wallMat.emissiveIntensity, f.evaluating ? 0.72 + 0.2 * Math.sin(st.t * 5) : pulse, 0.12, dt);
      wallEdge.opacity = damp(wallEdge.opacity, f.evaluating ? 1 : 0.7, 0.16, dt);
      wallShaft.material.opacity = damp(wallShaft.material.opacity, f.evaluating ? 0.8 : 0.42, 0.18, dt);
      for (var oi = 0; oi < ops.length; oi++) {
        var live = f.requests.some(function (r) { return r && r.on && !r.external && r.op === oi; });
        var pm = ops[oi].userData.pip.material;
        pm.opacity = damp(pm.opacity, live ? 0.95 : 0.4, 0.16, dt);
      }

      // beads: one unbroken path from the plinth, through the slot, into a tray
      var pa = new THREE.Vector3(), pb = new THREE.Vector3();
      for (var i = 0; i < 6; i++) {
        var b = beads[i], r = f.requests[i];
        if (!r || !r.on) { b.visible = false; b.scale.setScalar(0.001); continue; }
        b.visible = true;
        b.material = r.color === 'amber' ? amber : (r.color === 'grey' ? grey : (r.color === 'dim' ? dim : teal));
        var u = r.u, p = new THREE.Vector3(), lift = 0;
        if (r.external) {
          pa.set(0.6, 0.05, 4.0); pb.set(BINX - 0.4, 0.05, 4.0);
          p.copy(pa).lerp(pb, smooth(u)); lift = Math.sin(smooth(u) * Math.PI) * 0.2;
        } else {
          var slotZ = binZ[r.binA] + (binZ[r.binB] - binZ[r.binA]) * r.flip;
          var slotX = BINX - 0.78 + (r.slot || 0) * 0.6;
          if (u < 0.40) {                                   // plinth -> the slot in the wall
            var k0 = smooth(u / 0.40);
            pa.set(OPX + 0.5, 0.06, opZ[r.op]); pb.set(WALLX, 0.17, opZ[r.op]);
            p.copy(pa).lerp(pb, k0); lift = Math.sin(k0 * Math.PI) * 0.3;
          } else if (u < 0.62) {                            // held in the slot while the rules read it
            p.set(WALLX, 0.17, opZ[r.op]); lift = 0.05 * Math.sin(st.t * 6);
          } else {                                          // through, and down into its tray
            var k1 = smooth((u - 0.62) / 0.38);
            pa.set(WALLX, 0.17, opZ[r.op]); pb.set(slotX, 0.03, slotZ);
            p.copy(pa).lerp(pb, k1); lift = Math.sin(k1 * Math.PI) * 0.55;
          }
        }
        p.y += lift;
        b.position.copy(p);
        b.scale.setScalar(damp(b.scale.x, 1, 0.09, dt));
      }
      extMarker.material = f.extOn ? amber : grey;
      for (var li = 0; li < lanes.length; li++) {
        var act = f.requests.some(function (r) { return r && r.on && !r.external && r.op === li && r.u < 0.55; });
        var gm = lanes[li].userData.glow.material;
        gm.opacity = damp(gm.opacity, act ? 0.85 : 0.28, 0.14, dt);
      }
      for (var bi = 0; bi < bins.length; bi++) {
        var hit = f.requests.some(function (r) { return r && r.on && !r.external && r.u > 0.72 && (r.flip > 0.5 ? r.binB : r.binA) === bi; });
        var rm = bins[bi].userData.rim.material;
        rm.opacity = damp(rm.opacity, hit ? 0.62 : 0.22, 0.16, dt);
      }
      for (var ei = 0; ei < extSegs.length; ei++) {
        extSegs[ei].material.opacity = damp(extSegs[ei].material.opacity, f.extOn ? 0.3 + 0.2 * Math.sin(st.t * 2.4 - ei * 0.5) : 0.13, 0.2, dt);
      }
    }
    function size(w, h) { if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); } }
    var v = new THREE.Vector3();
    function project(x, y, z) { v.set(x, y, z).applyMatrix4(group.matrixWorld).project(camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }
    function labelPoints() {
      var out = {};
      // wide canvases have room for the operator labels beside their plinth; narrow
      // ones do not, so the labels sit above it instead of running off the page
      var mobile = smallMQ.matches;
      opZ.forEach(function (z, i) { out['op' + i] = mobile ? project(OPX, 0.75, z) : project(OPX - 0.65, 0.05, z); });
      out.wall = project(WALLX, mobile ? 2.3 : 3.15, 0);
      binZ.forEach(function (z, i) { out['bin' + i] = mobile ? project(BINX + 0.25, 0.6, z) : project(BINX + 1.16, 0.05, z); });
      out.ext = project(BINX - 0.4, -0.42, 4.9);
      return out;
    }
    return { scene: scene, camera: camera, update: update, size: size, labelPoints: labelPoints };
  }

  gl = buildScene();
  var loopGl = gl ? buildLoopScene(gl.renderer) : null;
  var bdGl = gl ? buildBoundaryScene() : null;
  if (!gl) document.documentElement.classList.add('no-webgl');

  // Which display canvases are on screen. The offscreen renderer draws once per
  // frame and each visible view copies it; nothing renders while both are off.
  var visible = { hero: true, close: false, fw: false, bd: false };
  var fwPinned = false;
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { visible[e.target.querySelector('[data-ml-view]').getAttribute('data-ml-view')] = e.isIntersecting; });
    }, { threshold: 0 });
    vio.observe(views.hero.parentNode); vio.observe(views.close.parentNode); if (views.fw) vio.observe(views.fw.parentNode); if (views.bd) vio.observe(views.bd.parentNode);
  }

  var last = performance.now();
  // draw one scene into its own canvas at the canvas's current size
  function draw(name, sceneObj) {
    var R = rendererFor(name); if (!R) return;
    sceneObj.size(R._w, R._h);
    R.render(sceneObj.scene, sceneObj.camera);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    // scroll state
    var ph = pOf(heroAct), pc = pOf(closeAct);
    var closeOn = visible.close && !visible.hero;
    if (gl) {
      gl.state.mode = closeOn ? 'close' : 'hero';
      gl.state.s = closeOn ? 1 : (reduce ? 1 : range(ph, 0.0, 0.78));
      gl.state.beat = reduce ? 2 : (ph < 0.2 ? 0 : ph < 0.4 ? 1 : ph < 0.64 ? 2 : -1);
      tickTriad(gl.state.beat);
      gl.state.c = closeOn ? (reduce ? 1 : pc) : 0;
      gl.state.px = damp(gl.state.px, gl.state.tx, 0.28, dt);
      gl.state.py = damp(gl.state.py, gl.state.ty, 0.28, dt);
      var fwOn = visible.fw && loopGl && !visible.hero && !visible.close;
      var bdOn = visible.bd && bdGl && !visible.hero && !visible.close && !fwOn;
      if (bdOn) {
        bdGl.update(bdState, reduce ? 0 : dt, gl.state);
        draw('bd', bdGl);
        placeBdLabels();
      } else if (fwOn) {
        loopGl.update(fwState, reduce ? 0 : dt, gl.state);
        draw('fw', loopGl);
        placeLabels();
      } else if (visible.hero || visible.close) {
        gl.update(reduce ? 0 : dt);
        draw(closeOn ? 'close' : 'hero', gl);
      }
    }
    verify(heroStage, 's=' + (gl ? gl.state.s : 0).toFixed(2) + ' p=' + ph.toFixed(2));
    verify(closeStage, 'c=' + (gl ? gl.state.c : 0).toFixed(2));
    if (snapStage) { var sp = pOf(snapAct); verify(snapStage, 'k=' + Math.max(0, Math.min(1, (sp - 0.28) / 0.34)).toFixed(2) + ' s=' + Math.max(0, Math.min(1, (sp - 0.62) / 0.08)).toFixed(2)); }
    tickRecord();
    tickCounters();
    tickFlywheel();
    tickBoundary();
    tickDwell();
  }
  requestAnimationFrame(frame);

  if (fine && !reduce && gl) {
    addEventListener('pointermove', function (e) {
      gl.state.tx = (e.clientX / innerWidth - 0.5) * 2;
      gl.state.ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  /* ============================================ the hero triad == */
  var triadLines = Array.prototype.slice.call(document.querySelectorAll('[data-ml-line]')), triadLast = null;
  function tickTriad(beat) {
    if (beat === triadLast) return; triadLast = beat;
    triadLines.forEach(function (el, i) { el.classList.toggle('is-on', beat === i); el.classList.toggle('is-done', beat === -1 || i < beat); });
  }

  /* =========================================================== the bar == */
  var bar = document.getElementById('bar');
  addEventListener('scroll', function () { bar.classList.toggle('is-scrolled', scrollY > 40); }, { passive: true });

  // The continuous workflow is rendered directly in the page.
  function tickDwell() {}


  /* ====================================================== the flywheel == */
  var fwAct = document.querySelector('[data-ml-fw]');
  var fw = null;
  if (fwAct) {
    var q = function (sel) { return Array.prototype.slice.call(fwAct.querySelectorAll(sel)); };
    fw = {
      stage: fwAct.querySelector('[data-sc-stage]'),
      handoff: fwAct.querySelector('[data-fw-handoff]'), handoffText: fwAct.querySelector('[data-fw-handoff-text]'),
      last: -1
    };
  }
  var dock = { on: false, el: fwAct && fwAct.querySelector('[data-fw-dock]'), stage: -1 };
  var dockView = { docked: false, stage: 0 };
  var dockTimer = null, dockPending = null;
  function setDock(on, stage) {
    var PBm = window.MLPlaybook;
    var target = dockPending || dock;
    var changed = (on !== target.on) || (on && stage !== target.stage);
    if (!changed) { if (on && !dockPending) placeDock(); return; }
    // one transition at a time: a newer request replaces a pending one and finishes the fade it started
    var wasOn = dock.on;
    dockPending = { on: on, stage: stage };
    var turning = wasOn === on;           // stage-to-stage while docked: the frame stays, only the content turns
    record.classList.remove('is-switching'); record.classList.remove('is-turning');
    record.classList.add(turning ? 'is-turning' : 'is-switching');
    if (dockTimer) clearTimeout(dockTimer);
    dockTimer = setTimeout(function () {
      dockTimer = null; var req = dockPending; dockPending = null;
      dock.on = req.on; dock.stage = req.stage;
      record.classList.toggle('is-docked', req.on);
      if (!req.on) { record.style.left = ''; record.style.top = ''; record.style.width = ''; record.style.right = ''; }
      dockView.docked = req.on; dockView.stage = req.stage; syncView(true);
      if (req.on) placeDock();
      requestAnimationFrame(function () { if (!dockTimer) { record.classList.remove('is-switching'); record.classList.remove('is-turning'); } });
    }, turning ? 140 : 160);
  }
  function placeDock() {
    if (!dock.el) return;
    var r = dock.el.getBoundingClientRect();
    record.style.left = r.left + 'px'; record.style.right = 'auto'; record.style.width = r.width + 'px';
    var h = record.offsetHeight, small = matchMedia('(max-width: 860px)').matches;
    // centred inside its slot, so it travels with the section on the way in and out
    record.style.top = (small ? r.top : r.top + Math.max(0, (r.height - h) / 2)) + 'px';
  }
  var fwState = { u: 0, fills: [0, 0, 0, 0, 0, 0], done: [false, false, false, false, false, false], active: 0, gateOn: false, packetGated: false, spokeIn: false, spokeOut: false };
  var labEls = fwAct ? Array.prototype.slice.call(fwAct.querySelectorAll('[data-fw-lab]')) : [];
  function placeLabels() {
    if (!loopGl || !labEls.length) return;
    var pts = loopGl.labelPoints();
    for (var i = 0; i < labEls.length && i < pts.length; i++) {
      if (labEls[i].hasAttribute('data-fw-static')) continue;
      labEls[i].style.left = (pts[i][0] * 100).toFixed(2) + '%';
      labEls[i].style.top = (pts[i][1] * 100).toFixed(2) + '%';
    }
  }
  // scroll progress is eased over a few frames so wheel steps and flicks read as one glide
  var eased = { fw: -1, bd: -1, tfw: performance.now(), tbd: performance.now() };
  function easeP(key, target) {
    if (reduce) return target;
    var now = performance.now(), dt = Math.min(0.1, (now - eased['t' + key]) / 1000); eased['t' + key] = now;
    var k = 1 - Math.exp(-dt / 0.075);       // ~75 ms time constant, frame-rate independent
    if (eased[key] < 0 || Math.abs(target - eased[key]) > 0.25) eased[key] = target;
    else eased[key] += (target - eased[key]) * k;
    if (Math.abs(target - eased[key]) < 0.0005) eased[key] = target;
    return eased[key];
  }
  function tickFlywheel() {
    if (!fw) return;
    var p = easeP('fw', pOf(fwAct));
    if (reduce) p = Math.max(p, 0.999);
    // one parameter drives everything: the packet's position on the ring, 0..6.
    // Eased inside each unit so the loop breathes at each stage without ever
    // stopping dead — the arcs are simply drawn up to wherever the packet is.
    var t = Math.min(6, Math.max(0, p * 6));
    var k = Math.min(5, Math.floor(t)), frac = t - k;
    var u = k + smooth(frac);
    var here = Math.min(5, Math.floor(u + 0.001));
    for (var i = 0; i < 6; i++) {
      fwState.fills[i] = Math.max(0, Math.min(1, (u - i - 0.14) / 0.72));
      fwState.done[i] = u >= i + 0.97;
    }
    fwState.u = u;
    fwState.active = here;
    fwState.gateOn = u >= 2.42;
    fwState.packetGated = u > 2.34 && u < 2.72;
    fwState.spokeIn = u > 4.9 && u < 5.75;
    fwState.spokeOut = u > 0.9 && u < 1.75;
    labEls.forEach(function (el, i) {
      if (i < 6) { el.classList.toggle('is-done', fwState.done[i]); el.classList.toggle('is-active', fwState.active === i); }
    });
    var gateLab = fwAct.querySelector('[data-fw-lab="gate"]'); if (gateLab) gateLab.classList.toggle('is-on', fwState.gateOn);
    for (var g = 0; g < 3; g++) { var gl = fwAct.querySelector('[data-fw-lab="g' + g + '"]'); if (gl) gl.classList.toggle('is-on', u >= g * 2 + 0.6); }
    var HAND = ['goal · proposal · expectation · rules', 'precedents · evidence state · conflicts', 'authorized plan · limits · owner', 'commitments · delivery record', 'outcomes · departures · conditions', 'grades · recommendations · rule proposals'];
    if (fw.handoffText.textContent !== HAND[here]) fw.handoffText.textContent = HAND[here];
    fw.handoff.classList.toggle('is-on', u > 0.08);
    setDock(visible.fw, here);
    verify(fw.stage, 't=' + t.toFixed(2) + ' u=' + u.toFixed(2));
  }


  /* ============================================ the boundary: driver == */
  var bdAct = document.querySelector('[data-ml-bd]');
  var bdState = { requests: [], evaluating: false, ruleHit: false, extOn: false };
  var bdEls = bdAct ? {
    stage: bdAct.querySelector('[data-sc-stage]'),
    panels: Array.prototype.slice.call(bdAct.querySelectorAll('[data-bd-panel]')),
    labs: {}, meter: bdAct.querySelector('[data-bd-meter]'), segC: bdAct.querySelector('[data-bd-seg="c"]'), segH: bdAct.querySelector('[data-bd-seg="h"]'), segE: bdAct.querySelector('[data-bd-seg="e"]'), meterText: bdAct.querySelector('[data-bd-meter-text]'),
    last: -1
  } : null;
  if (bdEls) Array.prototype.forEach.call(bdAct.querySelectorAll('[data-bd-lab]'), function (el) { bdEls.labs[el.getAttribute('data-bd-lab')] = el; });
  // the six requests: operator lane, amount, bin (0 proceeds, 1 held, 2 evidence, 3 revised)
  var BD = [
    { op: 1, amt: 40, bin: 0, color: 'teal' },
    { op: 0, amt: 60, bin: 0, color: 'teal', flipsTo: 1 },
    { op: 2, amt: 35, bin: 1, color: 'amber', ruleHit: true },
    { op: 2, amt: 150, bin: 2, color: 'amber', ruleHit: true, audB: true },
    { op: 1, amt: 300, bin: 3, color: 'dim', ruleHit: true },
    { op: 1, amt: 20, bin: 1, color: 'grey', external: true }
  ];
  var LIMIT = 120;
  function placeBdLabels() {
    if (!bdGl || !bdEls) return;
    var pts = bdGl.labelPoints();
    Object.keys(pts).forEach(function (k) { var el = bdEls.labs[k]; if (!el) return; el.style.left = (pts[k][0] * 100).toFixed(2) + '%'; el.style.top = (pts[k][1] * 100).toFixed(2) + '%'; });
  }
  function tickBoundary() {
    if (!bdEls) return;
    var p = easeP('bd', pOf(bdAct));
    if (reduce) p = Math.max(p, 0.999);
    var t = Math.min(5.999, Math.max(0, p * 6));
    var beat = Math.floor(t), frac = t - beat;
    var reqs = [], committed = 0, held = 0, ext = 0, evaluating = false, ruleHit = false;
    for (var i = 0; i < 6; i++) {
      var d = BD[i];
      // one journey per request, 0..1: lane, then the slot in the wall, then a tray.
      // Nothing teleports — the same parameter drives every leg.
      var r = { op: d.op, binA: d.bin, binB: d.bin, flip: 0, color: d.color, external: !!d.external, on: false, u: 0, slot: 0 };
      if (i < beat) { r.on = true; r.u = 1; }
      else if (i === beat) { r.on = true; r.u = frac; }
      if (d.flipsTo !== undefined) {
        // the creators request slides from Proceeds to Held as the third request is judged
        r.binB = d.flipsTo;
        r.flip = beat > 2 ? 1 : (beat === 2 ? smooth(Math.max(0, Math.min(1, (frac - 0.42) / 0.3))) : 0);
        if (r.flip > 0.5) r.color = 'amber';
      }
      if (r.on && i === beat && !d.external && frac >= 0.40 && frac < 0.62) { evaluating = true; ruleHit = !!d.ruleHit; }
      reqs.push(r);
    }
    // stacking slots per tray, in arrival order
    var slots = [0, 0, 0, 0];
    reqs.forEach(function (r) {
      if (!r.on || r.external || r.u < 0.62) return;
      var bin = r.flip > 0.5 ? r.binB : r.binA;
      r.slot = slots[bin]; slots[bin] += 1;
    });
    // shared commitment on Audience A
    reqs.forEach(function (r, i) {
      var d = BD[i]; if (d.audB || !r.on || r.u < 0.995) return;
      var bin = r.flip > 0.5 ? r.binB : r.binA;
      if (r.external) ext += d.amt; else if (bin === 0) committed += d.amt; else if (bin === 1 && i < 3) held += d.amt;
    });
    bdState.requests = reqs; bdState.evaluating = evaluating; bdState.ruleHit = ruleHit; bdState.extOn = beat >= 5 && frac > 0.45;
    // meter
    var scale = LIMIT / 0.8, total = committed + ext;
    bdEls.segC.style.width = (committed / scale * 100).toFixed(1) + '%';
    bdEls.segH.style.width = (held / scale * 100).toFixed(1) + '%';
    bdEls.segE.style.width = (ext / scale * 100).toFixed(1) + '%';
    bdEls.meterText.textContent = '$' + committed + 'k committed' + (held ? ' · $' + held + 'k held' : '') + (ext ? ' · $' + ext + 'k detected after' : '') + ' · limit $' + LIMIT + 'k';
    bdEls.meter.classList.toggle('is-over', committed + held + ext > LIMIT);
    // labels
    for (var o = 0; o < 3; o++) { var lab = bdEls.labs['op' + o]; if (lab) lab.classList.toggle('is-active', !BD[beat].external && BD[beat].op === o); }
    for (var bI = 0; bI < 4; bI++) { var bl = bdEls.labs['bin' + bI]; if (bl) bl.classList.toggle('is-active', slots[bI] > 0); }
    if (bdEls.labs.ext) bdEls.labs.ext.classList.toggle('is-on', beat >= 5);
    // card
    if (beat !== bdEls.last) { bdEls.last = beat; bdEls.panels.forEach(function (pn, i) { pn.classList.toggle('is-on', i === beat); }); }
    var pn = bdEls.panels[beat];
    if (pn) {
      var js = pn.querySelectorAll('[data-bd-j]');
      Array.prototype.forEach.call(js, function (el) {
        var k = parseInt(el.getAttribute('data-bd-j'), 10);
        var at = BD[beat].external ? [0.2, 0.35, 0.5, 0.62][k] : [0.4, 0.48, 0.58, 0.7][k];
        el.classList.toggle('is-on', frac >= at);
      });
    }
    verify(bdEls.stage, 'b=' + t.toFixed(2) + ' c=' + committed + ' h=' + held);
  }

  /* ================= the playbook: a view derived from scroll position == */
  var record = document.getElementById('record');
  var PB = window.MLPlaybook;
  var acts = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-ml-act]'), function (el) { acts[el.getAttribute('data-ml-act')] = el; });
  // a fact is visible once the page is at or past its trigger; scrolling back hides it again
  var triggers = [
    ['missing', 0.55, 'record'], ['path', 0.5, 'policy'],
    ['demo', 0.04, 'proposal'], ['demo', 0.08, 'expectation'], ['demo', 0.2, 'evidence'], ['demo', 0.28, 'snapshot'],
    ['demo', 0.38, 'authorization'], ['demo', 0.46, 'approval'], ['demo', 0.56, 'execution'], ['demo', 0.72, 'observation'], ['demo', 0.88, 'outcome']
  ];
  // which stage the sidebar expands while a section is on screen
  var focusBySection = { hero: 0, missing: 0, path: 0, silence: 0, snap: 1, result: 5, agents: 3, boundary: 3, forwhom: 5, close: 5 };
  var lastFocus = 0;
  function pastAct(el) { var r = el.getBoundingClientRect(); return r.bottom <= 0; }
  function sectionOnScreen() {
    var mid = innerHeight * 0.5, best = null;
    Object.keys(acts).forEach(function (k) {
      var r = acts[k].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) best = k;
    });
    return best;
  }
  function syncView(force) {
    var visibleF = {}, lastStage = 0;
    triggers.forEach(function (t) {
      var el = acts[t[0]]; if (!el) return;
      var on = pOf(el) >= t[1] || pastAct(el);
      if (on) { visibleF[t[2]] = true; lastStage = Math.max(lastStage, PB.stageOfFact[t[2]]); }
    });
    var focus;
    var complete = !!visibleF.outcome;
    if (dockView.docked) focus = dockView.stage;
    else {
      var sec = sectionOnScreen();
      if (complete) focus = 5;                           // the loop has run: stay at the end of the record
      else if (!sec) focus = lastFocus;                  // in a gap between sections: hold
      else if (sec === 'demo') focus = lastStage;
      else if (focusBySection[sec] !== undefined) focus = Math.min(focusBySection[sec], lastStage);
      else focus = lastStage;
    }
    lastFocus = focus;
    PB.setView({ visible: visibleF, focus: focus, docked: dockView.docked, complete: complete });
  }
  /* the five answers count up as each row reveals */
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count-to]')).map(function (el) {
    var at = (el.closest('[data-sc-reveal-at]') || el).getAttribute('data-sc-reveal-at') || '0 1';
    var w = at.split(/\s+/).map(parseFloat);
    return { el: el, to: parseFloat(el.getAttribute('data-count-to')), pre: el.getAttribute('data-count-pre') || '', suf: el.getAttribute('data-count-suf') || '', dec: parseInt(el.getAttribute('data-count-dec') || '0', 10), a: w[0], b: w[1] + 0.05, last: '' };
  });
  function tickCounters() {
    if (!counters.length || !acts.missing) return;
    var p = reduce ? 1 : pOf(acts.missing);
    for (var i = 0; i < counters.length; i++) {
      var c = counters[i], k = Math.max(0, Math.min(1, (p - c.a) / (c.b - c.a)));
      k = 1 - Math.pow(1 - k, 3);
      var txt = c.pre + (c.to * k).toFixed(c.dec) + c.suf;
      if (txt !== c.last) { c.last = txt; c.el.textContent = txt; }
    }
  }
  function tickRecord() {
    syncView();
    // the panel belongs to the decision-loop section: it exists only while docked there
    record.classList.toggle('is-on', dock.on);
  }

  /* keyboard: a focused rail item should scroll its panel into view */
  document.querySelectorAll('.station').forEach(function (s) { s.setAttribute('tabindex', '0'); });

  if (smallMQ.matches) {
    // shorter pinned spans on phones: same beats, less thumb travel
    var spans = { hero: 1.7, path: 2.4, demo: 3.4, boundary: 4.2, close: 1.2 };
    Object.keys(spans).forEach(function (k) { var el = acts[k] || (k === 'hero' ? heroAct : null); if (el) el.setAttribute('data-sc-span', String(spans[k])); });
    var mc = { '.proposal': '0 0.36 0 0.06', '.test:nth-child(1)': '0.34 0.64 0.06 0.06', '.test:nth-child(2)': '0.40 0.64 0.06 0.06', '.test:nth-child(3)': '0.46 0.64 0.06 0.06', '.verdict': '0.66 0.94 0.06 0.06', '.demo__close': '0.88 1 0.06 0.1' };
    Object.keys(mc).forEach(function (sel) { var el = demoAct.querySelector(sel); if (el) el.setAttribute('data-sc-cue', mc[sel]); });
    // A pin's cue clock reaches 1 the moment the stage stops sticking, but the
    // stage still has a whole viewport of scroll left before it clears the top.
    // Fading the second hero line out AT 1 therefore hands the reader ~840px of
    // empty backdrop before the next section arrives, which reads as a hole
    // between the first and second sections. Hold it lit and let it leave with
    // the stage: no fade-out, so the copy is what scrolls away.
    var hc = [[heroAct.querySelector('.hero__copy:not(.hero__copy--b)'), '0 0.52 0 0.1'],
              [heroAct.querySelector('.hero__copy--b'), '0.56 1 0.1 0']];
    hc.forEach(function (p) { if (p[0]) p[0].setAttribute('data-sc-cue', p[1]); });
  }
  ScrollCraft.mount(document.body);
})();
