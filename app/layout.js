import './globals.css';

export const metadata = {
  title: '楼宇招商分析台',
  description: '写字楼商户招商适配分析、铺位匹配与经营决策工作台'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
