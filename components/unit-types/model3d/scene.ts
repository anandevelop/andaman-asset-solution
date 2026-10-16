/**
 * components/unit-types/model3d/scene.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The three.js engine behind the unit-types "3D" view: builds every type of
 * one project from its plan data (./data), shows one type and its floors up
 * to the chosen one, picks rooms, and moves the camera between three views.
 * It opens on the top view, so the plan reads first and the visitor tilts.
 *
 * Lives outside React (components/unit-types/UnitModel3D.tsx owns one). The
 * draw loop stops while the stage is off-screen or the tab is hidden.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { BuildHelpers, FloorDef, ProjectDef, RoomDef, Seg, TypeDef, ViewName } from './types';

const FH = 3.6; // floor-to-floor (m)
const WH = 3.2; // wall height (m)
const C = {
  slab: 0x1c3c5e, out: 0x1a3550, park: 0x152f4a, green: 0x1d4a45, wall: 0x9fb1c4,
  edge: 0xb9cadb, faint: 0x5f7d9b, gold: 0xe8b98a, water: 0x3f8ec2, glass: 0x8fc3e6, poolEdge: 0x7fb6dd,
};
const WALL_SCALE = [1, 1.1 / WH, 0]; // Full · Cutaway · Off

export interface RoomInfo {
  n: number;
  name: string;
  sqm: number;
  share: number; // % of this floor
}

interface RoomRT { def: RoomDef; meshes: THREE.Mesh[]; label: HTMLElement; anchor: CSS2DObject; size: number }
interface WallRT { m: THREE.Mesh; kind: 'w' | 'g' | 'rail' }
interface FloorRT { def: FloorDef; id: number; group: THREE.Group; rooms: RoomRT[]; walls: WallRT[] }
interface TypeRT { def: TypeDef; root: THREE.Group; len: number; lot: [number, number]; floors: FloorRT[] }

const lineMat = (c: number, o = 1) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o });
const solid = (c: number, o = 1) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, transparent: o < 1, opacity: o });

export class UnitScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
  private controls: OrbitControls;
  private ro: ResizeObserver;
  private types: TypeRT[] = [];
  private T!: TypeRT;
  private floor = 0;
  private wallMode = 0;
  private hovered: RoomRT | null = null;
  private selected: RoomRT | null = null;
  private view: ViewName | null = 'overview';
  private tween: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; s: number; dur: number } | null = null;
  private wasPortrait: boolean | null = null;
  private reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private down: [number, number] | null = null;

  // shared materials
  private wallMat = new THREE.MeshStandardMaterial({ color: C.wall, roughness: 0.85 });
  private glassMat = new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.12, depthWrite: false });
  private furnMat = solid(0x24476b, 0.6);

  // current pixel → metre mapping while building
  private S = 1 / 50; private OX = 0; private OY = 0; private cur: THREE.Object3D = this.scene;
  private X = (p: number) => (p - this.OX) * this.S;
  private Z = (p: number) => (p - this.OY) * this.S;

  constructor(
    private container: HTMLElement,
    project: ProjectDef,
    private onSelect: (room: RoomInfo | null) => void,
    private onViewChange: (v: ViewName | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 1.5 on touch screens: a 3x phone would otherwise draw four times the pixels of 1.5x
    // for a difference nobody sees at that size (same cap as the site-plan scenes).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    container.prepend(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    container.appendChild(this.labels.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 140;

    this.scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x0e2236, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-18, 34, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 90 });
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    for (const t of project.types) this.types.push(this.buildType(t));

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    // Draw only while somebody can see it: off-screen or in a background
    // tab the loop stops, and starts again the moment it is back.
    this.io = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.run();
    });
    this.io.observe(container);
    document.addEventListener('visibilitychange', this.run);
    this.run();
  }

  private io: IntersectionObserver;
  private inView = true;
  private running = false;
  private run = () => {
    const on = this.inView && !document.hidden;
    if (on === this.running) return;
    this.running = on;
    this.renderer.setAnimationLoop(on ? (now) => this.tick(now) : null);
  };

  /* ---------------- public API ---------------- */
  setType(key: string, fly = true) {
    this.T = this.types.find((t) => t.def.key === key) ?? this.types[0];
    for (const t of this.types) t.root.visible = t === this.T;
    // Opens looking straight down: the plan reads first, then the visitor tilts.
    this.view = 'plan';
    this.setFloor(this.T.floors.length - 1, false);
    const [p, tg] = this.views.plan();
    if (fly) this.flyTo(p, tg);
    else { this.camera.position.copy(p); this.controls.target.copy(tg); }
    this.onViewChange('plan');
  }

  setFloor(n: number, fly = true) {
    this.floor = n;
    this.T.floors.forEach((f) => (f.group.visible = f.id <= n));
    this.hovered = null;
    this.selected = null;
    this.paint();
    this.applyWalls();
    this.onSelect(null);
    if (fly) this.setView(this.view ?? 'overview');
  }

  setView(v: ViewName | null) {
    this.view = v;
    this.onViewChange(v);
    if (v) {
      if (this.selected) { this.selected = null; this.paint(); this.onSelect(null); }
      const [p, t] = this.views[v]();
      this.flyTo(p, t);
    }
  }

  /** The model floor for a section floor: by short label ("G", "1"),
   *  else by position, clamped to the floors this type has. */
  floorFor(short: string, index: number) {
    const byLabel = this.T.floors.findIndex((f) => f.def.short.toLowerCase() === short.trim().toLowerCase());
    return byLabel >= 0 ? byLabel : Math.max(0, Math.min(index, this.T.floors.length - 1));
  }

  /** For the + and − buttons: moves the camera toward the point it orbits
   *  (factor < 1) or away from it, within the same limits as the wheel.
   *  The wheel and a pinch were the only way in before, and a trackpad
   *  user who did not know that, or a phone held in one hand, had none. */
  zoom(factor: number) {
    const t = this.controls.target.clone(), off = this.camera.position.clone().sub(t);
    const d = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(t.clone().add(off.setLength(d)), t, 350);
  }

  /** Back to how the model opened: the top view of this floor, nothing
   *  selected. The way back after dragging the house out of frame. */
  reset() {
    this.setView('plan');
  }

  /** cycles Full → Cutaway → Off and returns the new mode index */
  cycleWalls() {
    this.wallMode = (this.wallMode + 1) % 3;
    this.applyWalls();
    return this.wallMode;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.run);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o: any) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  /* ---------------- building ---------------- */
  private edges(m: THREE.Mesh, c: number, o = 1) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), lineMat(c, o));
    m.add(l);
    m.userData.edges = l;
    return l;
  }

  private box(x1: number, y1: number, x2: number, y2: number, b: number, t: number, mat: THREE.Material, cast = true, recv = true) {
    const w = (x2 - x1) * this.S, d = (y2 - y1) * this.S, h = t - b;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(this.X((x1 + x2) / 2), b + h / 2, this.Z((y1 + y2) / 2));
    m.castShadow = cast;
    m.receiveShadow = recv;
    this.cur.add(m);
    return m;
  }

  private wall(seg: Seg, kind: 'w' | 'g' | 'rail', list: WallRT[]) {
    const [x1, y1, x2, y2] = seg;
    const dx = (x2 - x1) * this.S, dz = (y2 - y1) * this.S, len = Math.hypot(dx, dz);
    const isG = kind !== 'w', h = kind === 'rail' ? 1.1 : isG ? WH - 0.1 : WH, t = isG ? 0.05 : 0.2;
    const g = new THREE.BoxGeometry(len + (isG ? 0 : t), h, t);
    g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, isG ? this.glassMat : this.wallMat);
    m.position.set(this.X((x1 + x2) / 2), 0.1, this.Z((y1 + y2) / 2));
    m.rotation.y = -Math.atan2(dz, dx);
    m.castShadow = !isG;
    m.receiveShadow = !isG;
    this.edges(m, isG ? C.glass : C.edge, isG ? 0.6 : 0.9);
    this.cur.add(m);
    list.push({ m, kind });
  }

  private dashed(points: [number, number][], y: number, dash: number, gap: number) {
    const p = points.map(([x, z]) => new THREE.Vector3(this.X(x), y, this.Z(z)));
    const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineDashedMaterial({ color: C.faint, dashSize: dash, gapSize: gap }));
    l.computeLineDistances();
    this.cur.add(l);
  }

  private helpers(): BuildHelpers {
    const F = (x1: number, y1: number, x2: number, y2: number, b: number, t: number) => {
      const m = this.box(x1, y1, x2, y2, b, t, this.furnMat, true, false);
      this.edges(m, C.edge, 0.7);
    };
    return {
      F,
      cyl: (x, y, rx, rz, b, t) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, t - b, 28), this.furnMat);
        m.scale.set(rx, 1, rz);
        m.position.set(this.X(x), (b + t) / 2, this.Z(y));
        this.cur.add(m);
        this.edges(m, C.edge, 0.7);
      },
      car: (x1, y1, x2, y2) => {
        F(x1, y1, x2, y2, 0.05, 0.75);
        const dx = (x2 - x1) * 0.2, dy = (y2 - y1) * 0.1;
        F(x1 + dx, y1 + dy, x2 - dx * 1.3, y2 - dy, 0.75, 1.35);
      },
      stair: (xa, xb, y1, y2, n = 16) => {
        const step = (xb - xa) / n;
        for (let i = 0; i < n; i++) {
          const a = xa + i * step, b = a + step;
          F(Math.min(a, b), y1, Math.max(a, b), y2, 0, 0.12 + ((i + 1) * FH) / n);
        }
      },
      tree: (px, py, r) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
        const sp: THREE.Vector3[] = [];
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sp.push(new THREE.Vector3(), new THREE.Vector3(Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9)); }
        const g = new THREE.Group();
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(C.faint)));
        g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(sp), lineMat(C.faint)));
        g.position.set(this.X(px), 0.16, this.Z(py));
        this.cur.add(g);
      },
      ustair: () => {
        for (let i = 0; i < 9; i++) { const y = 690 - (i + 1) * 14; F(806, y, 862, y + 14, 0, ((i + 1) * FH) / 20); }
        F(806, 495, 1076, 560, 0, (FH * 10) / 20);
        for (let i = 0; i < 9; i++) { const y = 560 + i * 14; F(1020, y, 1076, y + 14, 0, (FH * (11 + i)) / 20); }
      },
      lift: (cab) => {
        const segs: Seg[] = [[868, 575, 1018, 575], [868, 575, 868, 695], [1018, 575, 1018, 695]];
        for (const [a, b, c, d] of segs) {
          const hz = b === d;
          const m = this.box(hz ? a : a - 6, hz ? b - 6 : b, hz ? c : a + 6, hz ? b + 6 : d, 0, WH, solid(0x3d5570));
          this.edges(m, C.edge, 0.9);
        }
        if (cab) F(885, 590, 1000, 680, 0.1, 2.4);
      },
    };
  }

  private buildType(t: TypeDef): TypeRT {
    const S0 = t.scale, OX0 = (t.ext[0] + t.ext[2]) / 2, OY0 = (t.ext[1] + t.ext[3]) / 2;
    this.S = S0; this.OX = OX0; this.OY = OY0;
    const root = new THREE.Group();
    root.visible = false;
    this.scene.add(root);
    this.cur = root;
    const [a, b, c, d] = t.ext, pad = 30;
    const lot: [number, number][] = [[a - pad, b - pad], [c + pad, b - pad], [c + pad, b - pad], [c + pad, d + pad], [c + pad, d + pad], [a - pad, d + pad], [a - pad, d + pad], [a - pad, b - pad]];
    this.dashed(lot, 0.01, 0.5, 0.35);
    const len = (c - a) * S0;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(len + 20, (d - b) * S0 + 20), new THREE.ShadowMaterial({ opacity: 0.28 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    root.add(catcher);

    const kinds = { in: { c: C.slab, o: 0.95 }, out: { c: C.out, o: 0.9 }, park: { c: C.park, o: 0.9 }, green: { c: C.green, o: 0.9 } };
    const floors: FloorRT[] = t.floors.map((f, i) => {
      const group = new THREE.Group();
      group.position.y = i * FH;
      root.add(group);
      this.cur = group;
      if (f.map) {
        this.S = f.map.s;
        this.OX = f.map.from[0] - ((f.map.to[0] - OX0) * S0) / this.S;
        this.OY = f.map.from[1] - ((f.map.to[1] - OY0) * S0) / this.S;
      } else { this.S = S0; this.OX = OX0; this.OY = OY0; }
      const base = i === 0 ? 0 : -0.25, top = i === 0 ? 0.12 : 0.05;
      (f.greens ?? []).forEach((g) => this.edges(this.box(...g, 0, 0.03, solid(C.green, 0.7), false), C.faint, 0.5));

      const rooms: RoomRT[] = f.rooms.map((r) => {
        const meshes = r.r.map(([x1, y1, x2, y2]) => {
          let m: THREE.Mesh;
          if (r.k === 'pool') {
            m = this.box(x1, y1, x2, y2, -0.45, 0.05, new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.4, roughness: 0.1, depthWrite: false }), false);
            this.edges(m, C.poolEdge, 0.85);
            m.userData.baseOp = 0.4;
          } else {
            const K = kinds[r.k];
            m = this.box(x1, y1, x2, y2, base, r.k === 'park' && i === 0 ? 0.05 : top, solid(K.c, K.o), false);
            this.edges(m, C.faint, 0.9);
            m.userData.baseOp = K.o;
          }
          m.userData.base = (m.material as THREE.MeshStandardMaterial).color.getHex();
          return m;
        });
        const [x1, y1, x2, y2] = r.r[0];
        const el = document.createElement('span');
        el.className = 'u3d-lbl is-off';
        el.textContent = String(r.n);
        const anchor = new CSS2DObject(el);
        anchor.position.set(this.X(r.lab ? r.lab[0] : (x1 + x2) / 2), 0.7, this.Z(r.lab ? r.lab[1] : (y1 + y2) / 2));
        group.add(anchor);
        const size = Math.max(...r.r.map(([p, q, s, u]) => Math.max(s - p, u - q))) * this.S;
        const rt: RoomRT = { def: r, meshes, label: el, anchor, size };
        meshes.forEach((m) => (m.userData.room = rt));
        return rt;
      });

      (f.slabs ?? []).forEach((s) => this.edges(this.box(...s, base, top, solid(C.out, 0.85), false), C.faint, 0.9));
      (f.voids ?? []).forEach(([x1, y1, x2, y2]) =>
        this.dashed([[x1, y1], [x2, y2], [x2, y1], [x1, y2], [x1, y1], [x2, y1], [x2, y1], [x2, y2], [x2, y2], [x1, y2], [x1, y2], [x1, y1]], 0.12, 0.3, 0.22));
      const walls: WallRT[] = [];
      (f.walls ?? []).forEach((s) => this.wall(s, 'w', walls));
      (f.glass ?? []).forEach((s) => this.wall(s, 'g', walls));
      (f.rails ?? []).forEach((s) => this.wall(s, 'rail', walls));
      f.build?.(this.helpers());
      return { def: f, id: i, group, rooms, walls };
    });
    this.cur = this.scene;
    return { def: t, root, len, lot: [(c - a + 2 * pad) * S0, (d - b + 2 * pad) * S0], floors };
  }

  /* ---------------- state ---------------- */
  private applyWalls() {
    for (const f of this.T.floors) {
      const top = f.id === this.floor;
      const s = WALL_SCALE[top ? this.wallMode : 0];
      for (const { m, kind } of f.walls) {
        if (kind === 'rail') { m.visible = true; continue; }
        if (kind === 'g') { m.visible = !top || this.wallMode === 0; continue; }
        m.visible = s > 0;
        m.scale.y = s || 1;
      }
    }
  }

  private paint() {
    const gold = new THREE.Color(C.gold);
    for (const t of this.types) for (const f of t.floors) for (const r of f.rooms) {
      const on = t === this.T && (r === this.selected || r === this.hovered);
      for (const m of r.meshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (on) { mat.color.copy(gold); mat.opacity = r === this.selected ? 0.6 : 0.35; mat.transparent = true; }
        else { mat.color.setHex(m.userData.base); mat.opacity = m.userData.baseOp; }
        (m.userData.edges.material as THREE.LineBasicMaterial).color.setHex(on ? C.gold : r.def.k === 'pool' ? C.poolEdge : C.faint);
      }
      r.label.classList.toggle('is-on', on);
      r.label.classList.toggle('is-off', !(t === this.T && f.id === this.floor));
    }
  }

  private select(r: RoomRT | null) {
    this.selected = r;
    this.paint();
    if (!r) { this.onSelect(null); return; }
    const f = this.T.floors[this.floor].def;
    this.onSelect({ n: r.def.n, name: r.def.name, sqm: r.def.sqm, share: (r.def.sqm / f.area) * 100 });
    const p = new THREE.Vector3();
    r.anchor.getWorldPosition(p);
    p.y = this.floor * FH;
    const d = Math.max(8, r.size * 1.6) * (this.camera.aspect < 1 ? 1.25 : 1);
    this.flyTo(this.portrait() ? new THREE.Vector3(p.x + d * 0.6, p.y + d * 1.05, p.z + d * 0.2) : new THREE.Vector3(p.x - d * 0.2, p.y + d * 0.95, p.z + d * 0.7), p);
    this.view = null;
    this.onViewChange(null);
  }

  /* ---------------- camera ---------------- */
  private portrait = () => this.camera.aspect < 0.9;

  /** Height that frames the whole lot from straight above, for this stage's
   *  shape. Fixed multiples of the length were tuned for one aspect and left
   *  the house tiny on a phone. Portrait turns the lot so its length runs
   *  up the screen. */
  private fit() {
    const [lx, lz] = this.T.lot, t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), a = this.camera.aspect;
    const [v, h] = this.portrait() ? [lx * 1.07, lz] : [lz, lx];
    return Math.max(v / 2 / t, h / 2 / (t * a)) * 1.02 + FH * 0.5;
  }

  private views: Record<ViewName, () => [THREE.Vector3, THREE.Vector3]> = {
    overview: () => {
      const y = this.floor * FH, L = this.T.len, V = THREE.Vector3;
      if (this.portrait()) return [new V(1.3, 1.9, 0.5).normalize().multiplyScalar(this.fit() * 1.12).add(new V(0, y, 0)), new V(0, y, 0)];
      const k = this.camera.aspect < 1.2 ? 1.3 : 1;
      return [new V(-0.36 * L * k, y + 0.92 * L * k, 1.08 * L * k), new V(0, y, 0)];
    },
    plan: () => {
      const y = this.floor * FH, L = this.T.len, V = THREE.Vector3;
      const d = this.fit();
      // Nudged so the lot sits above the view buttons along the bottom.
      if (this.portrait()) { const o = this.T.lot[0] * 0.035; return [new V(d * 0.03 + o, y + d, 0), new V(o, y, 0)]; }
      // Wide stages keep the framing the desktop was tuned to.
      const k = this.camera.aspect < 1.2 ? 1.5 : 1;
      return [new V(0, y + 1.35 * L * k, 0.4), new V(0, y, 0)];
    },
    street: () => {
      const L = this.T.len, f = this.floor, V = THREE.Vector3;
      if (this.portrait()) return [new V(0.4 * L, 3 + f * 1.4, 1.1 * L), new V(-0.05 * L, 2.5 + f * 1.4, 0)];
      return [new V(0.25 * L, 4 + f * 1.2, 1.05 * L), new V(0, 2.5 + f * 1.4, 0)];
    },
  };

  private flyTo(p: THREE.Vector3, t: THREE.Vector3, dur = 1100) {
    if (this.reduce) { this.camera.position.copy(p); this.controls.target.copy(t); return; }
    this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: p, t1: t, s: performance.now(), dur };
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pt = this.portrait();
    if (this.wasPortrait !== null && pt !== this.wasPortrait && this.view && this.T) {
      const [p, t] = this.views[this.view]();
      this.camera.position.copy(p);
      this.controls.target.copy(t);
    }
    this.wasPortrait = pt;
  }

  private tick(now: number) {
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.s) / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, e);
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /* ---------------- picking ---------------- */
  private pick(e: PointerEvent): RoomRT | null {
    const b = this.renderer.domElement.getBoundingClientRect();
    const ptr = new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ptr, this.camera);
    const f = this.T.floors[this.floor];
    const objs = [...f.rooms.flatMap((r) => r.meshes), ...f.walls.filter((w) => w.m.visible).map((w) => w.m)];
    const hit = ray.intersectObjects(objs, false)[0];
    return (hit?.object.userData.room as RoomRT) ?? null;
  }

  private bindPointer() {
    const cv = this.renderer.domElement;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const r = this.pick(e);
      if (r !== this.hovered) { this.hovered = r; this.paint(); cv.style.cursor = r ? 'pointer' : ''; }
    });
    cv.addEventListener('pointerdown', (e) => { this.down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', (e) => {
      if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) < 6) this.select(this.pick(e));
      this.down = null;
    });
  }
}
