import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wc06c-segment-seal-viewer.superlvpei.chatgpt.site"),
  title: "盾构管片密封系统 · 三维交互模型",
  description:
    "WC06C 衬砌圆环三维交互模型、逐块拆解动画与密封产品理论长度计算。",
  openGraph: {
    title: "盾构管片密封系统",
    description: "三维交互模型 · WC06C",
    images: [{ url: "/og.png", width: 1536, height: 864, alt: "盾构管片密封系统三维交互模型" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "盾构管片密封系统",
    description: "三维交互模型 · WC06C",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
