# TBM Segment Digital Twin

盾构管片与密封产品三维数字孪生工具。项目包含固定的 WC06C Demo，以及通过表格填写管片参数、实时生成模型和计算产品长度的通用 V2。

## 在线版本

- Demo：<https://wc06c-segment-seal-viewer.superlvpei.chatgpt.site/>
- 通用 V2：<https://wc06c-segment-seal-viewer.superlvpei.chatgpt.site/v2>

## 主要功能

### Demo

- 一环六块管片三维拼装与逐块拆解
- 双击单块观察、半透明与全透明模式
- 黑色 EPDM 弹性密封垫和红色遇水膨胀橡胶片闭合框
- 每块四边长度、单块用量和整环用量
- 根据安装拉伸率计算参考下料长度
- 导出逐块、逐边及整环产品用量 CSV 明细表

### 通用 V2

- 设置管片外径、内径、环宽和模型起始角
- 设置两种产品的中心线半径及截面尺寸
- 表格填写块号、类型、中心角及前后内外弧长
- 新增、复制和删除管片
- 实时生成三维模型并检查中心角是否闭合为 360°
- 实时计算每条边、每块管片和整环产品用量
- 导出完整输入参数和产品用量 CSV

## 计算口径

闭合框由前环缝弧边、右纵缝直边、后环缝弧边和左纵缝直边组成。

- 弧边长度：根据模板图给出的内外弧长，按产品中心线半径线性插值
- 纵缝直边：按管片环宽计算
- 单块用量：四条中心线理论长度之和
- 参考下料长度：`理论中心线长度 ÷ (1 + 安装拉伸率)`

## 本地运行

要求 Node.js `>= 22.13.0`。

```bash
npm install
npm run dev
```

本地地址默认为 <http://localhost:3001/>，通用版路径为 <http://localhost:3001/v2>。

## 检查与构建

```bash
npm run lint
npm run build
```

## 技术栈

- React 19
- TypeScript
- Three.js
- vinext / Vite
- Cloudflare Workers-compatible Sites build

## 当前范围

当前版本暂不显示镂孔圈、钉筋粒子等细部构造。密封产品长度按理论中心线计算，模压圆角及现场安装修正可在后续版本继续细化。
