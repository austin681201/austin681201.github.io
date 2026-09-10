const TOKEN_KEY = 'myshop.hq.token';

const GRANT_MODULES = [
  ['notify_promo', '促銷推播'],
  ['message', '進度通知'],
  ['customer_avatar', '客戶大頭照'],
  ['custom_join_code', '自訂店碼'],
  ['ledger_stats', '帳簿統計'],
  ['beacon', '到店訊息'],
  ['notify_new', '新品通知'],
  ['day_pin', '今日營業位置'],
  ['wallet', '儲值錢包'],
  ['service_log', '服務紀錄'],
  ['repurchase_remind', '回購提醒'],
  ['points_recover', '點數回收'],
  ['locate', '即時位置'],
  ['nav', '地圖導航'],
  ['mileage', '里程計算'],
  ['rental_mgmt', '租賃管理'],
  ['laundry', '個人洗衣'],
  ['menu_photo', '價目附圖'],
];

function $(id) {
  return document.getElementById(id);
}

function show(el, on) {
  el.classList.toggle('hidden', !on);
}

function errBox(id, msg) {
  const el = $(id);
  if (!msg) {
    show(el, false);
    el.textContent = '';
    return;
  }
  const map = {
    denied: '密碼不對',
    locked: '嘗試太多次，請稍後再試',
    not_configured: '雲端尚未跑總部 SQL',
    auth: '登入已過期，請再登入',
    config: '讀不到雲端設定，請用 npm run hq 開啟',
    other_shop: '同一模組已在別間店開通',
    not_found: '找不到這筆',
    bad_days: '天數只能是 7／30／90',
    banned: '此帳戶已停權',
    bad_amount: '點數請填 1～5000',
  };
  let text = map[msg] || msg;
  if (/hq_grant_points|mb_balance|schema cache/i.test(String(msg))) {
    text = '雲端還沒有正式錢包函式。請在 Supabase SQL Editor 跑 patch-hq-mb-wallet.sql';
  }
  el.textContent = text;
  el.scrollIntoView({ block: 'nearest' });
  show(el, true);
}

function askConfirm(message) {
  return new Promise((resolve) => {
    const box = $('confirmBox');
    $('confirmMsg').textContent = message;
    show(box, true);
    const ok = $('confirmOk');
    const no = $('confirmNo');
    const done = (v) => {
      show(box, false);
      ok.removeEventListener('click', onOk);
      no.removeEventListener('click', onNo);
      box.removeEventListener('click', onBox);
      resolve(v);
    };
    const onOk = () => done(true);
    const onNo = () => done(false);
    const onBox = (ev) => {
      if (ev.target === box) done(false);
    };
    ok.addEventListener('click', onOk);
    no.addEventListener('click', onNo);
    box.addEventListener('click', onBox);
  });
}

async function notifyMbGrant(expoToken, amount) {
  const to = String(expoToken || '').trim();
  if (!to || !Number.isFinite(amount) || amount < 1) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to,
        title: 'MyShop',
        body: `總部贈送 ${amount} M幣，請打開 App 入帳`,
        sound: 'default',
        channelId: 'default',
        data: { kind: 'mb_grant' },
      }),
    });
  } catch {
    /* 推播失敗不擋贈點 */
  }
}

function client() {
  const cfg = window.HQ_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) return null;
  return window.supabase.createClient(cfg.url, cfg.anonKey);
}

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('zh-TW');
  } catch {
    return iso;
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function modLabel(id) {
  return GRANT_MODULES.find((m) => m[0] === id)?.[1] || id;
}

function table(headers, rows, cells, rowAttr) {
  if (!rows?.length) return '<p class="hint">沒有資料</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((r) => {
      const attr = rowAttr ? rowAttr(r) : '';
      return `<tr ${attr}>${cells(r).map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function rpc(name, args) {
  const sb = client();
  if (!sb) throw new Error('config');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const PAGES = ['accounts', 'owners', 'shops'];
let currentPage = 'accounts';

function pageEl(page) {
  return $(`page${page.charAt(0).toUpperCase()}${page.slice(1)}`);
}

function showPage(page) {
  if (!PAGES.includes(page)) page = 'accounts';
  currentPage = page;
  for (const p of PAGES) show(pageEl(p), p === page);
  document.querySelectorAll('#tabs .tab').forEach((btn) => {
    btn.classList.toggle('on', btn.getAttribute('data-page') === page);
  });
}

function pickSearchPage(data) {
  const q = String(data.q || '').trim();
  if (!q) return currentPage;
  const accounts = data.account_rows?.length ? data.account_rows : data.user_rows;
  if (accounts?.length) return 'accounts';
  if (data.shop_rows?.length) return 'shops';
  if (data.owner_rows?.length) return 'owners';
  return currentPage;
}

function showHome() {
  show($('homeView'), true);
  show($('accountView'), false);
  show($('shopView'), false);
  showPage(currentPage);
}

function renderOverview(data) {
  const stats = [
    ['帳號', data.users],
    ['店主', data.owners],
    ['店舖', data.shops],
    ['訂單', data.orders],
    ['今天訂單', data.orders_today],
    ['停權', data.banned],
  ].filter(([, v]) => v != null);

  if (stats.length) {
    $('stats').innerHTML = stats
      .map(([k, v]) => `<div class="stat"><b>${v ?? '—'}</b><span>${k}</span></div>`)
      .join('');
  }

  if (data.wallet_note) {
    $('walletNote').textContent = data.wallet_note;
    show($('walletNote'), true);
  } else {
    show($('walletNote'), false);
  }

  $('owners').innerHTML = table(
    ['店主', '信箱', '客人碼', '店數', '店名', '狀態'],
    data.owner_rows,
    (o) => [
      esc(o.display_name),
      esc(o.email),
      esc(o.guest_code),
      o.shop_count,
      esc(o.shop_names),
      o.banned ? '<span class="tag warn">停權</span>' : '正常',
    ],
    (o) => `class="clickable" data-open="account" data-id="${esc(o.id)}"`,
  );

  $('shops').innerHTML = table(
    ['店名', '店碼', '分類', '訂閱', '狀態', '模組', '客', '店主'],
    data.shop_rows,
    (s) => [
      esc(s.name),
      esc(s.join_code),
      esc(s.life),
      `${esc(s.subscription_state)}`,
      s.status === 'paused' ? '<span class="tag warn">暫停接單</span>' : '營業',
      `<span class="mods">${esc(s.modules)}</span>`,
      s.customer_count ?? '—',
      esc(s.owner),
    ],
    (s) => `class="clickable" data-open="shop" data-id="${esc(s.id)}"`,
  );

  const accounts = data.account_rows?.length ? data.account_rows : data.user_rows;
  $('users').innerHTML = table(
    ['名稱', '客人碼', '信箱', '身分', '狀態'],
    accounts,
    (u) => [
      esc(u.display_name),
      esc(u.guest_code),
      esc(u.email),
      u.is_owner ? '店主' : '客人',
      u.banned ? '<span class="tag warn">停權</span>' : '正常',
    ],
    (u) => `class="clickable" data-open="account" data-id="${esc(u.id)}"`,
  );

  showPage(pickSearchPage(data));
  showHome();
}

function eventsTable(rows) {
  return table(
    ['時間', '店', '模組', '動作', '來源', '說明'],
    rows,
    (e) => [
      fmtTime(e.created_at),
      esc(e.shop_name || ''),
      esc(modLabel(e.module_id)),
      esc(e.action),
      esc(e.source),
      esc(e.detail || (e.days ? `${e.days} 天` : '')),
    ],
  );
}

async function openAccount(id) {
  errBox('deskErr', '');
  try {
    const data = await rpc('hq_account', { p_token: token(), p_user_id: id });
    if (!data?.ok) {
      errBox('deskErr', data?.error || '讀取失敗');
      return;
    }
    const u = data.user;
    const owned = table(
      ['店名', '店碼', '分類', '訂閱', '狀態', '模組'],
      data.owned_shops,
      (s) => [
        esc(s.name),
        esc(s.join_code),
        esc(s.life),
        esc(s.subscription_state),
        s.status === 'paused' ? '<span class="tag warn">暫停</span>' : '營業',
        `<span class="mods">${esc(s.modules)}</span>`,
      ],
      (s) => `class="clickable" data-open="shop" data-id="${esc(s.id)}"`,
    );
    const joined = table(
      ['店名', '店碼', '入店'],
      data.joined_shops,
      (s) => [esc(s.name), esc(s.join_code), fmtTime(s.joined_at)],
      (s) => `class="clickable" data-open="shop" data-id="${esc(s.id)}"`,
    );
    $('accountCard').innerHTML = `
      <p class="mono">// 帳戶卡</p>
      <div class="kv">
        <b>名稱</b><span>${esc(u.display_name)}</span>
        <b>信箱</b><span>${esc(u.email)}</span>
        <b>客人碼</b><span>${esc(u.guest_code)}</span>
        <b>註冊</b><span>${fmtTime(u.created_at)}</span>
        <b>狀態</b><span>${u.banned ? '<span class="tag warn">停權</span>' : '正常'}</span>
        <b>M幣</b><span>餘額 ${esc(u.mb_balance ?? 0)} · 待領 ${esc(u.mb_pending ?? 0)} · 累計已贈 ${esc(u.mb_granted_total ?? 0)}</span>
      </div>
      <p class="mono" style="margin-top:18px">// 贈點（App 開著會跳窗；背景會推播）</p>
      <div class="actions">
        <input id="grantPts" type="number" min="1" max="5000" value="100" />
        <button type="button" data-act="grant-points" data-id="${esc(u.id)}">贈 M幣</button>
      </div>
      <p id="grantPtsMsg" class="hint"></p>
      <p class="mono" style="margin-top:18px">// 店主面</p>
      ${owned}
      <p class="mono">// 客人面（加入哪些店）</p>
      ${joined}
      <p class="mono">// 最近開通</p>
      ${eventsTable(data.events)}
      <p class="mono">// 總部備註</p>
      <textarea id="userNote">${esc(u.note || '')}</textarea>
      <div class="actions">
        <button type="button" data-act="save-user-note" data-id="${esc(u.id)}">儲存備註</button>
        <button type="button" class="ghost" data-act="reissue" data-id="${esc(u.id)}">換發客人碼</button>
        <button type="button" class="ghost" data-act="reset-secret" data-id="${esc(u.id)}">重設秘密碼</button>
        <button type="button" class="${u.banned ? 'ghost' : 'danger'}" data-act="ban" data-id="${esc(u.id)}" data-on="${u.banned ? '0' : '1'}">${u.banned ? '解除停權' : '停權整戶'}</button>
      </div>
    `;
    show($('homeView'), false);
    show($('shopView'), false);
    show($('accountView'), true);
  } catch (e) {
    errBox('deskErr', e.message || '讀取失敗');
  }
}

function grantSelect() {
  const opts = GRANT_MODULES.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  return `<select id="grantMod">${opts}</select>
    <select id="grantDays">
      <option value="7">7 天</option>
      <option value="30">30 天</option>
      <option value="90">90 天</option>
    </select>
    <button type="button" data-act="grant">贈模組</button>`;
}

async function openShop(id) {
  errBox('deskErr', '');
  try {
    const data = await rpc('hq_shop', { p_token: token(), p_shop_id: id });
    if (!data?.ok) {
      errBox('deskErr', data?.error || '讀取失敗');
      return;
    }
    const s = data.shop;
    const grants = table(
      ['模組', '來源', '扣點', '開通', '到期', ''],
      data.grants,
      (g) => [
        esc(modLabel(g.module_id)),
        esc(g.source),
        g.paid ? '是' : '否',
        fmtTime(g.granted_at),
        fmtDate(g.expires_at),
        `<button type="button" class="ghost" data-act="revoke" data-shop="${esc(s.id)}" data-mod="${esc(g.module_id)}">收回</button>`,
      ],
    );
    $('shopCard').innerHTML = `
      <p class="mono">// 店卡</p>
      <div class="kv">
        <b>店名</b><span>${esc(s.name)}</span>
        <b>店碼</b><span>${esc(s.join_code)}</span>
        <b>分類</b><span>${esc(s.life)}</span>
        <b>訂閱</b><span>${esc(s.subscription_state)}（IAP，總部不改）</span>
        <b>試用到期</b><span>${fmtDate(s.trial_ends_at || s.subscription_ends_at)}</span>
        <b>接單</b><span>${s.status === 'paused' ? '<span class="tag warn">暫停接單</span>' : '營業'}</span>
        <b>店主</b><span><a href="#" data-open="account" data-id="${esc(s.owner_id)}">${esc(s.owner)}</a> ${esc(s.owner_email || '')}</span>
        <b>入店客</b><span>${s.customer_count ?? 0}（點進帳戶才看人）</span>
      </div>
      <p class="mono" style="margin-top:18px">// 已開模組</p>
      ${grants}
      <p class="mono">// 贈模組（不扣點）</p>
      <div class="actions" data-shop="${esc(s.id)}">
        ${grantSelect()}
      </div>
      <p class="mono">// 最近開通</p>
      ${eventsTable(data.events)}
      <p class="mono">// 總部備註</p>
      <textarea id="shopNote">${esc(s.note || '')}</textarea>
      <div class="actions">
        <button type="button" data-act="save-shop-note" data-id="${esc(s.id)}">儲存備註</button>
        <button type="button" class="${s.status === 'paused' ? 'ghost' : 'danger'}" data-act="pause" data-id="${esc(s.id)}" data-on="${s.status === 'paused' ? '0' : '1'}">${s.status === 'paused' ? '恢復接單' : '暫停接單'}</button>
      </div>
    `;
    show($('homeView'), false);
    show($('accountView'), false);
    show($('shopView'), true);
  } catch (e) {
    errBox('deskErr', e.message || '讀取失敗');
  }
}

function flashSecret(code) {
  const el = $('secretOnce');
  el.innerHTML = `新秘密碼／碼（只出現一次，請立刻用電話／私訊告訴對方）：<br /><code>${esc(code)}</code>`;
  show(el, true);
}

async function bootDesk() {
  show($('gate'), false);
  show($('desk'), true);
  errBox('deskErr', '');
  try {
    const data = await rpc('hq_overview', { p_token: token() });
    if (!data?.ok) {
      if (data?.error === 'auth') {
        setToken('');
        show($('desk'), false);
        show($('gate'), true);
        errBox('gateErr', 'auth');
        return;
      }
      errBox('deskErr', data?.error || '讀取失敗');
      return;
    }
    renderOverview(data);
  } catch (e) {
    errBox('deskErr', e.message || '讀取失敗');
  }
}

async function doLogin() {
  errBox('gateErr', '');
  const pass = $('pass').value;
  if (!pass.trim()) {
    errBox('gateErr', '請輸入密碼');
    return;
  }
  $('loginBtn').disabled = true;
  try {
    const data = await rpc('hq_login', { p_password: pass.trim() });
    if (!data?.ok) {
      errBox('gateErr', data?.error || 'denied');
      return;
    }
    setToken(data.token);
    $('pass').value = '';
    await bootDesk();
  } catch (e) {
    errBox('gateErr', e.message || '連線失敗');
  } finally {
    $('loginBtn').disabled = false;
  }
}

async function doSearch() {
  errBox('deskErr', '');
  try {
    const data = await rpc('hq_search', { p_token: token(), p_q: $('q').value.trim() });
    if (!data?.ok) {
      errBox('deskErr', data?.error || '查詢失敗');
      return;
    }
    renderOverview(data);
  } catch (e) {
    errBox('deskErr', e.message || '查詢失敗');
  }
}

$('loginBtn').addEventListener('click', () => void doLogin());
$('pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void doLogin();
});
$('searchBtn').addEventListener('click', () => void doSearch());
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void doSearch();
});
$('tabs').addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-page]') : null;
  if (!btn) return;
  showPage(btn.getAttribute('data-page'));
});
$('reloadBtn').addEventListener('click', () => void bootDesk());
$('outBtn').addEventListener('click', () => {
  setToken('');
  show($('desk'), false);
  show($('gate'), true);
  $('pass').focus();
});
$('backHome1').addEventListener('click', () => showHome());
$('backHome2').addEventListener('click', () => showHome());

document.addEventListener('click', (e) => {
  const t = e.target instanceof Element ? e.target.closest('[data-open],[data-act]') : null;
  if (!t) return;
  const open = t.getAttribute('data-open');
  const id = t.getAttribute('data-id');
  if (open === 'account' && id) {
    e.preventDefault();
    void openAccount(id);
    return;
  }
  if (open === 'shop' && id) {
    e.preventDefault();
    void openShop(id);
    return;
  }
  const act = t.getAttribute('data-act');
  if (!act) return;
  e.preventDefault();
  void (async () => {
    errBox('deskErr', '');
    try {
      if (act === 'save-user-note') {
        const note = $('userNote')?.value ?? '';
        const data = await rpc('hq_set_note', {
          p_token: token(),
          p_type: 'user',
          p_id: t.getAttribute('data-id'),
          p_note: note,
        });
        if (!data?.ok) throw new Error(data?.error || '儲存失敗');
        await openAccount(t.getAttribute('data-id'));
      } else if (act === 'save-shop-note') {
        const note = $('shopNote')?.value ?? '';
        const data = await rpc('hq_set_note', {
          p_token: token(),
          p_type: 'shop',
          p_id: t.getAttribute('data-id'),
          p_note: note,
        });
        if (!data?.ok) throw new Error(data?.error || '儲存失敗');
        await openShop(t.getAttribute('data-id'));
      } else if (act === 'ban') {
        const on = t.getAttribute('data-on') === '1';
        const uid = t.getAttribute('data-id');
        const data = await rpc('hq_set_banned', { p_token: token(), p_user_id: uid, p_banned: on });
        if (!data?.ok) throw new Error(data?.error || '失敗');
        await openAccount(uid);
      } else if (act === 'reissue') {
        const uid = t.getAttribute('data-id');
        const data = await rpc('hq_reissue_guest_code', { p_token: token(), p_user_id: uid });
        if (!data?.ok) throw new Error(data?.error || '失敗');
        flashSecret(`新客人碼 ${data.guest_code}（舊碼已失效）`);
        await openAccount(uid);
      } else if (act === 'reset-secret') {
        const go = await askConfirm('將產生新秘密碼，舊碼立刻失效，對方現在的登入會被踢掉。確定？');
        if (!go) return;
        const uid = t.getAttribute('data-id');
        const data = await rpc('hq_reset_secret', { p_token: token(), p_user_id: uid });
        if (!data?.ok) throw new Error(data?.error || '失敗');
        flashSecret(data.secret);
        await openAccount(uid);
      } else if (act === 'pause') {
        const on = t.getAttribute('data-on') === '1';
        const sid = t.getAttribute('data-id');
        const data = await rpc('hq_set_shop_status', {
          p_token: token(),
          p_shop_id: sid,
          p_status: on ? 'paused' : 'active',
        });
        if (!data?.ok) throw new Error(data?.error || '失敗');
        await openShop(sid);
      } else if (act === 'grant-points') {
        const uid = t.getAttribute('data-id');
        const n = Math.floor(Number($('grantPts')?.value || 0));
        const grantMsg = $('grantPtsMsg');
        if (grantMsg) grantMsg.textContent = '';
        if (!Number.isFinite(n) || n < 1 || n > 5000) {
          throw new Error('bad_amount');
        }
        const go = await askConfirm(`贈 ${n} M幣給此帳戶？會立刻加進雲端餘額；對方 App 開著會跳出入帳訊息，在背景則推播。`);
        if (!go) return;
        t.setAttribute('disabled', 'disabled');
        t.textContent = '處理中…';
        try {
          const data = await rpc('hq_grant_points', {
            p_token: token(),
            p_user_id: uid,
            p_amount: n,
          });
          if (!data?.ok) throw new Error(data?.error || '失敗');
          await notifyMbGrant(data.expo_push_token, n);
          await openAccount(uid);
          const done = $('grantPtsMsg');
          if (done) {
            done.classList.remove('err');
            done.classList.add('ok');
            done.textContent = `已入帳，餘額 ${data.mb_balance ?? '—'}（待領 ${data.mb_pending} · 累計已贈 ${data.mb_granted_total}）`;
          }
        } finally {
          if (document.body.contains(t)) {
            t.removeAttribute('disabled');
            t.textContent = '贈 M幣';
          }
        }
      } else if (act === 'grant') {
        const box = t.closest('[data-shop]');
        const sid = box?.getAttribute('data-shop');
        const mod = $('grantMod')?.value;
        const days = Number($('grantDays')?.value || 7);
        const data = await rpc('hq_grant_module', {
          p_token: token(),
          p_shop_id: sid,
          p_module: mod,
          p_days: days,
        });
        if (!data?.ok) {
          const extra = data?.shop_name ? `（已在「${data.shop_name}」）` : '';
          throw new Error((data?.error === 'other_shop' ? '同一模組已在別間店開通' : data?.error || '失敗') + extra);
        }
        await openShop(sid);
      } else if (act === 'revoke') {
        const sid = t.getAttribute('data-shop');
        const mod = t.getAttribute('data-mod');
        const data = await rpc('hq_revoke_module', {
          p_token: token(),
          p_shop_id: sid,
          p_module: mod,
        });
        if (!data?.ok) throw new Error(data?.error || '失敗');
        await openShop(sid);
      }
    } catch (err) {
      errBox('deskErr', err.message || '操作失敗');
    }
  })();
});

if (!window.HQ_CONFIG?.url) {
  errBox('gateErr', 'config');
} else if (token()) {
  void bootDesk();
}
