import "./globals.css";

export const metadata = {
  title: "ShiftFlow — 酒吧智慧排班系統",
  description: "為酒吧打造的 AI 排班管理工具",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.3.0/dist/tabler-icons.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
