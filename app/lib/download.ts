export type CsvValue = string | number | null | undefined;

const escapeCsvCell = (value: CsvValue) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function triggerDownload(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 去掉 Windows 文件名非法字符（反斜杠 / 斜杠 / 冒号 / 星号 / 问号 / 引号 / 尖括号 / 竖线），空值回落到兜底名 */
export function safeFileName(value: string, fallback = "盾构管片") {
  const illegal = new Set([92, 47, 58, 42, 63, 34, 60, 62, 124].map((code) => String.fromCharCode(code)));
  const cleaned = [...value.trim()].map((char) => (illegal.has(char) ? "-" : char)).join("");
  return cleaned || fallback;
}

export function downloadCsv(filename: string, rows: CsvValue[][]) {
  const content = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  triggerDownload(filename, content, "text/csv;charset=utf-8");
}

/** 下载 UTF-8 JSON（带 BOM 兼容 Excel/记事本；算量契约供 ERP 导入） */
export function downloadJson(filename: string, data: unknown) {
  triggerDownload(filename, `\uFEFF${JSON.stringify(data, null, 2)}\r\n`, "application/json;charset=utf-8");
}
