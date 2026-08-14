import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "盾构管片密封系统 · 三维交互模型",
  description:
    "WC06C 衬砌圆环三维交互模型、逐块拆解动画与密封产品理论长度计算。",
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
