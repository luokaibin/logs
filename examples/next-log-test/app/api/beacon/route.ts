import { NextResponse } from 'next/server';

/** Demo 接收 beacon POST，避免 dev 下 flush 一直 404；生产请替换为真实采集端。 */
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
