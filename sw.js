/* 叶子港港窝 · Service Worker（离线可用 + 在线优先 + Web Push）
   策略：
   - 导航请求（打开 App）：网络优先，离线时回退缓存的 index.html
   - 同源静态资源（manifest / 图标）：缓存优先
   - 跨域 API（香港天文台天气/警告等）：一律放行，不缓存、不拦截
   - Web Push：接收云端推送中继的消息并弹系统通知（App 关闭也能收到） */
const CACHE = 'yezi-v1';
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

/* ---- Web Push：云端推送到达时弹系统通知（App 关闭也能收到） ---- */
self.addEventListener('push', function(e){
  var data = { title: '叶子港港窝', body: '' };
  try{
    if (e.data){
      var d = e.data.json();
      if (d && d.title) data.title = String(d.title).slice(0, 60);
      if (d && d.body) data.body = String(d.body).slice(0, 200);
    }
  }catch(err){
    try{ data.body = e.data.text(); }catch(e2){}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'yezi-push-' + Date.now(),
      vibrate: [120, 60, 120]
    })
  );
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
