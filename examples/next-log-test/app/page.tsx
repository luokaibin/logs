'use client';

const dispatchLog = (level: 'info' | 'error' | 'trace' | 'warn' | 'debug', logs: unknown[]) => {
  window.dispatchEvent(
    new CustomEvent('logbeacon:log', {
      detail: { level, logs },
    })
  );
};

export default function Home() {
  const sendTestLog = () => {
    dispatchLog('info', ['Next 示例：手动测试日志', { source: 'examples/next-log-test' }]);
  };

  const sendErrorLog = () => {
    dispatchLog('error', [new Error('Next 示例：测试 error 级别')]);
  };

  /** 相同内容连续两次，用于观察 SW 内摘要去重（默认窗口内会丢弃第二条） */
  const sendDedupPair = () => {
    const content = `dedup-test-${Date.now()}`;
    dispatchLog('info', [content]);
    dispatchLog('info', [content]);
  };

  /** 短时间多条不同内容，便于观察 insert / buffer /（可选）flush */
  const sendBurst = () => {
    const t = Date.now();
    for (let i = 0; i < 6; i += 1) {
      dispatchLog('info', [`burst ${t} #${i}`]);
    }
  };

  const requestFlush = () => {
    window.dispatchEvent(new CustomEvent('logbeacon:flush'));
  };

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>Logbeacon × Next.js</h1>
      <p>
        页面已加载 <code>public/beacon/beacon.js</code>（由{' '}
        <code>pnpm run sync-beacon</code> 从 <code>packages/web/dist/sls</code>{' '}
        复制）。已配置 <code>data-beacon-url=&quot;/api/beacon&quot;</code>，flush 时应对接{' '}
        <code>204</code> 占位接口。
      </p>
      <p style={{ fontSize: '0.9rem', color: '#444' }}>
        <strong>调试输出位置：</strong>
        核心库 <code>packages/core</code> 里带 <code>[log store]</code> / <code>[log processor]</code> /{' '}
        <code>[log aggregator]</code> 的 <code>console.log</code> 运行在{' '}
        <strong>Service Worker</strong> 中。请在 Chrome → 开发者工具 → <strong>Application</strong> →{' '}
        <strong>Service Workers</strong> → 对应 SW 右侧 <strong>inspect</strong>，在弹出的 DevTools
        <strong> Console</strong> 中查看；<code>[log store web]</code> 前缀同理。普通页面标签页的
        Console 主要看到 <code>[logbeacon]</code> 与网络请求。
      </p>
      <ol>
        <li>
          在仓库根目录执行：<code>pnpm install</code>
        </li>
        <li>
          构建 beacon：<code>pnpm --filter logbeacon build</code>，再{' '}
          <code>pnpm --filter next-log-test sync-beacon</code>（或 <code>pnpm --filter next-log-test dev</code>
          自带的 predev）
        </li>
        <li>
          启动本示例：<code>pnpm --filter next-log-test dev</code>，浏览器访问{' '}
          <a href="http://localhost:3100">http://localhost:3100</a>
        </li>
      </ol>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" onClick={sendTestLog}>
          发送 info 测试日志
        </button>
        <button type="button" onClick={sendErrorLog}>
          发送 error 测试日志
        </button>
        <button type="button" onClick={sendDedupPair}>
          去重测试（同内容连发 2 条）
        </button>
        <button type="button" onClick={sendBurst}>
          连发 6 条不同内容
        </button>
        <button type="button" onClick={requestFlush}>
          logbeacon:flush
        </button>
      </div>
    </main>
  );
}
