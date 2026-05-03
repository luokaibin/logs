import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeLogs as decodeSls } from '@logbeacon/ingest/sls';
import { decodeLogs as decodeLoki } from '@logbeacon/ingest/loki';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 与客户端 beacon 变体一致：`sls`（默认）或 `loki` */
const backend = process.env.BEACON_BACKEND === 'loki' ? 'loki' : 'sls';
/** 解码结果追加写入的路径（每请求一行 JSON.stringify，无缩进） */
const outputFile =
  process.env.DECODE_OUTPUT_FILE ?? path.join(__dirname, 'decoded-output.ndjson');
const port = Number(process.env.PORT ?? 3101);

function decodeBody(payload) {
  return backend === 'loki' ? decodeLoki(payload) : decodeSls(payload);
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '';
  if (req.method !== 'POST' || !url.startsWith('/api/beacon')) {
    res.writeHead(404).end();
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const decoded = decodeBody(new Uint8Array(buf));
    const line = `${JSON.stringify(decoded)}\n`;
    fs.appendFileSync(outputFile, line, 'utf8');
    res.writeHead(204).end();
  } catch (err) {
    console.error('[beacon-decode-server]', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err instanceof Error ? err.message : String(err));
  }
});

server.listen(port, () => {
  console.log(
    `[beacon-decode-server] http://127.0.0.1:${port}/api/beacon | backend=${backend} | out=${outputFile}`,
  );
});
