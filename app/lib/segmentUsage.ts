/**
 * 管片算量内核（纯函数，无 React / three.js 依赖）。
 *
 * 口径说明（与 V2 建模器页面一致）：
 * - 弧边长度：按产品中心线半径在内外弧之间线性插值；
 * - 纵缝直边：√(局部环宽² + 接缝偏移²)，局部环宽按双面楔形 B(θ) = 环宽 − (楔形量/2)·cos(θ − θK)；
 * - 楔形接缝偏移默认以封顶块中心线对称自动推算，可手动覆盖；
 * - 单块用量 = 闭合框四边中心线长度之和；参考下料 = 理论长度 ÷ (1 + 安装拉伸率)。
 *
 * 该内核同时被两处消费：
 * 1) 本站 V2 建模器页面（三维预览 + 表格）；
 * 2) 橡胶 ERP「管片算量」模块（通过 buildUsagePayload 导出的 JSON 接入）。
 * 因此除算法外，这里的类型与常量即为跨系统数据契约。
 */

export const SCHEMA_VERSION = "tbm-segment-usage/v2";

export type ProductKey = "epdm" | "swell";

export const PRODUCT_KEYS: ProductKey[] = ["epdm", "swell"];

export const PRODUCT_LABELS: Record<ProductKey, string> = {
  epdm: "EPDM 弹性密封垫",
  swell: "遇水膨胀橡胶片",
};

export type RingParameters = {
  projectName: string;
  outerDiameter: number;
  innerDiameter: number;
  ringWidth: number;
  /** 楔形量(mm)：双面楔形，最小环宽在封顶块对称中心线，0 = 等宽环 */
  wedgeAmount: number;
  startAngle: number;
  stretchRate: number;
};

export type ProductParameters = {
  centerRadius: number;
  width: number;
  height: number;
};

export type ProductSet = Record<ProductKey, ProductParameters>;

export type SegmentInput = {
  rowId: string;
  code: string;
  type: string;
  angle: number;
  outerArcFront: number;
  innerArcFront: number;
  outerArcBack: number;
  innerArcBack: number;
  /** 左缝楔形偏移(mm)，空 = 自动按封顶块中心对称计算 */
  wedgeOffsetLeft?: number | null;
  /** 右缝楔形偏移(mm)，空 = 自动按封顶块中心对称计算 */
  wedgeOffsetRight?: number | null;
};

export type EdgeLength = {
  code: string;
  name: string;
  length: number;
};

export type CalculatedSegment = SegmentInput & {
  /** 前端面角位（度，由前外弧沿环累加） */
  start: number;
  end: number;
  /** 后端面角位（度，接缝偏移错位后，EPDM 中心线半径定义） */
  backStart: number;
  backEnd: number;
  /** 后端面角位（度，遇水膨胀橡胶片中心线半径定义） */
  swellBackStart: number;
  swellBackEnd: number;
  /** 左/右接缝处的局部环宽(mm)：B(θ) = 环宽 − (楔形量/2)·cos(θ − θK) */
  leftRingWidth: number;
  rightRingWidth: number;
  /** 自动计算的左/右缝偏移(mm，EPDM 中心线半径处) */
  autoLeftOffset: number;
  autoRightOffset: number;
  /** 生效的左/右缝偏移(mm，手动值优先) */
  leftOffset: number;
  rightOffset: number;
  epdmEdges: EdgeLength[];
  swellEdges: EdgeLength[];
  epdmTotal: number;
  swellTotal: number;
};

export type UsageValidation = {
  /** 中心角合计（度） */
  angleSum: number;
  /** 与 360° 的偏差（度） */
  angleDelta: number;
  /** 前后面外弧/内弧闭合误差的最大值（mm），无弧长数据时为 0 */
  arcClosureError: number;
  /** 前后弧长是否参与校验 */
  arcClosureApplicable: boolean;
  /** 接缝偏移一致性问题描述 */
  seamIssues: string[];
  /** 汇总给界面展示的问题清单（空 = 通过） */
  issues: string[];
  isAngleClosed: boolean;
  isArcClosed: boolean;
  isClosed: boolean;
  isRingValid: boolean;
  isWedgeValid: boolean;
};

export const ANGLE_TOLERANCE_DEG = 0.05;
export const LENGTH_TOLERANCE_MM = 0.5;

export const DEFAULT_RING: RingParameters = {
  projectName: "WC06C 衬砌圆环",
  outerDiameter: 6200,
  innerDiameter: 5500,
  ringWidth: 1200,
  wedgeAmount: 0,
  startAngle: -33.75,
  stretchRate: 0,
};

export const DEFAULT_PRODUCTS: ProductSet = {
  epdm: { centerRadius: 3039, width: 35, height: 16.5 },
  swell: { centerRadius: 3069, width: 25, height: 4 },
};

export const DEFAULT_SEGMENTS: SegmentInput[] = [
  { rowId: "wc-b3", code: "B3", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
  { rowId: "wc-b2", code: "B2", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
  { rowId: "wc-l2", code: "L2", type: "邻接块", angle: 68.75, outerArcFront: 3803.2, innerArcFront: 3358.9, outerArcBack: 3684.9, innerArcBack: 3240.3 },
  { rowId: "wc-f", code: "F", type: "封顶块", angle: 20, outerArcFront: 915.1, innerArcFront: 841.6, outerArcBack: 1151.8, innerArcBack: 1078.9 },
  { rowId: "wc-l1", code: "L1", type: "邻接块", angle: 68.75, outerArcFront: 3803.2, innerArcFront: 3358.9, outerArcBack: 3684.9, innerArcBack: 3240.3 },
  { rowId: "wc-b1", code: "B1", type: "标准块", angle: 67.5, outerArcFront: 3652.1, innerArcFront: 3239.8, outerArcBack: 3652.1, innerArcBack: 3239.8 },
];

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const safeNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const cloneSegments = (segments: SegmentInput[] = DEFAULT_SEGMENTS): SegmentInput[] =>
  segments.map((segment) => ({ ...segment }));

/** 参考下料系数：1 + 拉伸率%，拉伸率取非负 */
export const stretchFactorOf = (stretchRate: number) => 1 + Math.max(0, safeNumber(stretchRate)) / 100;

/** 产品中心线半径处的弧边长度（按内外弧线性插值，缺数据时退回中心角） */
export function interpolatedArc(
  segment: SegmentInput,
  centerRadius: number,
  innerRadius: number,
  outerRadius: number,
  face: "front" | "back",
) {
  const innerArc = face === "front" ? safeNumber(segment.innerArcFront) : safeNumber(segment.innerArcBack);
  const outerArc = face === "front" ? safeNumber(segment.outerArcFront) : safeNumber(segment.outerArcBack);
  if (innerArc > 0 && outerArc > 0 && outerRadius > innerRadius) {
    const ratio = (centerRadius - innerRadius) / (outerRadius - innerRadius);
    return innerArc + (outerArc - innerArc) * ratio;
  }
  return centerRadius * toRadians(Math.max(0, safeNumber(segment.angle)));
}

// 楔形偏移默认以封顶块中心线对称：F 两侧偏移 = ±(F 后弧 − F 前弧) / 2（产品中心线半径处），
// 再沿环向两侧传播：左接缝偏移 = 右接缝偏移 − (后弧 − 前弧)。相邻块共享同一接缝偏移。
export function autoWedgeOffsets(
  segments: SegmentInput[],
  centerRadius: number,
  innerRadius: number,
  outerRadius: number,
) {
  const arcs = segments.map((segment) => ({
    front: interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "front"),
    back: interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "back"),
  }));
  const keyIndex = Math.max(0, segments.findIndex((segment) => (segment.type ?? "").includes("封顶")));
  const half = (arcs[keyIndex].back - arcs[keyIndex].front) / 2;
  const offsets = new Array<number>(segments.length + 1);
  offsets[keyIndex] = -half;
  offsets[keyIndex + 1] = half;
  for (let index = keyIndex - 1; index >= 0; index -= 1) {
    offsets[index] = offsets[index + 1] - (arcs[index].back - arcs[index].front);
  }
  for (let index = keyIndex + 1; index < segments.length; index += 1) {
    offsets[index + 1] = offsets[index] + (arcs[index].back - arcs[index].front);
  }
  return offsets;
}

export function resolveWedgeOffsets(segments: SegmentInput[], autoOffsets: number[]) {
  return segments.map((segment, index) => ({
    left: segment.wedgeOffsetLeft == null ? autoOffsets[index] : safeNumber(segment.wedgeOffsetLeft),
    right: segment.wedgeOffsetRight == null ? autoOffsets[index + 1] : safeNumber(segment.wedgeOffsetRight),
  }));
}

export function arcClosureStatus(segments: SegmentInput[]) {
  const frontOuter = segments.reduce((sum, segment) => sum + safeNumber(segment.outerArcFront), 0);
  const backOuter = segments.reduce((sum, segment) => sum + safeNumber(segment.outerArcBack), 0);
  const frontInner = segments.reduce((sum, segment) => sum + safeNumber(segment.innerArcFront), 0);
  const backInner = segments.reduce((sum, segment) => sum + safeNumber(segment.innerArcBack), 0);
  const applicable = frontOuter > 0 || backOuter > 0 || frontInner > 0 || backInner > 0;
  const error = Math.max(Math.abs(frontOuter - backOuter), Math.abs(frontInner - backInner));
  return { applicable, error };
}

/** 四面闭合框的中心线边长（①前环缝弧边 ②右纵缝直边 ③后环缝弧边 ④左纵缝直边） */
export function productEdges(
  segment: SegmentInput,
  resolved: { left: number; right: number },
  leftRingWidth: number,
  rightRingWidth: number,
  centerRadius: number,
  ring: RingParameters,
): EdgeLength[] {
  const outerRadius = safeNumber(ring.outerDiameter) / 2;
  const innerRadius = safeNumber(ring.innerDiameter) / 2;
  const frontArc = interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "front");
  const backArc = interpolatedArc(segment, centerRadius, innerRadius, outerRadius, "back");
  return [
    { code: "①", name: "前环缝弧边", length: frontArc },
    { code: "②", name: "右纵缝直边", length: Math.hypot(rightRingWidth, resolved.right) },
    { code: "③", name: "后环缝弧边", length: backArc },
    { code: "④", name: "左纵缝直边", length: Math.hypot(leftRingWidth, resolved.left) },
  ];
}

export function calculateSegments(
  segments: SegmentInput[],
  ring: RingParameters,
  products: ProductSet,
): CalculatedSegment[] {
  const innerRadius = safeNumber(ring.innerDiameter) / 2;
  const outerRadius = safeNumber(ring.outerDiameter) / 2;
  // 前端接缝角位（度）由前外弧沿环累加（前外弧留空/为 0 时按中心角），保证前端面无缝闭合
  const spans = segments.map((segment) => {
    const outerArc = safeNumber(segment.outerArcFront);
    if (outerArc > 0 && outerRadius > 0) return (outerArc / outerRadius) * (180 / Math.PI);
    return Math.max(0, safeNumber(segment.angle));
  });
  const frontStarts: number[] = [];
  let cursor = safeNumber(ring.startAngle);
  spans.forEach((span) => {
    frontStarts.push(cursor);
    cursor += span;
  });
  // 局部环宽 B(θ) = 环宽 − (楔形量/2)·cos(θ − θK)，θK 为封顶块前端中心角位（最小环宽处）
  const keyIndex = Math.max(0, segments.findIndex((segment) => (segment.type ?? "").includes("封顶")));
  const keyAngle = toRadians(frontStarts[keyIndex] + spans[keyIndex] / 2);
  const wedge = Math.min(Math.max(safeNumber(ring.wedgeAmount), 0), safeNumber(ring.ringWidth));
  const ringWidthAt = (angleDeg: number) => safeNumber(ring.ringWidth) - (wedge / 2) * Math.cos(toRadians(angleDeg) - keyAngle);
  const epdmAuto = autoWedgeOffsets(segments, products.epdm.centerRadius, innerRadius, outerRadius);
  const swellAuto = autoWedgeOffsets(segments, products.swell.centerRadius, innerRadius, outerRadius);
  const epdmResolved = resolveWedgeOffsets(segments, epdmAuto);
  const swellResolved = resolveWedgeOffsets(segments, swellAuto);
  const epdmRadius = products.epdm.centerRadius;
  const swellRadius = products.swell.centerRadius;
  return segments.map<CalculatedSegment>((segment, index) => {
    const angle = Math.max(0, safeNumber(segment.angle));
    const start = frontStarts[index];
    const end = start + spans[index];
    const leftOffset = epdmResolved[index].left;
    const rightOffset = epdmResolved[index].right;
    const backStart = start + (leftOffset / epdmRadius) * (180 / Math.PI);
    const backEnd = end + (rightOffset / epdmRadius) * (180 / Math.PI);
    const swellBackStart = start + (swellResolved[index].left / swellRadius) * (180 / Math.PI);
    const swellBackEnd = end + (swellResolved[index].right / swellRadius) * (180 / Math.PI);
    const leftRingWidth = ringWidthAt(start);
    const rightRingWidth = ringWidthAt(end);
    const epdmEdges = productEdges(segment, epdmResolved[index], leftRingWidth, rightRingWidth, products.epdm.centerRadius, ring);
    const swellEdges = productEdges(segment, swellResolved[index], leftRingWidth, rightRingWidth, products.swell.centerRadius, ring);
    return {
      ...segment,
      angle,
      start,
      end,
      backStart,
      backEnd,
      swellBackStart,
      swellBackEnd,
      leftRingWidth,
      rightRingWidth,
      autoLeftOffset: epdmAuto[index],
      autoRightOffset: epdmAuto[index + 1],
      leftOffset,
      rightOffset,
      epdmEdges,
      swellEdges,
      epdmTotal: epdmEdges.reduce((sum, edge) => sum + edge.length, 0),
      swellTotal: swellEdges.reduce((sum, edge) => sum + edge.length, 0),
    };
  });
}

/** 楔形量允许区间：0 ≤ 楔形量 < 环宽 */
export const isWedgeAmountValid = (ring: RingParameters) =>
  safeNumber(ring.wedgeAmount) >= 0 && safeNumber(ring.wedgeAmount) < safeNumber(ring.ringWidth);

export const isRingValid = (ring: RingParameters) =>
  safeNumber(ring.outerDiameter) > safeNumber(ring.innerDiameter) &&
  safeNumber(ring.innerDiameter) > 0 &&
  safeNumber(ring.ringWidth) > 0;

/** 成环校验：中心角闭合、前后弧长闭合、相邻接缝偏移一致、环参数与楔形量有效 */
export function validateUsage(
  calculated: CalculatedSegment[],
  segments: SegmentInput[],
  ring: RingParameters,
): UsageValidation {
  const angleSum = calculated.reduce((sum, segment) => sum + segment.angle, 0);
  const angleDelta = angleSum - 360;
  const isAngleClosed = Math.abs(angleDelta) <= ANGLE_TOLERANCE_DEG;
  const arcClosure = arcClosureStatus(segments);
  const isArcClosed = !arcClosure.applicable || arcClosure.error <= LENGTH_TOLERANCE_MM;
  // 相邻块共享同一接缝：左缝偏移(块 k) 应与右缝偏移(块 k−1) 一致，含首尾接缝
  const seamIssues: string[] = [];
  calculated.forEach((segment, index) => {
    if (calculated.length < 2) return;
    const neighbor = calculated[(index - 1 + calculated.length) % calculated.length];
    const delta = Math.abs(segment.leftOffset - neighbor.rightOffset);
    if (delta > LENGTH_TOLERANCE_MM) seamIssues.push(`接缝 ${neighbor.code}/${segment.code} 偏移不一致 ${delta.toFixed(1)} mm`);
  });
  const issues: string[] = [];
  if (!isAngleClosed) issues.push(`角度偏差 ${angleDelta.toFixed(2)}°`);
  if (!isArcClosed) issues.push(`前后弧长不闭合 ${arcClosure.error.toFixed(1)} mm`);
  issues.push(...seamIssues);
  if (!isWedgeAmountValid(ring)) issues.push(`楔形量需在 0 ~ ${safeNumber(ring.ringWidth)} mm 之间`);
  if (!isRingValid(ring)) issues.push("环几何参数不合法（需满足 外径 > 内径 > 0、环宽 > 0）");
  return {
    angleSum,
    angleDelta,
    arcClosureError: arcClosure.error,
    arcClosureApplicable: arcClosure.applicable,
    seamIssues,
    issues,
    isAngleClosed,
    isArcClosed,
    isClosed: isAngleClosed && isArcClosed && seamIssues.length === 0,
    isRingValid: isRingValid(ring),
    isWedgeValid: isWedgeAmountValid(ring),
  };
}

export type ProductUsageSummary = {
  /** 单环理论中心线长度(mm) */
  theoreticalLengthMm: number;
  /** 单环参考下料长度(mm) */
  cutLengthMm: number;
  /** 全项目理论长度 / 参考下料长度(mm)，未给环数时为 0 */
  projectTheoreticalMm: number;
  projectCutMm: number;
  /** 每环拉伸率(%)对应的系数 */
  stretchFactor: number;
};

export type PayloadSegment = {
  seq: number;
  /** 建模器行标识（回灌建模器时保持选中/新增/复制的行身份） */
  rowId: string;
  code: string;
  type: string;
  angle: number;
  startAngle: number;
  endAngle: number;
  frontOuterArc: number;
  frontInnerArc: number;
  backOuterArc: number;
  backInnerArc: number;
  /** 手填左/右缝偏移（null = 按封顶块中心对称自动计算） */
  wedgeOffsetLeft: number | null;
  wedgeOffsetRight: number | null;
  leftSeamOffset: number;
  rightSeamOffset: number;
  autoLeftSeamOffset: number;
  autoRightSeamOffset: number;
  leftRingWidth: number;
  rightRingWidth: number;
  edges: Record<ProductKey, EdgeLength[]>;
  /** 理论中心线长度(mm) */
  totalMm: Record<ProductKey, number>;
  /** 参考下料长度(mm) */
  cutMm: Record<ProductKey, number>;
};

export type SegmentUsagePayload = {
  schemaVersion: string;
  generatedAt: string;
  projectName: string;
  units: { length: "mm"; angle: "deg"; ratio: "percent" };
  ring: RingParameters & { keyAngleDeg: number; stretchFactor: number };
  products: Record<ProductKey, ProductParameters & { label: string }>;
  ringCount: number;
  segments: PayloadSegment[];
  totals: Record<ProductKey, ProductUsageSummary>;
  /** 三产品合计（ERP 取数用）：单环 + 全项目 */
  combined: { theoreticalLengthMm: number; cutLengthMm: number; projectTheoreticalMm: number; projectCutMm: number };
  validation: UsageValidation;
};

export type BuildPayloadOptions = {
  /** 项目环数（ERP 侧带入；本站缺省 0 表示不折算全项目） */
  ringCount?: number;
  generatedAt?: string;
};

/** 把当前建模器状态序列化为跨系统算量契约（ERP 导入用） */
export function buildUsagePayload(
  ring: RingParameters,
  products: ProductSet,
  segments: SegmentInput[],
  options: BuildPayloadOptions = {},
): SegmentUsagePayload {
  const calculated = calculateSegments(segments, ring, products);
  const validation = validateUsage(calculated, segments, ring);
  const stretchFactor = stretchFactorOf(ring.stretchRate);
  const ringCount = Math.max(0, Math.round(safeNumber(options.ringCount)));
  const keyIndex = Math.max(0, segments.findIndex((segment) => (segment.type ?? "").includes("封顶")));
  const keyAngleDeg = calculated.length
    ? (calculated[keyIndex]?.start ?? 0) + ((calculated[keyIndex]?.end ?? 0) - (calculated[keyIndex]?.start ?? 0)) / 2
    : 0;

  const totalOf = (segment: CalculatedSegment, key: ProductKey) => (key === "epdm" ? segment.epdmTotal : segment.swellTotal);
  const summaryOf = (key: ProductKey): ProductUsageSummary => {
    const theoreticalLengthMm = calculated.reduce((sum, segment) => sum + totalOf(segment, key), 0);
    const cutLengthMm = theoreticalLengthMm / stretchFactor;
    return {
      theoreticalLengthMm,
      cutLengthMm,
      projectTheoreticalMm: theoreticalLengthMm * ringCount,
      projectCutMm: cutLengthMm * ringCount,
      stretchFactor,
    };
  };

  const payloadSegments: PayloadSegment[] = calculated.map((segment, index) => ({
    seq: index + 1,
    rowId: segment.rowId,
    code: segment.code,
    type: segment.type,
    angle: segment.angle,
    startAngle: segment.start,
    endAngle: segment.end,
    frontOuterArc: safeNumber(segment.outerArcFront),
    frontInnerArc: safeNumber(segment.innerArcFront),
    backOuterArc: safeNumber(segment.outerArcBack),
    backInnerArc: safeNumber(segment.innerArcBack),
    wedgeOffsetLeft: segment.wedgeOffsetLeft ?? null,
    wedgeOffsetRight: segment.wedgeOffsetRight ?? null,
    leftSeamOffset: segment.leftOffset,
    rightSeamOffset: segment.rightOffset,
    autoLeftSeamOffset: segment.autoLeftOffset,
    autoRightSeamOffset: segment.autoRightOffset,
    leftRingWidth: segment.leftRingWidth,
    rightRingWidth: segment.rightRingWidth,
    edges: { epdm: segment.epdmEdges, swell: segment.swellEdges },
    totalMm: { epdm: segment.epdmTotal, swell: segment.swellTotal },
    cutMm: { epdm: segment.epdmTotal / stretchFactor, swell: segment.swellTotal / stretchFactor },
  }));

  const totals = { epdm: summaryOf("epdm"), swell: summaryOf("swell") };
  const combinedTheoretical = totals.epdm.theoreticalLengthMm + totals.swell.theoreticalLengthMm;
  const combinedCut = totals.epdm.cutLengthMm + totals.swell.cutLengthMm;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    projectName: ring.projectName,
    units: { length: "mm", angle: "deg", ratio: "percent" },
    ring: { ...ring, keyAngleDeg, stretchFactor },
    products: {
      epdm: { ...products.epdm, label: PRODUCT_LABELS.epdm },
      swell: { ...products.swell, label: PRODUCT_LABELS.swell },
    },
    ringCount,
    segments: payloadSegments,
    totals,
    combined: {
      theoreticalLengthMm: combinedTheoretical,
      cutLengthMm: combinedCut,
      projectTheoreticalMm: combinedTheoretical * ringCount,
      projectCutMm: combinedCut * ringCount,
    },
    validation,
  };
}

export type ModelerState = {
  ring: RingParameters;
  products: ProductSet;
  segments: SegmentInput[];
};

/** 把算量契约回灌为建模器状态（载入已保存方案时使用，与 buildUsagePayload 互逆） */
export function modelerStateFromPayload(payload: SegmentUsagePayload): ModelerState {
  const ring: RingParameters = {
    projectName: payload.ring?.projectName ?? payload.projectName ?? "",
    outerDiameter: safeNumber(payload.ring?.outerDiameter),
    innerDiameter: safeNumber(payload.ring?.innerDiameter),
    ringWidth: safeNumber(payload.ring?.ringWidth),
    wedgeAmount: safeNumber(payload.ring?.wedgeAmount),
    startAngle: safeNumber(payload.ring?.startAngle),
    stretchRate: safeNumber(payload.ring?.stretchRate),
  };
  const product = (key: ProductKey): ProductParameters => ({
    centerRadius: safeNumber(payload.products?.[key]?.centerRadius) || DEFAULT_PRODUCTS[key].centerRadius,
    width: safeNumber(payload.products?.[key]?.width) || DEFAULT_PRODUCTS[key].width,
    height: safeNumber(payload.products?.[key]?.height) || DEFAULT_PRODUCTS[key].height,
  });
  const segments: SegmentInput[] = (payload.segments ?? []).map((segment, index) => ({
    rowId: segment.rowId || `restored-${index + 1}`,
    code: segment.code,
    type: segment.type,
    angle: safeNumber(segment.angle),
    outerArcFront: safeNumber(segment.frontOuterArc),
    innerArcFront: safeNumber(segment.frontInnerArc),
    outerArcBack: safeNumber(segment.backOuterArc),
    innerArcBack: safeNumber(segment.backInnerArc),
    wedgeOffsetLeft: segment.wedgeOffsetLeft ?? null,
    wedgeOffsetRight: segment.wedgeOffsetRight ?? null,
  }));
  return {
    ring,
    products: { epdm: product("epdm"), swell: product("swell") },
    segments,
  };
}
