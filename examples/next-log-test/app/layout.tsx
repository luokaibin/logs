import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Logbeacon Next 测试',
  description: '用于验证 logbeacon 在 Next.js 中是否正常工作',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 720 }}>
        <Script src="/globa.js" strategy="beforeInteractive" />
        <Script
          src="/beacon/beacon.js"
          strategy="beforeInteractive"
          data-beacon-url="/api/beacon"
        />
        {children}
      </body>
    </html>
  );
}
