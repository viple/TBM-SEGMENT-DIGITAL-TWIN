"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type SegmentDefinition = {
  id: string;
  type: string;
  start: number;
  end: number;
  angle: number;
  color: number;
  explodeOrder: number;
  outerArcFront: number;
  innerArcFront: number;
  outerArcBack: number;
  innerArcBack: number;
};

type RuntimeSegment = {
  definition: SegmentDefinition;
  group: THREE.Group;
  body: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>;
  edges: THREE.LineSegments;
  epdm: THREE.Group;
  swell: THREE.Group;
  center: number;
};

const OUTER_RADIUS = 3.1;
const INNER_RADIUS = 2.75;
const RING_WIDTH = 1.2;
const EPDM_RADIUS = 3.039;
const SWELL_RADIUS = 3.069;

const SEGMENTS: SegmentDefinition[] = [
  { id: "B3", type: "标准块", start: -33.75, end: 33.75, angle: 67.5, color: 0xcfd5d5, explodeOrder: 4, outerArcFront: 3.6521, innerArcFront: 3.2398, outerArcBack: 3.6521, innerArcBack: 3.2398 },
  { id: "B2", type: "标准块", start: 33.75, end: 101.25, angle: 67.5, color: 0xbec8c7, explodeOrder: 3, outerArcFront: 3.6521, innerArcFront: 3.2398, outerArcBack: 3.6521, innerArcBack: 3.2398 },
  { id: "L2", type: "邻接块", start: 101.25, end: 170, angle: 68.75, color: 0xd8b46c, explodeOrder: 1, outerArcFront: 3.6849, innerArcFront: 3.2403, outerArcBack: 3.8032, innerArcBack: 3.3589 },
  { id: "F", type: "封顶块", start: 170, end: 190, angle: 20, color: 0xe56f51, explodeOrder: 0, outerArcFront: 1.1518, innerArcFront: 1.0789, outerArcBack: 0.9151, innerArcBack: 0.8416 },
  { id: "L1", type: "邻接块", start: 190, end: 258.75, angle: 68.75, color: 0xd8a968, explodeOrder: 2, outerArcFront: 3.8032, innerArcFront: 3.3589, outerArcBack: 3.6849, innerArcBack: 3.2403 },
  { id: "B1", type: "标准块", start: 258.75, end: 326.25, angle: 67.5, color: 0xc7cfce, explodeOrder: 5, outerArcFront: 3.6521, innerArcFront: 3.2398, outerArcBack: 3.6521, innerArcBack: 3.2398 },
];

const toRadians = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOut = (value: number) => value * value * (3 - 2 * value);

const interpolatedArc = (definition: SegmentDefinition, radius: number, face: "front" | "back") => {
  const ratio = (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS);
  const inner = face === "front" ? definition.innerArcFront : definition.innerArcBack;
  const outer = face === "front" ? definition.outerArcFront : definition.outerArcBack;
  return inner + (outer - inner) * ratio;
};

const frameEdges = (definition: SegmentDefinition, radius: number) => [
  { code: "①", name: "前环缝弧边", length: interpolatedArc(definition, radius, "front") },
  { code: "②", name: "右纵缝直边", length: RING_WIDTH },
  { code: "③", name: "后环缝弧边", length: interpolatedArc(definition, radius, "back") },
  { code: "④", name: "左纵缝直边", length: RING_WIDTH },
];

const theoreticalLength = (definition: SegmentDefinition, radius: number) =>
  frameEdges(definition, radius).reduce((sum, edge) => sum + edge.length, 0);

const meters = (value: number) => `${value.toFixed(3)} m`;

function annularShape(inner: number, outer: number, start: number, end: number) {
  const shape = new THREE.Shape();
  const s = toRadians(start);
  const e = toRadians(end);
  shape.moveTo(outer * Math.cos(s), outer * Math.sin(s));
  shape.absarc(0, 0, outer, s, e, false);
  shape.lineTo(inner * Math.cos(e), inner * Math.sin(e));
  shape.absarc(0, 0, inner, e, s, true);
  shape.closePath();
  return shape;
}

function sectorGeometry(
  inner: number,
  outer: number,
  start: number,
  end: number,
  depth: number,
  bevel = false,
) {
  const geometry = new THREE.ExtrudeGeometry(annularShape(inner, outer, start, end), {
    depth,
    bevelEnabled: bevel,
    bevelSegments: bevel ? 2 : 0,
    bevelSize: bevel ? 0.008 : 0,
    bevelThickness: bevel ? 0.008 : 0,
    curveSegments: Math.max(32, Math.ceil((end - start) * 1.2)),
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function productFrame(
  radius: number,
  radialWidth: number,
  height: number,
  definition: SegmentDefinition,
  color: number,
  emissive: number,
) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0.18,
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.18,
  });

  const front = new THREE.Mesh(
    sectorGeometry(
      radius - radialWidth / 2,
      radius + radialWidth / 2,
      definition.start,
      definition.end,
      height,
    ),
    material,
  );
  front.position.z = RING_WIDTH / 2 + height / 2 + 0.003;
  group.add(front);

  const back = front.clone();
  back.position.z = -RING_WIDTH / 2 - height / 2 - 0.003;
  group.add(back);

  [definition.start, definition.end].forEach((angle) => {
    const rad = toRadians(angle);
    const endBar = new THREE.Mesh(
      new THREE.BoxGeometry(radialWidth, height, RING_WIDTH + height * 2 + 0.012),
      material,
    );
    endBar.position.set(radius * Math.cos(rad), radius * Math.sin(rad), 0);
    endBar.rotation.z = rad;
    group.add(endBar);
  });

  return group;
}

function textSprite(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(8, 18, 26, 0.82)";
    context.beginPath();
    context.roundRect(52, 22, 152, 84, 24);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#f7faf8";
    context.font = "600 44px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(0.58, 0.29, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function ShieldSegmentViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<RuntimeSegment[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  const directionRef = useRef(1);
  const settingsRef = useRef({ showEpdm: true, showSwell: true, transparent: false, fullTransparent: false });
  const soloRef = useRef<string | null>(null);
  const selectedRef = useRef("F");

  const [selected, setSelected] = useState("F");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });
  const [showEpdm, setShowEpdm] = useState(true);
  const [showSwell, setShowSwell] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [fullTransparent, setFullTransparent] = useState(false);
  const [soloSegment, setSoloSegment] = useState<string | null>(null);
  const [explodeProgress, setExplodeProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stretchRate, setStretchRate] = useState(0);

  const selectedDefinition = SEGMENTS.find((segment) => segment.id === selected) ?? SEGMENTS[0];
  const selectedEpdm = theoreticalLength(selectedDefinition, EPDM_RADIUS);
  const selectedSwell = theoreticalLength(selectedDefinition, SWELL_RADIUS);

  const totals = useMemo(
    () => ({
      epdm: SEGMENTS.reduce((sum, segment) => sum + theoreticalLength(segment, EPDM_RADIUS), 0),
      swell: SEGMENTS.reduce((sum, segment) => sum + theoreticalLength(segment, SWELL_RADIUS), 0),
    }),
    [],
  );

  const cutFactor = 1 + stretchRate / 100;

  useEffect(() => {
    progressRef.current = explodeProgress;
  }, [explodeProgress]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    soloRef.current = soloSegment;
  }, [soloSegment]);

  useEffect(() => {
    settingsRef.current = { showEpdm, showSwell, transparent, fullTransparent };
    runtimeRef.current.forEach((runtime) => {
      runtime.epdm.visible = showEpdm;
      runtime.swell.visible = showSwell;
      runtime.body.material.opacity = fullTransparent ? 0 : transparent ? 0.42 : 1;
      runtime.body.material.transparent = transparent || fullTransparent;
      runtime.body.material.depthWrite = !transparent && !fullTransparent;
      runtime.edges.visible = !fullTransparent;
    });
  }, [showEpdm, showSwell, transparent, fullTransparent]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b151c);
    scene.fog = new THREE.FogExp2(0x0b151c, 0.024);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(7.6, -6.2, 8.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 6.5;
    controls.maxDistance = 20;
    controls.target.set(0, 0, 0);
    controls.saveState();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xc7e7f1, 0x182027, 2.35));
    const key = new THREE.DirectionalLight(0xffffff, 4.5);
    key.position.set(5, 7, 9);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x79d6ca, 3.2);
    rim.position.set(-7, 1, 4);
    scene.add(rim);
    const warm = new THREE.DirectionalLight(0xf0ae66, 1.4);
    warm.position.set(2, -8, -3);
    scene.add(warm);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(3.43, 3.46, 160),
      new THREE.MeshBasicMaterial({ color: 0x315867, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    halo.position.z = -RING_WIDTH / 2 - 0.25;
    scene.add(halo);

    const runtime: RuntimeSegment[] = SEGMENTS.map((definition) => {
      const group = new THREE.Group();
      const material = new THREE.MeshPhysicalMaterial({
        color: definition.color,
        roughness: 0.84,
        metalness: 0.01,
        clearcoat: 0.05,
        emissive: 0x000000,
        emissiveIntensity: 0,
      });
      const geometry = sectorGeometry(
        INNER_RADIUS,
        OUTER_RADIUS,
        definition.start,
        definition.end,
        RING_WIDTH,
        true,
      );
      const body = new THREE.Mesh(geometry, material);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.segmentId = definition.id;
      group.add(body);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 24),
        new THREE.LineBasicMaterial({ color: 0x5d686b, transparent: true, opacity: 0.56 }),
      );
      group.add(edges);

      const epdm = productFrame(EPDM_RADIUS, 0.035, 0.0165, definition, 0x050607, 0x1a1d1e);
      const swell = productFrame(SWELL_RADIUS, 0.025, 0.004, definition, 0xd9342b, 0x761611);
      group.add(epdm, swell);

      const center = toRadians((definition.start + definition.end) / 2);
      const label = textSprite(definition.id);
      label.position.set(2.91 * Math.cos(center), 2.91 * Math.sin(center), RING_WIDTH / 2 + 0.17);
      group.add(label);

      scene.add(group);
      return { definition, group, body, edges, epdm, swell, center };
    });
    runtimeRef.current = runtime;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let activeHover: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial> | null = null;

    const updateHover = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hitTargets = soloRef.current
        ? runtime.filter((item) => item.definition.id === soloRef.current).map((item) => item.body)
        : runtime.map((item) => item.body);
      const hits = raycaster.intersectObjects(hitTargets, false);
      const next = (hits[0]?.object as typeof activeHover) ?? null;

      if (activeHover && activeHover !== next) {
        activeHover.material.emissive.setHex(0x000000);
        activeHover.material.emissiveIntensity = 0;
      }
      activeHover = next;
      if (activeHover) {
        activeHover.material.emissive.setHex(0x77d2c3);
        activeHover.material.emissiveIntensity = 0.22;
        const id = activeHover.userData.segmentId as string;
        setHovered(id);
        setTooltip({ visible: true, x: event.clientX - rect.left + 18, y: event.clientY - rect.top + 18 });
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHovered(null);
        setTooltip((current) => ({ ...current, visible: false }));
        renderer.domElement.style.cursor = "grab";
      }
    };

    const selectAtPointer = () => {
      if (!activeHover) return;
      setSelected(activeHover.userData.segmentId as string);
    };

    const isolateAtPointer = () => {
      if (!activeHover) return;
      const id = activeHover.userData.segmentId as string;
      setSelected(id);
      setSoloSegment((current) => {
        const next = current === id ? null : id;
        soloRef.current = next;
        return next;
      });
      progressRef.current = 0;
      setExplodeProgress(0);
      playingRef.current = false;
      setPlaying(false);
      controls.target.set(0, 0, 0);
    };

    const leavePointer = () => {
      if (activeHover) {
        activeHover.material.emissive.setHex(0x000000);
        activeHover.material.emissiveIntensity = 0;
      }
      activeHover = null;
      setHovered(null);
      setTooltip((current) => ({ ...current, visible: false }));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      soloRef.current = null;
      setSoloSegment(null);
    };

    renderer.domElement.addEventListener("pointermove", updateHover);
    renderer.domElement.addEventListener("pointerleave", leavePointer);
    renderer.domElement.addEventListener("click", selectAtPointer);
    renderer.domElement.addEventListener("dblclick", isolateAtPointer);
    window.addEventListener("keydown", handleKeyDown);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      camera.aspect = rect.width / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let previous = performance.now();
    let animationFrame = 0;
    const animate = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;

      if (playingRef.current) {
        const next = clamp(progressRef.current + directionRef.current * delta / 5.4);
        progressRef.current = next;
        setExplodeProgress(next);
        if (next === 0 || next === 1) {
          playingRef.current = false;
          setPlaying(false);
        }
      }

      const solo = soloRef.current;
      halo.visible = !solo;
      runtime.forEach((item) => {
        if (solo) {
          const isActive = item.definition.id === solo;
          item.group.visible = isActive;
          if (isActive) {
            const targetScale = Math.min(2.8, 1.62 * Math.sqrt(67.5 / item.definition.angle));
            const centerRadius = (OUTER_RADIUS + INNER_RADIUS) / 2;
            const targetX = -Math.cos(item.center) * centerRadius * targetScale;
            const targetY = -Math.sin(item.center) * centerRadius * targetScale;
            const smoothing = 0.13;
            item.group.scale.x += (targetScale - item.group.scale.x) * smoothing;
            item.group.scale.y = item.group.scale.x;
            item.group.scale.z = item.group.scale.x;
            item.group.position.x += (targetX - item.group.position.x) * smoothing;
            item.group.position.y += (targetY - item.group.position.y) * smoothing;
            item.group.position.z += (0 - item.group.position.z) * smoothing;
            item.group.rotation.z += (0 - item.group.rotation.z) * smoothing;
          }
        } else {
          item.group.visible = true;
          const local = easeInOut(clamp(progressRef.current * SEGMENTS.length - item.definition.explodeOrder));
          const distance = 1.22 * local;
          const targetX = Math.cos(item.center) * distance;
          const targetY = Math.sin(item.center) * distance;
          const targetZ = local * 0.08;
          const smoothing = 0.16;
          item.group.scale.x += (1 - item.group.scale.x) * smoothing;
          item.group.scale.y = item.group.scale.x;
          item.group.scale.z = item.group.scale.x;
          item.group.position.x += (targetX - item.group.position.x) * smoothing;
          item.group.position.y += (targetY - item.group.position.y) * smoothing;
          item.group.position.z += (targetZ - item.group.position.z) * smoothing;
          item.group.rotation.z += (Math.sin(item.center) * local * 0.018 - item.group.rotation.z) * smoothing;
        }
        item.epdm.visible = settingsRef.current.showEpdm;
        item.swell.visible = settingsRef.current.showSwell;
        item.body.material.opacity = settingsRef.current.fullTransparent ? 0 : settingsRef.current.transparent ? 0.42 : 1;
        item.edges.visible = !settingsRef.current.fullTransparent;
      });

      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", updateHover);
      renderer.domElement.removeEventListener("pointerleave", leavePointer);
      renderer.domElement.removeEventListener("click", selectAtPointer);
      renderer.domElement.removeEventListener("dblclick", isolateAtPointer);
      window.removeEventListener("keydown", handleKeyDown);
      controls.dispose();
      renderer.dispose();
      runtime.forEach((item) => {
        item.body.geometry.dispose();
        item.body.material.dispose();
      });
      mount.replaceChildren();
      runtimeRef.current = [];
    };
  }, []);

  const togglePlayback = () => {
    if (soloRef.current) {
      soloRef.current = null;
      setSoloSegment(null);
    }
    if (playing) {
      setPlaying(false);
      playingRef.current = false;
      return;
    }
    directionRef.current = explodeProgress >= 0.999 ? -1 : 1;
    setPlaying(true);
    playingRef.current = true;
  };

  const jumpTo = (value: number) => {
    soloRef.current = null;
    setSoloSegment(null);
    setPlaying(false);
    playingRef.current = false;
    setExplodeProgress(value);
    progressRef.current = value;
  };

  const exitSolo = () => {
    soloRef.current = null;
    setSoloSegment(null);
  };

  const hoverDefinition = hovered ? SEGMENTS.find((segment) => segment.id === hovered) : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <p>WC06C · SEGMENT DIGITAL TWIN</p>
            <h1>盾构管片密封系统</h1>
          </div>
        </div>
        <div className="project-specs" aria-label="管片主要参数">
          <span><b>Ø6200</b> 外径</span>
          <span><b>350 mm</b> 厚度</span>
          <span><b>1200 mm</b> 环宽</span>
          <span className="status-chip"><i /> 第一版模型</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel glass-panel" aria-label="三维模型控制">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ASSEMBLY CONTROL</span>
              <h2>拼装控制</h2>
            </div>
            <span className="step-count">{Math.round(explodeProgress * 100)}%</span>
          </div>

          <div className="playback-row">
            <button className="primary-button" onClick={togglePlayback} type="button">
              <span aria-hidden="true">{playing ? "Ⅱ" : explodeProgress >= 0.999 ? "↶" : "▶"}</span>
              {playing ? "暂停动画" : explodeProgress >= 0.999 ? "播放拼装" : "逐块拆解"}
            </button>
            <button className="icon-button" onClick={() => jumpTo(0)} type="button" aria-label="恢复完整拼装">↺</button>
          </div>

          <label className="range-label" htmlFor="explode-range">
            <span>完整拼装</span><span>完全拆解</span>
          </label>
          <input
            id="explode-range"
            className="range-input"
            type="range"
            min="0"
            max="100"
            value={Math.round(explodeProgress * 100)}
            onChange={(event) => jumpTo(Number(event.target.value) / 100)}
          />

          <div className="panel-divider" />

          <div className="toggle-stack">
            <button className={`toggle-row ${showEpdm ? "active" : ""}`} onClick={() => setShowEpdm((value) => !value)} type="button">
              <span className="legend-dot epdm-dot" /><span><b>EPDM 弹性密封垫</b><small>35 × 16.5 mm · 闭合框</small></span><i />
            </button>
            <button className={`toggle-row ${showSwell ? "active" : ""}`} onClick={() => setShowSwell((value) => !value)} type="button">
              <span className="legend-dot swell-dot" /><span><b>遇水膨胀橡胶片</b><small>4 × 25 mm · 闭合框</small></span><i />
            </button>
            <button
              className={`toggle-row ${transparent ? "active" : ""}`}
              onClick={() => {
                setTransparent((value) => !value);
                setFullTransparent(false);
              }}
              type="button"
            >
              <span className="legend-dot shell-dot" /><span><b>管片半透明</b><small>观察密封框转角与接缝</small></span><i />
            </button>
            <button
              className={`toggle-row ${fullTransparent ? "active" : ""}`}
              onClick={() => {
                setFullTransparent((value) => !value);
                setTransparent(false);
              }}
              type="button"
            >
              <span className="legend-dot ghost-dot" /><span><b>管片全透明</b><small>仅保留两种密封产品</small></span><i />
            </button>
          </div>

          <div className="panel-divider" />

          <div className="stretch-control">
            <div className="field-title"><span>安装拉伸率</span><strong>{stretchRate.toFixed(1)}%</strong></div>
            <input
              className="range-input accent-orange"
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={stretchRate}
              onChange={(event) => setStretchRate(Number(event.target.value))}
              aria-label="安装拉伸率"
            />
            <p>参考下料长度 = 理论中心线长度 ÷（1 + 拉伸率）</p>
          </div>

          <button className="view-reset" onClick={() => controlsRef.current?.reset()} type="button">
            <span aria-hidden="true">◎</span> 重置观察视角
          </button>
        </aside>

        <section className="viewer-card" aria-label="盾构管片三维模型">
          <div ref={mountRef} className="canvas-mount" />
          <div className="viewer-gradient" />
          <div className="orientation-note"><span>拖动旋转</span><span>滚轮缩放</span><span>点击选中</span><span>双击单块</span></div>
          <div className="axis-widget" aria-hidden="true"><i className="axis-y">Y</i><i className="axis-x">X</i><i className="axis-z">Z</i><b /></div>

          {soloSegment && (
            <button className="solo-exit" onClick={exitSolo} type="button">
              <span aria-hidden="true">←</span> 返回整环 <kbd>ESC</kbd>
            </button>
          )}

          {tooltip.visible && hoverDefinition && (
            <div className="hover-card" style={{ left: tooltip.x, top: tooltip.y }}>
              <strong>{hoverDefinition.id} · {hoverDefinition.type}</strong>
              <span>{hoverDefinition.angle.toFixed(2)}° · EPDM {meters(theoreticalLength(hoverDefinition, EPDM_RADIUS))}</span>
              <em>双击进入单块观察</em>
            </div>
          )}

          <div className="model-caption">
            <span className="live-dot"><i /></span>
            <div><b>{soloSegment ? `${soloSegment} · 单块观察模式` : "一环六分块 · 拼装状态"}</b><small>{soloSegment ? "拖动可查看四周密封框细节" : "F × 1 · L × 2 · B × 3"}</small></div>
          </div>
        </section>

        <aside className="data-panel glass-panel" aria-label="构件数据">
          <div className="panel-heading">
            <div><span className="eyebrow">SEGMENT DATA</span><h2>构件数据</h2></div>
            <span className={`segment-badge badge-${selectedDefinition.id.toLowerCase()}`}>{selectedDefinition.id}</span>
          </div>

          <div className="selected-title">
            <div><h3>{selectedDefinition.type}（{selectedDefinition.id}）</h3><p>工厂硫化闭合框 · 90° 模压角</p></div>
          </div>

          <div className="dimension-grid">
            <div><span>中心角</span><b>{selectedDefinition.angle.toFixed(2)}°</b></div>
            <div><span>外半径</span><b>3100 mm</b></div>
            <div><span>内半径</span><b>2750 mm</b></div>
            <div><span>环宽</span><b>1200 mm</b></div>
          </div>

          <div className="length-card epdm-card">
            <div className="length-title"><span className="legend-dot epdm-dot" /><div><b>EPDM 密封垫</b><small>理论中心线长度</small></div></div>
            <strong>{meters(selectedEpdm)}</strong>
            <span className="cut-length">参考下料 {meters(selectedEpdm / cutFactor)}</span>
          </div>
          <div className="length-card swell-card">
            <div className="length-title"><span className="legend-dot swell-dot" /><div><b>遇水膨胀橡胶片</b><small>理论中心线长度</small></div></div>
            <strong>{meters(selectedSwell)}</strong>
            <span className="cut-length">参考下料 {meters(selectedSwell / cutFactor)}</span>
          </div>

          <div className="edge-accordion" aria-label="各管片四边长度">
            <div className="edge-section-title"><span>各块四边长度</span><small>点击展开 · 单位 m</small></div>
            {SEGMENTS.slice().sort((a, b) => a.explodeOrder - b.explodeOrder).map((segment) => {
              const epdmEdges = frameEdges(segment, EPDM_RADIUS);
              const swellEdges = frameEdges(segment, SWELL_RADIUS);
              return (
                <details key={segment.id} open={selected === segment.id}>
                  <summary onClick={() => setSelected(segment.id)}>
                    <span>{segment.id}</span>
                    <i>{segment.type}</i>
                    <b>{meters(theoreticalLength(segment, EPDM_RADIUS))}</b>
                  </summary>
                  <div className="edge-table">
                    <div className="edge-table-head"><span>边位</span><b>EPDM 黑</b><b>膨胀条 红</b></div>
                    {epdmEdges.map((edge, index) => (
                      <div className="edge-table-row" key={edge.code}>
                        <span><i>{edge.code}</i>{edge.name}</span>
                        <b>{edge.length.toFixed(3)}</b>
                        <b>{swellEdges[index].length.toFixed(3)}</b>
                      </div>
                    ))}
                    <div className="edge-physical">
                      <span>管片弧边参考</span>
                      <small>外弧 前/后 {segment.outerArcFront.toFixed(3)} / {segment.outerArcBack.toFixed(3)}</small>
                      <small>内弧 前/后 {segment.innerArcFront.toFixed(3)} / {segment.innerArcBack.toFixed(3)}</small>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>

          <div className="formula-note">
            <span>计算口径</span>
            <p>弧边按模板图内外弧插值得到密封中心线长度，直边暂按 1200 mm；转角按 90° 理论交点，不计模压圆角修正。</p>
          </div>
        </aside>
      </section>

      <footer className="summary-bar">
        <div className="summary-intro"><span>Σ</span><div><b>单环理论用量</b><small>6 个独立闭合框 · 暂不含损耗</small></div></div>
        <div className="summary-metric"><span className="legend-dot epdm-dot" /><div><small>EPDM 合计</small><b>{meters(totals.epdm)}</b></div><em>下料 {meters(totals.epdm / cutFactor)}</em></div>
        <div className="summary-metric"><span className="legend-dot swell-dot" /><div><small>遇水膨胀橡胶片合计</small><b>{meters(totals.swell)}</b></div><em>下料 {meters(totals.swell / cutFactor)}</em></div>
        <div className="accuracy-note"><i /> 当前为结构图纸驱动的第一版几何模型</div>
      </footer>
    </main>
  );
}
