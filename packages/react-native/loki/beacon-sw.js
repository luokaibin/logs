import { genHandleMessage } from '../browser/beacon-sw-loki.js';

const handleMessage = genHandleMessage();

self.addEventListener('message', handleMessage);

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
