/* 叶子港港窝 · Service Worker（离线可用 + 在线优先 + Web Push）
   策略：
   - 导航请求（打开 App）：网络优先，离线时回退缓存的 index.html
   - 同源静态资源（manifest / 图标）：缓存优先
   - 跨域 API（香港天文台天气/警告等）：一律放行，不缓存、不拦截
   - Web Push：接收云端推送中继的消息并弹系统通知（App 关闭也能收到） */
const CACHE = 'yezi-v3';  // v2 → v3：push 回执改为「弹窗完成后再发」，配合 Worker 的 ntfy 补发判定
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(SHELL);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch(err) { return; }
  if (url.origin !== self.location.origin) return; // 跨域（天气 API 等）放行

  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('./index.html');
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

/* ---- Web Push：云端推送到达时弹系统通知（App 关闭也能收到） ----
   2026-09-02 重写回执时序：
   旧版把 pong 与 showNotification 并行发起，pong 的 body 在 showNotification 有结果
   之前就被序列化，diag.showOk 永远是 undefined —— Worker 端因此无法区分「弹窗成功」
   和「弹窗失败」。而新的 ntfy 补发机制完全依赖这个回执判断要不要补发
   （Worker 只在 showOK === true 时取消补发），所以必须先等弹窗结果再发回执。 */
self.addEventListener('push', function(e){
  var diag = { t: Date.now(), stage: 'push_received', hasData: !!e.data };
  var pongUrl = 'https://yezi-push.2451087669.workers.dev/pong';
  var data = { title: '叶子港港窝', body: '' };

  try{
    if (e.data){
      try{
        var d = e.data.json();
        if (d && d.title) data.title = String(d.title).slice(0, 60);
        if (d && d.body) data.body = String(d.body).slice(0, 200);
        diag.parseOk = true;
      }catch(err){
        try{ data.body = e.data.text(); diag.parseOk = false; }catch(e2){ diag.parseOk = false; }
      }
    }
  }catch(err){
    diag.parseErr = String(err && err.message || err);
  }

  var p = self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'yezi-push-' + diag.t,
    vibrate: [120, 60, 120],
    requireInteraction: false
  }).then(function(){
    diag.showOk = true;
  }).catch(function(err){
    diag.showOk = false;
    diag.showErr = String(err && err.message || err);
  }).then(function(){
    // 回执在弹窗有结果之后才发，showOk 此时是最终状态
    try{
      return fetch(pongUrl, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({t: diag.t, diag: diag})
      }).then(function(){ diag.pongOk = true; })
        .catch(function(err){ diag.pongOk = false; diag.pongErr = String(err && err.message || err); });
    }catch(e){}
  }).then(function(){
    // 通知所有客户端主线程（让设置面板可以立刻看到「刚刚弹了/被拦截了」）
    try{
      return self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
        var msg = {kind:'pushShowResult', ok: !!diag.showOk, err: diag.showErr || '', title: data.title, t: diag.t};
        for(var i=0; i<list.length; i++){
          try{ list[i].postMessage(msg); }catch(e){}
        }
      });
    }catch(e){}
  });

  e.waitUntil(p.catch(function(err){
    diag.fatal = String(err && err.message || err);
    // 整条链路崩了也要把错误回写，否则 Worker 只能靠 90 秒超时兜底
    try{ fetch(pongUrl, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({t: diag.t, diag: diag})}).catch(function(){}); }catch(e){}
  }));
});

/* 点击通知：聚焦已打开的 App，没开则打开 */
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++){
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
