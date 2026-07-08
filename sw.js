// Frotando Service Worker v2
// Gerencia notificações push — SEM cache (network first sempre)

const CACHE_NAME = 'frotando-v2';

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

// ── ACTIVATE: limpar TODOS os caches antigos ─────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ── FETCH: network-first SEMPRE para garantir versão atualizada ───────────────
self.addEventListener('fetch', e => {
  // Não intercepta nada — deixa o browser buscar direto da rede
  return;
});

// ── NOTIFICAÇÕES PUSH ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Frotando', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || 'frotando',
      data: data.url || '/',
      requireInteraction: true,
      actions: data.actions || []
    })
  );
});

// ── CLIQUE NA NOTIFICAÇÃO ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se o app já está aberto, focar nele
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão, abrir nova aba
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── VERIFICAÇÃO SEMANAL (via sync ou message) ─────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_SABADO') {
    const hoje = new Date();
    // getDay() 6 = sábado
    if (hoje.getDay() === 6) {
      const pendentes = e.data.pendentes || 0;
      const motoristas = e.data.motoristas || [];
      if (pendentes > 0) {
        const nomes = motoristas.slice(0, 3).join(', ');
        const extra = motoristas.length > 3 ? ` e mais ${motoristas.length - 3}` : '';
        self.registration.showNotification('💰 Frotando — Dia de cobrança!', {
          body: `${pendentes} pagamento(s) vencem hoje.\n${nomes}${extra}`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'cobranca-sabado',
          requireInteraction: true,
          data: '/',
          actions: [
            { action: 'abrir', title: '📋 Ver pagamentos' },
            { action: 'fechar', title: 'Fechar' }
          ]
        });
      }
    }
  }
});

// ── PERIODIC BACKGROUND SYNC (Chrome Android) ────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'cobranca-semanal') {
    e.waitUntil(verificarCobranca());
  }
});

async function verificarCobranca() {
  // Periodic sync não tem acesso ao localStorage
  // Envia mensagem para o cliente ativo buscar os dados
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clientList.length === 0) {
    // App fechado — notificar genericamente
    const hoje = new Date();
    if (hoje.getDay() === 6) {
      await self.registration.showNotification('💰 Frotando — Sábado de cobrança!', {
        body: 'Abra o app para verificar os pagamentos de hoje.',
        icon: '/icon-192.png',
        tag: 'cobranca-sabado',
        requireInteraction: true,
        data: '/',
      });
    }
  } else {
    // App aberto — pedir para verificar
    clientList[0].postMessage({ type: 'VERIFICAR_PENDENTES' });
  }
}
