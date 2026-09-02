/* 叶子港港窝 · Service Worker（离线可用 + 在线优先 + Web Push）
   策略：
   - 导航请求（打开 App）：网络优先，离线时回退缓存的 index.html
   - 同源静态资源（manifest / 图标）：缓存优先
   - 跨域 API（香港天文台天气/警告等）：一律放行，不缓存、不拦截
   - Web Push：接收云端推送中继的消息并弹系统通知（App 关闭也能收到） */
const CACHE = 'yezi-v4';  // v3 → v4（2026-09-02）：回执带消息 id(msgTs) 供 Worker 精确取消补发；支持静默探活(probe)；点通知直达对话
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
   v3（2026-09-02 初）：回执时序改为「先等 showNotification 有结果再发 pong」，
   让 diag.showOk 成为最终状态，Worker 端能区分「弹窗成功/失败」。
   v4（2026-09-02 终）：回执额外带回消息 id（payload 里的 ts，即 msgTs）——
   Worker 据此精确删除对应 pending，不再靠时间容差猜（迟到 8 分钟的回执也能正确取消补发，
   从根上消除「Web Push 迟到 + ntfy 补发」双弹）。另外支持两类新消息：
   · probe（静默探活）：不弹任何通知，收到即回执，用于降级期每天探一次主通道是否复活；
   · 带 msgTs 的普通推送：通知 tag 也用它，同一消息重复投递会被系统合并成一条。 */
self.addEventListener('push', function(e){
  var diag = { t: Date.now(), stage: 'push_received', hasData: !!e.data };
  var pongUrl = 'https://yezi-push.2451087669.workers.dev/pong';
  var data = { title: '叶子港港窝', body: '' };
  var msgTs = 0;      // 消息唯一 id（Worker 下发，回执原样带回 → 精确取消补发）
  var isProbe = false; // 静默探活标记：不弹窗，只回执

  try{
    if (e.data){
      try{
        var d = e.data.json();
        if (d){
          if (d.title) data.title = String(d.title).slice(0, 60);
          if (d.body) data.body = String(d.body).slice(0, 200);
          msgTs = Number(d.ts) || 0;
          isProbe = !!d.probe;
        }
        diag.parseOk = true;
      }catch(err){
        try{ data.body = e.data.text(); diag.parseOk = false; }catch(e2){ diag.parseOk = false; }
      }
    }
  }catch(err){
    diag.parseErr = String(err && err.message || err);
  }

  var p;
  if (isProbe){
    // 静默探活：不弹通知不打扰，只证明「Web Push 通道能到手机」（Worker 用 msgTs 清掉探活 pending → 主通道复活）
    diag.probe = true;
    diag.stage = 'probe_received';
    p = fetch(pongUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({t: diag.t, msgTs: msgTs, diag: diag})
    }).then(function(){ diag.pongOk = true; })
      .catch(function(err){ diag.pongOk = false; diag.pongErr = String(err && err.message || err); });
  } else {
    p = self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'yezi-push-' + (msgTs || diag.t),
      vibrate: [120, 60, 120],
      requireInteraction: false
    }).then(function(){
      diag.showOk = true;
    }).catch(function(err){
      diag.showOk = false;
      diag.showErr = String(err && err.message || err);
    }).then(function(){
      // 回执在弹窗有结果之后才发，showOk 此时是最终状态；msgTs 原样带回供精确取消
      try{
        return fetch(pongUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({t: diag.t, msgTs: msgTs, diag: diag})
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
  }

  e.waitUntil(p.catch(function(err){
    diag.fatal = String(err && err.message || err);
    // 整条链路崩了也要把错误回写，否则 Worker 只能靠超时判失联
    try{ fetch(pongUrl, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({t: diag.t, msgTs: msgTs, diag: diag})}).catch(function(){}); }catch(e){}
  }));
});

/* 点击通知：聚焦已打开的 App 并让它打开对话页（看到刚推的话）；没开则带 ?chat=1 冷启动 */
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++){
        if ('focus' in list[i]){
          // 页面收到 openChat 会先回填云端消息（pullCloudMsgs）再打开对话页
          try{ list[i].postMessage({kind:'openChat'}); }catch(err){}
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html?chat=1');
    })
  );
});
