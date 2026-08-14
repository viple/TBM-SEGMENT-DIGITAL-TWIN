import type { Metadata } from "next";
import { UniversalShieldConfigurator } from "../UniversalShieldConfigurator";

export const metadata: Metadata = {
  title: "盾构管片通用建模器 V2",
  description: "通过参数表填写管片数据，实时生成三维模型并计算密封产品用量。",
};

export default function UniversalModelPage() {
  return <UniversalShieldConfigurator />;
}
