"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { downloadCsv, type CsvValue } from "./lib/csv";

type RingParameters = {
  projectName: string;
  outerDiameter: number;
  innerDiameter: number;
  ringWidth: number;
  startAngle: number;
  stretchRate: number;
};

type ProductParameters = {
  centerRadius: number;
  width: number;
  height: number;
};

type ProductSet = {
  epdm: ProductParameters;
  swell: ProductParameters;
};

type SegmentInput = {
  rowId: string;
  code: string;
  type: string;
  angle: number;
  outerArcFront: number;
  innerArcFront: number;
  outerArcBack: number;
  innerArcBack: number;
};

type EdgeLength = {
  code: string;
  name: string;
  length: number;
};

type CalculatedSegment = SegmentInput & {
  start: number;
  end: number;
  epdmEdges: EdgeLength[];
  swellEdges: EdgeLength[];
  epdmTotal: number;
  swellTotal: number;
};

type RuntimeSegment = {
  rowId: string;
  group: THREE.Group;
  body: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>;
  center: number;
  order: number;
};

const DEFAULT_RING: RingParameters = {
  projectName: "WC06C 衬砌圆环",
  outerDiameter: 6200,
  innerDiameter: 5500,
  ringWidth: 1200,
  startAngle: -33.75,
  stretchRate: 0,
};

const DEFAULT_PRODUCTS: ProductSet = {
  epdm: { centerRadius: 3039, width: 35, height: 16.5 },
  swell: { centerRadius: 3069, width: 25, height: 4 },
};

const DEFAULT_SEGMENTS: SegmentInput[] = [
  { rowId: "wc-b3", code: "B3", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
  { rowId: "wc-b2", code: "B2", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
  { rowId: "wc-l2", code: "L2", type: "邻接块", angle: 68.75, outerArcFront: 3684.9, innerArcFront: 3240.3, outerArcBack: 3803.2, innerArcBack: 3358.9 },
  { rowId: "wc-f", code: "F", type: "封顶块", angle: 20, outerArcFront: 1151.8, innerArcFront: 1078.9, outerArcBack: 915.1, innerArcBack: 841.6 },
  { rowId: "wc-l1", code: "L1", type: "邻接块", angle: 68.75, outerArcFront: 3803.2, innerArcFront: 3358.9, outerArcBack: 3684.9, innerArcBack: 3240.3 },
  { rowId: "wc-b1", code: "B1", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
];

const SEGMENT_COLORS = [0xc9d1d0, 0xbac7c5, 0xd7b16c, 0xe57856, 0xd4a768, 0xc4cecc, 0x8eaaa9, 0xb79b78];
const toRadians = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const meters = (millimeters: number) => `${(millimeters / 1000).toFixed(3)} m`;
const cloneSegments = () => DEFAULT_SEGMENTS.map((segment) => ({ ...segment }));
const safeNumber = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

function interpolatedArc(
  segment: SegmentInput,
  centerRadius: number,
  innerRadius: number,
  outerRadius: number,
  face: "front" | "back",
) {
  const innerArc = face === "front" ? segment.innerArcFront : segment.innerArcBack;
  const outerArc = face === "front" ? segment.outerArcFront : segment.outerArcBack;
  if (innerArc > 0 && outerArc > 0 && outerRadius > innerRadius) {
    const ratio = (centerRadius - innerRadius) / (outerRadius - innerRadius);
    return innerArc + (outerArc - innerArc) * ratio;
  }
  return centerRadius * toRadians(Math.max(0, segment.angle));
}

function productEdges(
  segment: SegmentInput,
  centerRadius: number,
  ring: RingParameters,
) {
  const outerRadius = ring.outerDiameter / 2;
  const innerRadius = ring.innerDiameter / 2;
  return [
    { code: "①", name: "前环缝弧边", length: interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "front") },
    { code: "②", name: "右纵缝直边", length: ring.ringWidth },
    { code: "③", name: "后环缝弧边", length: interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "back") },
    { code: "④", name: "左纵缝直边", length: ring.ringWidth },
  ];
}

function calculateSegments(segments: SegmentInput[], ring: RingParameters, products: ProductSet) {
  let cursor = ring.startAngle;
  return segments.map<CalculatedSegment>((segment) => {
    const angle = Math.max(0, safeNumber(segment.angle));
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    const epdmEdges = productEdges(segment, products.epdm.centerRadius, ring);
    const swellEdges = productEdges(segment, products.swell.centerRadius, ring);
    return {
      ...segment,
      angle,
      start,
      end,
      epdmEdges,
      swellEdges,
      epdmTotal: epdmEdges.reduce((sum, edge) => sum + edge.length, 0),
      swellTotal: swellEdges.reduce((sum, edge) => sum + edge.length, 0),
    };
  });
}

function annularShape(inner: number, outer: number, start: number, end: number) {
  const shape = new THREE.Shape();
  const startRad = toRadians(start);
  const endRad = toRadians(end);
  shape.moveTo(outer * Math.cos(startRad), outer * Math.sin(startRad));
  shape.absarc(0, 0, outer, startRad, endRad, false);
  shape.lineTo(inner * Math.cos(endRad), inner * Math.sin(endRad));
  shape.absarc(0, 0, inner, endRad, startRad, true);
  shape.closePath();
  return shape;
}

function sectorGeometry(inner: number, outer: number, start: number, end: number, depth: number, bevel = false) {
  const geometry = new THREE.ExtrudeGeometry(annularShape(inner, outer, start, end), {
    depth,
    bevelEnabled: bevel,
    bevelSegments: bevel ? 2 : 0,
    bevelSize: bevel ? Math.min(0.008, (outer - inner) * 0.03) : 0,
    bevelThickness: bevel ? Math.min(0.008, depth * 0.03) : 0,
    curveSegments: Math.max(24, Math.ceil(Math.abs(end - start))),
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function productFrame(
  radius: number,
  radialWidth: number,
  height: number,
  ringWidth: number,
  start: number,
  end: number,
  color: number,
  emissive: number,
) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: color === 0xff3b32 ? 0.34 : 0.16,
    roughness: 0.58,
    metalness: 0.01,
    clearcoat: 0.22,
  });
  const front = new THREE.Mesh(sectorGeometry(radius - radialWidth / 2, radius + radialWidth / 2, start, end, height), material);
  front.position.z = ringWidth / 2 + height / 2 + 0.003;
  group.add(front);
  const back = front.clone();
  back.position.z = -ringWidth / 2 - height / 2 - 0.003;
  group.add(back);

  [start, end].forEach((angle) => {
    const rad = toRadians(angle);
    const endBar = new THREE.Mesh(new THREE.BoxGeometry(radialWidth, height, ringWidth + height * 2 + 0.012), material);
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
    context.fillStyle = "rgba(5, 13, 18, 0.88)";
    context.beginPath();
    context.roundRect(42, 22, 172, 84, 24);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.32)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#eef5f2";
    context.font = "600 42px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label.slice(0, 8), 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 20;
  return sprite;
}

function applyExplode(runtime: RuntimeSegment[], progress: number, outerRadius: number) {
  const amount = progress / 100;
  runtime.forEach((item) => {
    const distance = outerRadius * 0.58 * amount;
    item.group.position.x = Math.cos(item.center) * distance;
    item.group.position.y = Math.sin(item.center) * distance;
    item.group.position.z = (item.order - (runtime.length - 1) / 2) * outerRadius * 0.035 * amount;
  });
}

function NumericField({ label, value, unit, step = 1, onChange }: { label: string; value: number; unit: string; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="v2-field">
      <span>{label}</span>
      <div><input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} /><em>{unit}</em></div>
    </label>
  );
}

export function UniversalShieldConfigurator() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const runtimeRef = useRef<RuntimeSegment[]>([]);
  const explodeRef = useRef(0);
  const [ring, setRing] = useState<RingParameters>(DEFAULT_RING);
  const [products, setProducts] = useState<ProductSet>(DEFAULT_PRODUCTS);
  const [segments, setSegments] = useState<SegmentInput[]>(cloneSegments);
  const [selectedRowId, setSelectedRowId] = useState(DEFAULT_SEGMENTS[0].rowId);
  const [explodeProgress, setExplodeProgress] = useState(0);
  const [showEpdm, setShowEpdm] = useState(true);
  const [showSwell, setShowSwell] = useState(true);
  const [transparent, setTransparent] = useState(false);

  const calculated = useMemo(() => calculateSegments(segments, ring, products), [segments, ring, products]);
  const angleSum = calculated.reduce((sum, segment) => sum + segment.angle, 0);
  const closureDelta = angleSum - 360;
  const isClosed = Math.abs(closureDelta) <= 0.05;
  const ringIsValid = ring.outerDiameter > ring.innerDiameter && ring.innerDiameter > 0 && ring.ringWidth > 0;
  const stretchFactor = 1 + Math.max(0, ring.stretchRate) / 100;
  const totals = useMemo(() => ({
    epdm: calculated.reduce((sum, segment) => sum + segment.epdmTotal, 0),
    swell: calculated.reduce((sum, segment) => sum + segment.swellTotal, 0),
  }), [calculated]);
  const selected = calculated.find((segment) => segment.rowId === selectedRowId) ?? calculated[0];

  const updateRing = <K extends keyof RingParameters>(key: K, value: RingParameters[K]) => {
    setRing((current) => ({ ...current, [key]: value }));
  };

  const updateProduct = (product: keyof ProductSet, key: keyof ProductParameters, value: number) => {
    setProducts((current) => ({ ...current, [product]: { ...current[product], [key]: value } }));
  };

  const updateSegment = (rowId: string, key: keyof Omit<SegmentInput, "rowId">, value: string | number) => {
    setSegments((current) => current.map((segment) => segment.rowId === rowId ? { ...segment, [key]: value } : segment));
  };

  const addSegment = () => {
    const index = segments.length + 1;
    const rowId = `custom-${Date.now()}`;
    setSegments((current) => [...current, {
      rowId,
      code: `S${index}`,
      type: "标准块",
      angle: 10,
      outerArcFront: 0,
      innerArcFront: 0,
      outerArcBack: 0,
      innerArcBack: 0,
    }]);
    setSelectedRowId(rowId);
  };

  const duplicateSegment = (source: SegmentInput) => {
    const rowId = `copy-${Date.now()}`;
    const copy = { ...source, rowId, code: `${source.code}-副本` };
    const index = segments.findIndex((segment) => segment.rowId === source.rowId);
    setSegments((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setSelectedRowId(rowId);
  };

  const removeSegment = (rowId: string) => {
    if (segments.length <= 1) return;
    const next = segments.filter((segment) => segment.rowId !== rowId);
    setSegments(next);
    if (selectedRowId === rowId) setSelectedRowId(next[0].rowId);
  };

  const resetToDemo = () => {
    setRing({ ...DEFAULT_RING });
    setProducts({ epdm: { ...DEFAULT_PRODUCTS.epdm }, swell: { ...DEFAULT_PRODUCTS.swell } });
    setSegments(cloneSegments());
    setSelectedRowId(DEFAULT_SEGMENTS[0].rowId);
    setExplodeProgress(0);
  };

  const exportDetails = () => {
    const rows: CsvValue[][] = [
      ["盾构管片通用建模器 V2 · 参数与产品用量明细"],
      ["项目名称", ring.projectName],
      ["外径(mm)", ring.outerDiameter, "内径(mm)", ring.innerDiameter, "环宽(mm)", ring.ringWidth],
      ["起始角(°)", ring.startAngle, "中心角合计(°)", angleSum.toFixed(3), "闭合校验", isClosed ? "通过" : `偏差 ${closureDelta.toFixed(3)}°`],
      ["安装拉伸率", `${ring.stretchRate.toFixed(1)}%`],
      ["EPDM", `${products.epdm.width} × ${products.epdm.height} mm`, "中心线半径(mm)", products.epdm.centerRadius],
      ["遇水膨胀橡胶片", `${products.swell.height} × ${products.swell.width} mm`, "中心线半径(mm)", products.swell.centerRadius],
      [],
      ["管片输入参数"],
      ["序号", "块号", "类型", "中心角(°)", "前外弧(mm)", "前内弧(mm)", "后外弧(mm)", "后内弧(mm)"],
    ];
    calculated.forEach((segment, index) => rows.push([index + 1, segment.code, segment.type, segment.angle, segment.outerArcFront, segment.innerArcFront, segment.outerArcBack, segment.innerArcBack]));
    rows.push([], ["产品用量明细"], ["记录类型", "块号", "类型", "产品", "边位", "边名称", "理论长度(m)", "参考下料(m)"]);
    calculated.forEach((segment) => {
      [
        { name: "EPDM 弹性密封垫", edges: segment.epdmEdges, total: segment.epdmTotal },
        { name: "遇水膨胀橡胶片", edges: segment.swellEdges, total: segment.swellTotal },
      ].forEach((product) => {
        rows.push(["单块小计", segment.code, segment.type, product.name, "闭合框", "四边合计", (product.total / 1000).toFixed(3), (product.total / stretchFactor / 1000).toFixed(3)]);
        product.edges.forEach((edge) => rows.push(["边长明细", segment.code, segment.type, product.name, edge.code, edge.name, (edge.length / 1000).toFixed(3), (edge.length / stretchFactor / 1000).toFixed(3)]));
      });
    });
    rows.push(
      [],
      ["整环汇总", "产品", "理论用量(m)", "参考下料(m)"],
      ["整环汇总", "EPDM 弹性密封垫", (totals.epdm / 1000).toFixed(3), (totals.epdm / stretchFactor / 1000).toFixed(3)],
      ["整环汇总", "遇水膨胀橡胶片", (totals.swell / 1000).toFixed(3), (totals.swell / stretchFactor / 1000).toFixed(3)],
    );
    const safeName = ring.projectName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "盾构管片";
    downloadCsv(`${safeName}-参数与产品用量明细-V2.csv`, rows);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !ringIsValid || calculated.length === 0) return;
    const outerRadius = ring.outerDiameter / 2000;
    const innerRadius = ring.innerDiameter / 2000;
    const ringWidth = ring.ringWidth / 1000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071117);
    scene.fog = new THREE.FogExp2(0x071117, 0.022 / Math.max(outerRadius, 0.1));
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, Math.max(200, outerRadius * 40));
    camera.position.set(outerRadius * 1.55, -outerRadius * 1.62, outerRadius * 1.12);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 0);
    controls.minDistance = outerRadius * 1.15;
    controls.maxDistance = outerRadius * 6;
    controls.saveState();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xcce7e4, 0x142027, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(outerRadius * 2, -outerRadius * 1.4, outerRadius * 2.2);
    key.castShadow = true;
    scene.add(key);
    const warm = new THREE.PointLight(0xe8a45f, 28, outerRadius * 7);
    warm.position.set(-outerRadius * 1.5, -outerRadius * 2, -outerRadius);
    scene.add(warm);

    const runtime = calculated.map<RuntimeSegment>((segment, index) => {
      const group = new THREE.Group();
      const material = new THREE.MeshPhysicalMaterial({
        color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
        roughness: 0.82,
        metalness: 0.01,
        clearcoat: 0.06,
        transparent,
        opacity: transparent ? 0.38 : 1,
        emissive: 0x000000,
      });
      const geometry = sectorGeometry(innerRadius, outerRadius, segment.start, segment.end, ringWidth, true);
      const body = new THREE.Mesh(geometry, material);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.rowId = segment.rowId;
      group.add(body);
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), new THREE.LineBasicMaterial({ color: 0x53656a, transparent: true, opacity: 0.58 })));

      const epdmRadius = products.epdm.centerRadius / 1000;
      const epdmWidth = Math.max(products.epdm.width / 1000, outerRadius * 0.006);
      const epdmHeight = Math.max(products.epdm.height / 1000, outerRadius * 0.003);
      const epdm = productFrame(epdmRadius, epdmWidth, epdmHeight, ringWidth, segment.start, segment.end, 0x030405, 0x14191a);
      epdm.visible = showEpdm;
      group.add(epdm);

      const swellWidth = Math.max(products.swell.width / 1000, outerRadius * 0.013);
      const swellHeight = Math.max(products.swell.height / 1000, outerRadius * 0.0032);
      const requestedSwellRadius = products.swell.centerRadius / 1000;
      const swellRadius = Math.max(requestedSwellRadius, outerRadius - swellWidth / 2);
      const swell = productFrame(swellRadius, swellWidth, swellHeight, ringWidth, segment.start, segment.end, 0xff3b32, 0x8f0c08);
      swell.visible = showSwell;
      group.add(swell);

      const center = toRadians((segment.start + segment.end) / 2);
      const label = textSprite(segment.code || `${index + 1}`);
      label.position.set((outerRadius - Math.max((outerRadius - innerRadius) * 0.45, 0.05)) * Math.cos(center), (outerRadius - Math.max((outerRadius - innerRadius) * 0.45, 0.05)) * Math.sin(center), ringWidth / 2 + outerRadius * 0.055);
      label.scale.set(outerRadius * 0.18, outerRadius * 0.09, 1);
      group.add(label);
      scene.add(group);
      return { rowId: segment.rowId, group, body, center, order: index };
    });
    runtimeRef.current = runtime;
    applyExplode(runtime, explodeRef.current, outerRadius);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectSegment = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(runtime.map((item) => item.body), false)[0];
      if (hit) setSelectedRowId(hit.object.userData.rowId as string);
    };
    renderer.domElement.addEventListener("pointerdown", selectSegment);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", selectSegment);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = [];
    };
  }, [calculated, products, ring, ringIsValid, showEpdm, showSwell, transparent]);

  useEffect(() => {
    explodeRef.current = explodeProgress;
    applyExplode(runtimeRef.current, explodeProgress, ring.outerDiameter / 2000);
  }, [explodeProgress, ring.outerDiameter]);

  useEffect(() => {
    runtimeRef.current.forEach((runtime) => {
      runtime.body.material.emissive.setHex(runtime.rowId === selectedRowId ? 0x3c8d81 : 0x000000);
      runtime.body.material.emissiveIntensity = runtime.rowId === selectedRowId ? 0.22 : 0;
    });
  }, [selectedRowId, calculated]);

  return (
    <main className="v2-app">
      <header className="v2-topbar">
        <div className="v2-brand">
          <span className="v2-brand-mark">V2</span>
          <div><small>PARAMETRIC SEGMENT LAB</small><h1>盾构管片通用建模器</h1></div>
        </div>
        <div className="v2-top-actions">
          <span className={`v2-closure-chip ${isClosed ? "is-valid" : "is-warning"}`}>{isClosed ? "✓ 角度闭合" : `角度偏差 ${closureDelta.toFixed(2)}°`}</span>
          {/* vinext dev currently duplicates React inside next/link; a native route link avoids that runtime fault. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">返回 Demo</a>
        </div>
      </header>

      <div className="v2-content">
        <section className="v2-overview-grid">
          <aside className="v2-parameter-panel v2-card">
            <div className="v2-section-heading"><div><small>GLOBAL PARAMETERS</small><h2>全局参数</h2></div><button type="button" onClick={resetToDemo}>载入 Demo 数据</button></div>
            <label className="v2-project-field"><span>项目名称</span><input value={ring.projectName} onChange={(event) => updateRing("projectName", event.target.value)} /></label>
            <div className="v2-field-grid">
              <NumericField label="管片外径" value={ring.outerDiameter} unit="mm" onChange={(value) => updateRing("outerDiameter", value)} />
              <NumericField label="管片内径" value={ring.innerDiameter} unit="mm" onChange={(value) => updateRing("innerDiameter", value)} />
              <NumericField label="环宽" value={ring.ringWidth} unit="mm" onChange={(value) => updateRing("ringWidth", value)} />
              <NumericField label="模型起始角" value={ring.startAngle} unit="°" step={0.1} onChange={(value) => updateRing("startAngle", value)} />
              <NumericField label="安装拉伸率" value={ring.stretchRate} unit="%" step={0.1} onChange={(value) => updateRing("stretchRate", value)} />
            </div>

            <div className="v2-product-block">
              <div className="v2-product-title"><span className="v2-dot v2-dot-black" /><b>EPDM 弹性密封垫</b><small>{products.epdm.width} × {products.epdm.height} mm</small></div>
              <div className="v2-field-grid v2-field-grid-three">
                <NumericField label="中心线半径" value={products.epdm.centerRadius} unit="mm" onChange={(value) => updateProduct("epdm", "centerRadius", value)} />
                <NumericField label="截面宽" value={products.epdm.width} unit="mm" step={0.5} onChange={(value) => updateProduct("epdm", "width", value)} />
                <NumericField label="截面高" value={products.epdm.height} unit="mm" step={0.5} onChange={(value) => updateProduct("epdm", "height", value)} />
              </div>
            </div>

            <div className="v2-product-block v2-product-red">
              <div className="v2-product-title"><span className="v2-dot v2-dot-red" /><b>遇水膨胀橡胶片</b><small>{products.swell.height} × {products.swell.width} mm</small></div>
              <div className="v2-field-grid v2-field-grid-three">
                <NumericField label="中心线半径" value={products.swell.centerRadius} unit="mm" onChange={(value) => updateProduct("swell", "centerRadius", value)} />
                <NumericField label="截面宽" value={products.swell.width} unit="mm" step={0.5} onChange={(value) => updateProduct("swell", "width", value)} />
                <NumericField label="截面高" value={products.swell.height} unit="mm" step={0.5} onChange={(value) => updateProduct("swell", "height", value)} />
              </div>
            </div>
          </aside>

          <section className="v2-model-card v2-card" aria-label="参数化盾构管片三维模型">
            <div ref={mountRef} className="v2-canvas" />
            <div className="v2-model-head">
              <div><small>LIVE 3D MODEL</small><b>{ring.projectName || "未命名圆环"}</b></div>
              <span>{calculated.length} 块 · {angleSum.toFixed(2)}°</span>
            </div>
            {!ringIsValid && <div className="v2-model-error">外径必须大于内径，且环宽需要大于 0</div>}
            {selected && <div className="v2-selected-card"><small>当前选中</small><b>{selected.code} · {selected.type}</b><span>EPDM {meters(selected.epdmTotal)} · 红框 {meters(selected.swellTotal)}</span></div>}
            <div className="v2-model-controls">
              <button className={showEpdm ? "is-on" : ""} type="button" onClick={() => setShowEpdm((value) => !value)}><i className="v2-dot v2-dot-black" />EPDM</button>
              <button className={showSwell ? "is-on" : ""} type="button" onClick={() => setShowSwell((value) => !value)}><i className="v2-dot v2-dot-red" />红框</button>
              <button className={transparent ? "is-on" : ""} type="button" onClick={() => setTransparent((value) => !value)}>半透明</button>
              <button type="button" onClick={() => controlsRef.current?.reset()}>重置视角</button>
            </div>
            <label className="v2-explode-control"><span>拆解程度 <b>{explodeProgress}%</b></span><input type="range" min="0" max="100" value={explodeProgress} onChange={(event) => setExplodeProgress(Number(event.target.value))} /></label>
          </section>
        </section>

        <section className="v2-summary-grid">
          <article className="v2-stat-card"><small>管片数量</small><b>{calculated.length}</b><span>表格行数</span></article>
          <article className={`v2-stat-card ${isClosed ? "" : "is-alert"}`}><small>中心角合计</small><b data-testid="angle-sum">{angleSum.toFixed(2)}°</b><span>{isClosed ? "闭合校验通过" : `距离 360° 还差 ${(-closureDelta).toFixed(2)}°`}</span></article>
          <article className="v2-stat-card"><small><i className="v2-dot v2-dot-black" />EPDM 整环</small><b>{meters(totals.epdm)}</b><span>下料 {meters(totals.epdm / stretchFactor)}</span></article>
          <article className="v2-stat-card v2-stat-red"><small><i className="v2-dot v2-dot-red" />膨胀橡胶片整环</small><b>{meters(totals.swell)}</b><span>下料 {meters(totals.swell / stretchFactor)}</span></article>
        </section>

        <section className="v2-table-card v2-card">
          <div className="v2-section-heading v2-table-heading">
            <div><small>SEGMENT INPUT TABLE</small><h2>管片数据输入表</h2><p>弧长单位为 mm；留空或填 0 时按中心角与对应中心线半径计算。</p></div>
            <div className="v2-table-actions"><button type="button" onClick={addSegment}>＋ 新增一块</button><button className="v2-primary-action" type="button" onClick={exportDetails}>↓ 导出参数与用量明细</button></div>
          </div>
          <div className="v2-table-scroll">
            <table className="v2-input-table">
              <thead><tr><th>#</th><th>块号</th><th>类型</th><th>中心角 °</th><th>前外弧 mm</th><th>前内弧 mm</th><th>后外弧 mm</th><th>后内弧 mm</th><th>单块 EPDM</th><th>单块红框</th><th>操作</th></tr></thead>
              <tbody>
                {calculated.map((segment, index) => (
                  <tr key={segment.rowId} className={selectedRowId === segment.rowId ? "is-selected" : ""} onClick={() => setSelectedRowId(segment.rowId)}>
                    <td>{index + 1}</td>
                    <td><input aria-label={`第 ${index + 1} 块块号`} value={segment.code} onChange={(event) => updateSegment(segment.rowId, "code", event.target.value)} /></td>
                    <td><input aria-label={`${segment.code} 类型`} value={segment.type} onChange={(event) => updateSegment(segment.rowId, "type", event.target.value)} /></td>
                    <td><input aria-label={`${segment.code} 中心角`} type="number" step="0.01" value={segment.angle} onChange={(event) => updateSegment(segment.rowId, "angle", Number(event.target.value))} /></td>
                    <td><input aria-label={`${segment.code} 前外弧`} type="number" step="0.1" value={segment.outerArcFront} onChange={(event) => updateSegment(segment.rowId, "outerArcFront", Number(event.target.value))} /></td>
                    <td><input aria-label={`${segment.code} 前内弧`} type="number" step="0.1" value={segment.innerArcFront} onChange={(event) => updateSegment(segment.rowId, "innerArcFront", Number(event.target.value))} /></td>
                    <td><input aria-label={`${segment.code} 后外弧`} type="number" step="0.1" value={segment.outerArcBack} onChange={(event) => updateSegment(segment.rowId, "outerArcBack", Number(event.target.value))} /></td>
                    <td><input aria-label={`${segment.code} 后内弧`} type="number" step="0.1" value={segment.innerArcBack} onChange={(event) => updateSegment(segment.rowId, "innerArcBack", Number(event.target.value))} /></td>
                    <td className="v2-number-cell">{meters(segment.epdmTotal)}</td>
                    <td className="v2-number-cell v2-red-number">{meters(segment.swellTotal)}</td>
                    <td><div className="v2-row-actions"><button type="button" aria-label={`复制 ${segment.code}`} onClick={(event) => { event.stopPropagation(); duplicateSegment(segment); }}>复制</button><button type="button" aria-label={`删除 ${segment.code}`} disabled={segments.length <= 1} onClick={(event) => { event.stopPropagation(); removeSegment(segment.rowId); }}>删除</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="v2-detail-card v2-card">
          <div className="v2-section-heading"><div><small>USAGE BREAKDOWN</small><h2>逐块产品用量</h2></div><span>理论中心线长度 / 参考下料长度</span></div>
          {selected && (
            <div className="v2-edge-breakdown">
              <div className="v2-edge-breakdown-title"><b>{selected.code} · {selected.type}</b><span>当前选中管片四边明细 · 单位 m</span></div>
              <div className="v2-edge-grid v2-edge-grid-head"><span>边位</span><b>EPDM 黑</b><b>膨胀条 红</b></div>
              {selected.epdmEdges.map((edge, index) => (
                <div className="v2-edge-grid" key={edge.code}>
                  <span><i>{edge.code}</i>{edge.name}</span>
                  <b>{(edge.length / 1000).toFixed(3)}</b>
                  <b>{(selected.swellEdges[index].length / 1000).toFixed(3)}</b>
                </div>
              ))}
              <div className="v2-edge-grid v2-edge-total"><span>四边合计</span><b>{(selected.epdmTotal / 1000).toFixed(3)}</b><b>{(selected.swellTotal / 1000).toFixed(3)}</b></div>
            </div>
          )}
          <div className="v2-detail-scroll">
            <table className="v2-detail-table">
              <thead><tr><th>块号</th><th>类型</th><th>中心角</th><th>EPDM 理论</th><th>EPDM 下料</th><th>红框理论</th><th>红框下料</th></tr></thead>
              <tbody>{calculated.map((segment) => <tr key={segment.rowId} onClick={() => setSelectedRowId(segment.rowId)} className={selectedRowId === segment.rowId ? "is-selected" : ""}><td><b>{segment.code}</b></td><td>{segment.type}</td><td>{segment.angle.toFixed(2)}°</td><td>{meters(segment.epdmTotal)}</td><td>{meters(segment.epdmTotal / stretchFactor)}</td><td className="v2-red-number">{meters(segment.swellTotal)}</td><td className="v2-red-number">{meters(segment.swellTotal / stretchFactor)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>整环合计</td><td>{meters(totals.epdm)}</td><td>{meters(totals.epdm / stretchFactor)}</td><td>{meters(totals.swell)}</td><td>{meters(totals.swell / stretchFactor)}</td></tr></tfoot>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
