"use strict";exports.createLogClient=(url,user,token)=>{const LOKI_AUTH="Basic "+Buffer.from(`${user}:${token}`).toString("base64");return function(payload){return fetch(`${url}/loki/api/v1/push`,{method:"POST",headers:{"Content-Type":"application/json","Content-Encoding":"gzip",Authorization:LOKI_AUTH},body:payload,duplex:"half"})}};
//# sourceMappingURL=lokiClient.cjs.map
