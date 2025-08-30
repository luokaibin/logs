
import {genHandleMessage} from '../browser/beacon-sw.js'
import lokiEncoder from './logEncoder.js'

const handleMessage = genHandleMessage(lokiEncoder)

self.addEventListener('message', handleMessage);

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});