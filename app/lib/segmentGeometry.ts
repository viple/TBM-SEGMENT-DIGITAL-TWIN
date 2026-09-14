import * as THREE from "three";

/**
 * 双面楔形环的真实放样几何。
 *
 * - 端面为关于环中面对称的真实倾斜平面：前端面 z = 环宽/2 − (楔形量/(4·外半径))·r·cos(θ − θK)，
 *   后端面 z = −环宽/2 + (楔形量/(4·外半径))·r·cos(θ − θK)，z 随半径线性变化（平面），
 *   最小环宽在外径、封顶块对称中心线（θ = θK）处。
 * - 前端面角位 [frontStart, frontEnd]，后端面角位 [backStart, backEnd]（由接缝偏移错位），
 *   左右接缝面为连接前后端面对应径向线段的直纹面，外/内弧面为直纹面。
 *
 * 所有参数均为米（radians 为弧度）。
 */
export function buildSegmentGeometry(
  inner: number,
  outer: number,
  frontStart: number,
  frontEnd: number,
  backStart: number,
  backEnd: number,
  ringWidth: number,
  wedgeAmount: number,
  keyAngle: number,
  segments = 64,
) {
  const slope = wedgeAmount / (4 * outer);
  const frontZ = (theta: number, r: number) => ringWidth / 2 - slope * r * Math.cos(theta - keyAngle);
  const backZ = (theta: number, r: number) => -ringWidth / 2 + slope * r * Math.cos(theta - keyAngle);
  const positions: number[] = [];
  const indices: number[] = [];

  const ringBand = (count: number, fn: (u: number) => [number, number, number]) => {
    const base = positions.length / 3;
    for (let i = 0; i <= count; i += 1) {
      const [x, y, z] = fn(i / count);
      positions.push(x, y, z);
    }
    return base;
  };

  // 四个环带：前外 → 后外 → 后内 → 前内
  const outerFront = ringBand(segments, (u) => {
    const theta = frontStart + (frontEnd - frontStart) * u;
    return [outer * Math.cos(theta), outer * Math.sin(theta), frontZ(theta, outer)];
  });
  const outerBack = ringBand(segments, (u) => {
    const theta = backStart + (backEnd - backStart) * u;
    return [outer * Math.cos(theta), outer * Math.sin(theta), backZ(theta, outer)];
  });
  const innerBack = ringBand(segments, (u) => {
    const theta = backStart + (backEnd - backStart) * u;
    return [inner * Math.cos(theta), inner * Math.sin(theta), backZ(theta, inner)];
  });
  const innerFront = ringBand(segments, (u) => {
    const theta = frontStart + (frontEnd - frontStart) * u;
    return [inner * Math.cos(theta), inner * Math.sin(theta), frontZ(theta, inner)];
  });

  for (let i = 0; i < segments; i += 1) {
    const of = outerFront + i;
    const of1 = outerFront + i + 1;
    const ob = outerBack + i;
    const ob1 = outerBack + i + 1;
    const ib = innerBack + i;
    const ib1 = innerBack + i + 1;
    const inf = innerFront + i;
    const inf1 = innerFront + i + 1;
    // 外弧面（法线朝外）
    indices.push(of, ob, ob1, of, ob1, of1);
    // 内弧面（法线朝内）
    indices.push(inf, ib1, ib, inf, inf1, ib1);
    // 前端面（法线朝 +z）
    indices.push(of, inf1, inf, of, of1, inf1);
    // 后端面（法线朝 −z）
    indices.push(ob, ib1, ob1, ob, ib, ib1);
  }
  // 左右接缝端盖（法线朝切线方向）
  const cap = (of: number, inf: number, ib: number, ob: number) => {
    indices.push(of, inf, ib, of, ib, ob);
  };
  cap(outerFront, innerFront, innerBack, outerBack);
  cap(
    outerFront + segments,
    innerFront + segments,
    innerBack + segments,
    outerBack + segments,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 弧形条带（产品环缝弧段）：贴楔形端面（真实平面，z 随角度与半径变化）的薄片 */
function buildArcBand(
  r0: number,
  r1: number,
  start: number,
  end: number,
  zAt: (theta: number, r: number) => number,
  thickness: number,
  segments = 48,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const N = segments;
  const theta = (u: number) => start + (end - start) * u;
  const band = (fn: (u: number) => [number, number, number]) => {
    const base = positions.length / 3;
    for (let i = 0; i <= N; i += 1) {
      const [x, y, z] = fn(i / N);
      positions.push(x, y, z);
    }
    return base;
  };
  const outerBottom = band((u) => {
    const t = theta(u);
    return [r1 * Math.cos(t), r1 * Math.sin(t), zAt(t, r1)];
  });
  const outerTop = band((u) => {
    const t = theta(u);
    return [r1 * Math.cos(t), r1 * Math.sin(t), zAt(t, r1) + thickness];
  });
  const innerTop = band((u) => {
    const t = theta(u);
    return [r0 * Math.cos(t), r0 * Math.sin(t), zAt(t, r0) + thickness];
  });
  const innerBottom = band((u) => {
    const t = theta(u);
    return [r0 * Math.cos(t), r0 * Math.sin(t), zAt(t, r0)];
  });
  for (let i = 0; i < N; i += 1) {
    const ob = outerBottom + i;
    const ob1 = outerBottom + i + 1;
    const ot = outerTop + i;
    const ot1 = outerTop + i + 1;
    const it = innerTop + i;
    const it1 = innerTop + i + 1;
    const ib = innerBottom + i;
    const ib1 = innerBottom + i + 1;
    indices.push(ob, ib1, ib, ob, ob1, ib1); // 底面（贴端面）
    indices.push(ob, ot, ot1, ob, ot1, ob1); // 外环面
    indices.push(ib, it1, it, ib, ib1, it1); // 内环面
    indices.push(ot, it1, it, ot, ot1, it1); // 顶面
  }
  const endCap = (u: number) => {
    const t = theta(u);
    const base = positions.length / 3;
    positions.push(r1 * Math.cos(t), r1 * Math.sin(t), zAt(t, r1));
    positions.push(r0 * Math.cos(t), r0 * Math.sin(t), zAt(t, r0));
    positions.push(r0 * Math.cos(t), r0 * Math.sin(t), zAt(t, r0) + thickness);
    positions.push(r1 * Math.cos(t), r1 * Math.sin(t), zAt(t, r1) + thickness);
    return base;
  };
  const cap0 = endCap(0);
  indices.push(cap0, cap0 + 1, cap0 + 2, cap0, cap0 + 2, cap0 + 3);
  const cap1 = endCap(1);
  indices.push(cap1 + 1, cap1, cap1 + 2, cap1 + 2, cap1, cap1 + 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 密封产品闭合框：前后环缝弧段贴合楔形端面（z 随角位起伏），左右纵缝直边
 * 从前端面接缝角位连到后端面接缝角位（端面为径向平面，与弧段端部共面）。
 */
export function buildProductFrame(
  radius: number,
  radialWidth: number,
  height: number,
  ringWidth: number,
  outerRadius: number,
  wedgeAmount: number,
  keyAngle: number,
  frontStart: number,
  frontEnd: number,
  backStart: number,
  backEnd: number,
  color: number,
  emissive: number,
  emissiveIntensity = 0.18,
) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.18,
    side: THREE.DoubleSide,
  });

  // 端面真实平面（与块体 buildSegmentGeometry 相同的端面方程，z 随半径线性变化）
  const slope = wedgeAmount / (4 * outerRadius);
  const frontZ = (theta: number, r: number) => ringWidth / 2 - slope * r * Math.cos(theta - keyAngle);
  const backZ = (theta: number, r: number) => -ringWidth / 2 + slope * r * Math.cos(theta - keyAngle);

  const r0 = radius - radialWidth / 2;
  const r1 = radius + radialWidth / 2;

  // 前环缝弧段：贴前端面（真实平面），z = frontZ(θ) + 0.003 ~ +0.003 + height
  const front = new THREE.Mesh(buildArcBand(r0, r1, frontStart, frontEnd, (theta, r) => frontZ(theta, r) + 0.003, height), material);
  group.add(front);

  // 后环缝弧段：贴后端面（真实平面），z = backZ(θ) − 0.003 − height ~ −0.003
  const back = new THREE.Mesh(buildArcBand(r0, r1, backStart, backEnd, (theta, r) => backZ(theta, r) - 0.003 - height, height), material);
  group.add(back);

  // 纵缝直边：斜柱体，端面为径向平面（与前后弧段端部截面完全共面），
  // 端面 z 按接缝角位、对应半径处的楔形端面取值，从前端面接缝连到后端面接缝。
  // 相邻块共享同一接缝面，直边几何完全重合会产生 z-fighting 闪烁，
  // 因此每条直边沿切线方向向所属块内部偏移 1mm（左直边 +切线、右直边 −切线）。
  const seamBar = (frontAngle: number, backAngle: number, inward: 1 | -1) => {
    const zf0o = frontZ(frontAngle, r1) + 0.003;         // 前外下
    const zf0i = frontZ(frontAngle, r0) + 0.003;         // 前内下
    const zf1o = zf0o + height;                          // 前外上
    const zf1i = zf0i + height;                          // 前内上
    const zb0o = backZ(backAngle, r1) - 0.003 - height;  // 后外下
    const zb0i = backZ(backAngle, r0) - 0.003 - height;  // 后内下
    const zb1o = zb0o + height;                          // 后外上
    const zb1i = zb0i + height;                          // 后内上
    const shift = 0.001 * inward;
    const fx = -Math.sin(frontAngle) * shift;
    const fy = Math.cos(frontAngle) * shift;
    const bx = -Math.sin(backAngle) * shift;
    const by = Math.cos(backAngle) * shift;
    const positions = new Float32Array([
      r1 * Math.cos(frontAngle) + fx, r1 * Math.sin(frontAngle) + fy, zf0o, // 0 前外下
      r0 * Math.cos(frontAngle) + fx, r0 * Math.sin(frontAngle) + fy, zf0i, // 1 前内下
      r0 * Math.cos(frontAngle) + fx, r0 * Math.sin(frontAngle) + fy, zf1i, // 2 前内上
      r1 * Math.cos(frontAngle) + fx, r1 * Math.sin(frontAngle) + fy, zf1o, // 3 前外上
      r1 * Math.cos(backAngle) + bx, r1 * Math.sin(backAngle) + by, zb0o,   // 4 后外下
      r0 * Math.cos(backAngle) + bx, r0 * Math.sin(backAngle) + by, zb0i,   // 5 后内下
      r0 * Math.cos(backAngle) + bx, r0 * Math.sin(backAngle) + by, zb1i,   // 6 后内上
      r1 * Math.cos(backAngle) + bx, r1 * Math.sin(backAngle) + by, zb1o,   // 7 后外上
    ]);
    const indices = [
      0, 1, 2, 0, 2, 3, // 前端面（法线朝切线）
      4, 7, 6, 4, 6, 5, // 后端面（法线朝反切线）
      0, 3, 7, 0, 7, 4, // 外弧面（法线朝外）
      1, 5, 6, 1, 6, 2, // 内弧面（法线朝内）
      3, 2, 6, 3, 6, 7, // 上端面（法线朝 +z）
      0, 4, 5, 0, 5, 1, // 下端面（法线朝 −z）
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, material));
  };
  seamBar(frontStart, backStart, 1);
  seamBar(frontEnd, backEnd, -1);

  return group;
}
