/**
 * 管片算量内核单测（node --test，Node ≥ 22 直接运行 TS）。
 *
 * 覆盖：等宽环退化、楔形环局部环宽、成环校验、确定性契约载荷、手动接缝覆盖。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRODUCTS,
  DEFAULT_RING,
  DEFAULT_SEGMENTS,
  SCHEMA_VERSION,
  buildUsagePayload,
  calculateSegments,
  modelerStateFromPayload,
  safeNumber,
  validateUsage,
} from "../app/lib/segmentUsage.ts";
import { safeFileName } from "../app/lib/download.ts";

const approx = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected} ± ${tolerance}，实际 ${actual}`);

/** 四等分等宽环（前后弧一致，接缝偏移应为 0） */
function equalWidthRing() {
  const outerQuarter = (Math.PI * 3100) / 2;
  const innerQuarter = (Math.PI * 2750) / 2;
  return Array.from({ length: 4 }, (_, index) => ({
    rowId: `equal-${index}`,
    code: index === 0 ? "F" : `B${index}`,
    type: index === 0 ? "封顶块" : "标准块",
    angle: 90,
    outerArcFront: outerQuarter,
    innerArcFront: innerQuarter,
    outerArcBack: outerQuarter,
    innerArcBack: innerQuarter,
  }));
}

test("等宽环：纵缝直边退化为环宽，单块用量 = 两倍中心线弧长 + 两倍环宽", () => {
  const ring = { ...DEFAULT_RING, wedgeAmount: 0 };
  const calculated = calculateSegments(equalWidthRing(), ring, DEFAULT_PRODUCTS);
  assert.equal(calculated.length, 4);
  for (const segment of calculated) {
    approx(segment.leftRingWidth, ring.ringWidth);
    approx(segment.rightRingWidth, ring.ringWidth);
    approx(segment.leftOffset, 0);
    approx(segment.rightOffset, 0);
    const [frontArc, rightEdge, backArc, leftEdge] = segment.epdmEdges;
    approx(rightEdge.length, ring.ringWidth);
    approx(leftEdge.length, ring.ringWidth);
    approx(segment.epdmTotal, frontArc.length + backArc.length + 2 * ring.ringWidth);
  }
});

test("楔形环：局部环宽按 B(θ)=环宽−(楔形量/2)·cos(θ−θK) 变化，且不越界", () => {
  const ring = { ...DEFAULT_RING, wedgeAmount: 40 };
  const payload = buildUsagePayload(ring, DEFAULT_PRODUCTS, DEFAULT_SEGMENTS);
  const keyAngleDeg = payload.ring.keyAngleDeg;
  let minWidth = Number.POSITIVE_INFINITY;
  let maxWidth = 0;
  for (const segment of payload.segments) {
    const expectedLeft = ring.ringWidth - (ring.wedgeAmount / 2) * Math.cos(((segment.startAngle - keyAngleDeg) * Math.PI) / 180);
    const expectedRight = ring.ringWidth - (ring.wedgeAmount / 2) * Math.cos(((segment.endAngle - keyAngleDeg) * Math.PI) / 180);
    approx(segment.leftRingWidth, expectedLeft, 1e-9);
    approx(segment.rightRingWidth, expectedRight, 1e-9);
    minWidth = Math.min(minWidth, segment.leftRingWidth, segment.rightRingWidth);
    maxWidth = Math.max(maxWidth, segment.leftRingWidth, segment.rightRingWidth);
  }
  assert.ok(minWidth >= ring.ringWidth - ring.wedgeAmount / 2 - 1e-9);
  assert.ok(maxWidth <= ring.ringWidth + ring.wedgeAmount / 2 + 1e-9);
  assert.ok(maxWidth > minWidth, "楔形环的接缝环宽应有变化");
});

test("成环校验：标准 Demo 通过；角度 / 弧长 / 接缝异常分别报出", () => {
  const ring = { ...DEFAULT_RING, wedgeAmount: 0 };
  const demo = validateUsage(calculateSegments(DEFAULT_SEGMENTS, ring, DEFAULT_PRODUCTS), DEFAULT_SEGMENTS, ring);
  assert.deepEqual(demo.issues, []);
  assert.equal(demo.isClosed, true);
  approx(demo.angleSum, 360, 1e-9);

  const angleBroken = DEFAULT_SEGMENTS.map((segment, index) => (index === 0 ? { ...segment, angle: segment.angle + 2 } : segment));
  const angleIssues = validateUsage(calculateSegments(angleBroken, ring, DEFAULT_PRODUCTS), angleBroken, ring).issues;
  assert.ok(angleIssues.some((issue) => issue.startsWith("角度偏差")), `未报出角度偏差：${angleIssues.join(" | ")}`);

  const arcBroken = DEFAULT_SEGMENTS.map((segment, index) => (index === 2 ? { ...segment, outerArcBack: segment.outerArcBack + 20 } : segment));
  const arcIssues = validateUsage(calculateSegments(arcBroken, ring, DEFAULT_PRODUCTS), arcBroken, ring).issues;
  assert.ok(arcIssues.some((issue) => issue.startsWith("前后弧长不闭合")), `未报出弧长不闭合：${arcIssues.join(" | ")}`);

  const seamBroken = DEFAULT_SEGMENTS.map((segment, index) => (index === 1 ? { ...segment, wedgeOffsetLeft: 25 } : segment));
  const seamIssues = validateUsage(calculateSegments(seamBroken, ring, DEFAULT_PRODUCTS), seamBroken, ring).issues;
  assert.ok(seamIssues.some((issue) => issue.includes("偏移不一致")), `未报出接缝不一致：${seamIssues.join(" | ")}`);
});

test("算量契约：两产品 × 四边明细、整环合计、拉伸率下料、项目折算", () => {
  const ring = { ...DEFAULT_RING, stretchRate: 5 };
  const payload = buildUsagePayload(ring, DEFAULT_PRODUCTS, DEFAULT_SEGMENTS, { ringCount: 100, generatedAt: "2026-01-01T00:00:00.000Z" });

  assert.equal(payload.schemaVersion, SCHEMA_VERSION);
  assert.equal(payload.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(payload.ringCount, 100);
  assert.equal(payload.segments.length, DEFAULT_SEGMENTS.length);
  assert.deepEqual(payload.validation.issues, []);
  assert.ok(payload.validation.isClosed);

  const edgeNames = ["前环缝弧边", "右纵缝直边", "后环缝弧边", "左纵缝直边"];
  let epdmTheory = 0;
  let swellTheory = 0;
  for (const segment of payload.segments) {
    assert.deepEqual(segment.edges.epdm.map((edge) => edge.name), edgeNames);
    assert.deepEqual(segment.edges.swell.map((edge) => edge.name), edgeNames);
    approx(segment.totalMm.epdm, segment.edges.epdm.reduce((sum, edge) => sum + edge.length, 0), 1e-9);
    approx(segment.totalMm.swell, segment.edges.swell.reduce((sum, edge) => sum + edge.length, 0), 1e-9);
    epdmTheory += segment.totalMm.epdm;
    swellTheory += segment.totalMm.swell;
  }

  approx(payload.totals.epdm.theoreticalLengthMm, epdmTheory, 1e-9);
  approx(payload.totals.swell.theoreticalLengthMm, swellTheory, 1e-9);
  approx(payload.totals.epdm.cutLengthMm, epdmTheory / 1.05, 1e-9);
  approx(payload.combined.theoreticalLengthMm, epdmTheory + swellTheory, 1e-9);
  approx(payload.combined.projectTheoreticalMm, (epdmTheory + swellTheory) * 100, 1e-9);
  approx(payload.combined.projectCutMm, payload.combined.cutLengthMm * 100, 1e-9);
});

test("契约回灌建模器：往返后块数、块号、手填偏移与整环合计一致", () => {
  const ring = { ...DEFAULT_RING, wedgeAmount: 36, stretchRate: 2.5 };
  const segments = DEFAULT_SEGMENTS.map((segment, index) =>
    index === 2 ? { ...segment, wedgeOffsetLeft: 14, wedgeOffsetRight: -9 } : segment,
  );
  const payload = buildUsagePayload(ring, DEFAULT_PRODUCTS, segments, { ringCount: 300, generatedAt: "2026-01-01T00:00:00.000Z" });
  const restored = modelerStateFromPayload(payload);

  assert.deepEqual(restored.ring, ring);
  assert.deepEqual(restored.products, DEFAULT_PRODUCTS);
  // 契约以 null 表示「按封顶块中心自动计算」，与建模器的 undefined 等价
  assert.deepEqual(
    restored.segments,
    segments.map((segment) => ({
      ...segment,
      wedgeOffsetLeft: segment.wedgeOffsetLeft ?? null,
      wedgeOffsetRight: segment.wedgeOffsetRight ?? null,
    })),
  );

  const rebuilt = buildUsagePayload(restored.ring, restored.products, restored.segments, {
    ringCount: payload.ringCount,
    generatedAt: payload.generatedAt,
  });
  assert.deepEqual(rebuilt, payload);
});

test("手动接缝偏移：覆盖自动值并进入纵缝直边", () => {
  const ring = { ...DEFAULT_RING, wedgeAmount: 0 };
  const segments = DEFAULT_SEGMENTS.map((segment, index) =>
    index === 0 ? { ...segment, wedgeOffsetLeft: 30, wedgeOffsetRight: -12 } : segment,
  );
  const [first] = calculateSegments(segments, ring, DEFAULT_PRODUCTS);
  approx(first.leftOffset, 30);
  approx(first.rightOffset, -12);
  approx(first.epdmEdges[3].length, Math.hypot(first.leftRingWidth, 30), 1e-9);
  approx(first.epdmEdges[1].length, Math.hypot(first.rightRingWidth, -12), 1e-9);
});

test("safeNumber 与文件名清洗：非法输入回落默认值", () => {
  assert.equal(safeNumber(Number.NaN, 7), 7);
  assert.equal(safeNumber(12.5), 12.5);
  assert.equal(safeNumber("12" as unknown as number, 3), 3);
  assert.equal(safeFileName('  A/B:C*D?E"F<G>H|I\\J  '), "A-B-C-D-E-F-G-H-I-J");
  assert.equal(safeFileName("   "), "盾构管片");
});
