// VireonGames Owner — phone app (Add to Home Screen) with live push alerts.
(() => {
  const CFG = {
    url: 'https://uzaqyzmooryijazhmvzw.supabase.co',
    key: 'sb_publishable_WENBPEDqet2T-kzhPdMudw_TP60v7C-',
    ownerEmail: 'vireoninteractive@gmail.com',
    vapidPublicKey: 'BILGndIb8I2rYNnkxwkxyXoTx03LwAnA954zr5ncyUIqHJ8cvLte-n0ziAjbG8nPnEG6GoSDmN6WhJyx7V-Nr6c'
  };
  const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vireon-owner-auth' } });
  const app = document.getElementById('app');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanErr = (e) => String(e?.message || e || 'Something went wrong.');
  const isOwnerEmail = (e) => String(e || '').toLowerCase() === CFG.ownerEmail;
  const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const S = {
    view: 'loading', busy: false, error: '', email: CFG.ownerEmail,
    tab: 'alerts', range: '30',
    activity: null, stats: null, feedback: null, devices: null,
    replyOpen: '', replyDraft: '', push: { sub: null, permission: 'default' }
  };

  let toastTimer;
  function toast(msg, bad = false) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ---------- time helpers ----------
  const ago = (d) => {
    const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const dayLabel = (d) => {
    const x = new Date(d); const t = new Date(); const y = new Date(Date.now() - 86400000);
    if (x.toDateString() === t.toDateString()) return 'Today';
    if (x.toDateString() === y.toDateString()) return 'Yesterday';
    return x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  // ---------- icons ----------
  const svg = (p, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    signup: svg('<circle cx="10" cy="8" r="4"/><path d="M2.5 21c1-4 4-6 7.5-6s6.5 2 7.5 6"/><path d="M19 8v6M16 11h6"/>'),
    like: svg('<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>'),
    dislike: svg('<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z"/>'),
    comment: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'),
    test: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    alerts: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', 22),
    overview: svg('<path d="M4 20V4M4 20h16M9 16v-5M14 16V8M19 16v-3"/>', 22),
    feedback: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>', 22),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>', 22)
  };

  // ---------- push notifications ----------
  const b64ToBytes = (s) => { const b = atob((s + '==='.slice((s.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  let swReg = null;
  async function initPush() {
    if (!pushSupported()) return;
    try {
      swReg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      await navigator.serviceWorker.ready;
      S.push.sub = await swReg.pushManager.getSubscription();
      S.push.permission = Notification.permission;
    } catch (e) { console.warn('service worker', e); }
  }
  async function saveSub(sub) {
    const j = sub.toJSON();
    const { error } = await sb.rpc('owner_save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
    if (error) throw error;
  }
  async function enablePush() {
    if (!pushSupported()) { toast('Add this app to your Home Screen first, then open it from there.', true); return; }
    S.busy = true; render();
    try {
      const perm = await Notification.requestPermission();
      S.push.permission = perm;
      if (perm !== 'granted') throw new Error('Notifications were not allowed. Turn them on in iPhone Settings → Notifications → Vireon Owner.');
      if (!swReg) await initPush();
      const sub = (await swReg.pushManager.getSubscription()) || await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapidPublicKey) });
      await saveSub(sub);
      S.push.sub = sub;
      await loadTab('settings');
      toast('Phone alerts are on');
    } catch (e) { toast(ownerErr(e), true); }
    S.busy = false; render();
  }
  async function disablePush() {
    S.busy = true; render();
    try {
      const sub = S.push.sub || (swReg && await swReg.pushManager.getSubscription());
      if (sub) { await sb.rpc('owner_remove_push', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      S.push.sub = null;
      await loadTab('settings');
      toast('Alerts are off on this phone');
    } catch (e) { toast(ownerErr(e), true); }
    S.busy = false; render();
  }

  // ---------- data ----------
  const ownerErr = (e) => (/Owner access required/i.test(cleanErr(e)) ? 'Your owner session ended. Enter your owner code again.' : cleanErr(e));
  async function call(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (/Owner access required/i.test(error.message)) { S.view = 'ownercode'; S.error = 'For your security, enter your owner code again.'; render(); }
      throw error;
    }
    return data;
  }
  async function loadTab(tab) {
    try {
      if (tab === 'alerts') S.activity = await call('owner_activity', { n: 80 });
      if (tab === 'overview') S.stats = await call('owner_stats', { days: S.range === 'all' ? null : Number(S.range) });
      if (tab === 'feedback') {
        S.feedback = await call('owner_feedback');
        if (S.feedback.some((c) => !c.seen_by_owner)) await call('owner_mark_comments_seen');
      }
      if (tab === 'settings' || tab === 'alerts') S.devices = await call('owner_push_devices');
      if (tab !== 'feedback') S.unread = (await sb.rpc('owner_unread_comments')).data || 0;
      else S.unread = 0;
    } catch (e) { if (S.view === 'main') toast(ownerErr(e), true); }
  }

  // ---------- screens ----------
  const emblem = '../assets/emblem.png';
  function authScreen() {
    if (S.view === 'signin') return `<div class="auth">
      <img class="emblem" src="${emblem}" alt="">
      <h1 class="display">Owner sign in</h1>
      <p class="lead">VireonGames Owner is only for the studio owner account.</p>
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
      <form data-form="signin">
        <label class="field"><span class="label">Email</span><input class="input" name="email" type="email" autocomplete="username" value="${esc(S.email)}" required></label>
        <label class="field"><span class="label">Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn blue full" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Checking…' : 'Continue'}</button>
      </form></div>`;
    if (S.view === 'emailcode') return `<div class="auth">
      <img class="emblem" src="${emblem}" alt="">
      <h1 class="display">Check your email</h1>
      <p class="lead">We sent a 6-digit code to ${esc(S.email)}.</p>
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
      <form data-form="emailcode">
        <label class="field"><input class="input code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required></label>
        <button class="btn blue full" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Verifying…' : 'Verify'}</button>
      </form>
      <p style="text-align: center; margin-top: 16px"><button class="link" data-act="resend">Send a new code</button> · <button class="link" data-act="back">Back</button></p></div>`;
    if (S.view === 'ownercode') return `<div class="auth">
      <img class="emblem" src="${emblem}" alt="">
      <h1 class="display">Owner code</h1>
      <p class="lead">Enter your 4-digit owner security code.</p>
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
      <form data-form="ownercode">
        <label class="field"><input class="input code" name="code" type="password" inputmode="numeric" maxlength="4" placeholder="••••" required></label>
        <button class="btn blue full" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Checking…' : 'Unlock'}</button>
      </form>
      <p style="text-align: center; margin-top: 16px"><button class="link" data-act="signout">Sign out</button></p></div>`;
    if (S.view === 'denied') return `<div class="auth"><img class="emblem" src="${emblem}" alt=""><h1 class="display">Owner only</h1>
      <p class="lead">This app only works with the VireonGames owner account.</p><button class="btn ghost full" data-act="signout">Sign out</button></div>`;
    return '<div class="auth"><div class="spin"></div></div>';
  }

  const top = (title, sub) => `<div class="top"><div class="brand"><img src="${emblem}" alt=""><div><b>VIREON</b><small>OWNER</small></div></div>
    <button class="btn ghost sm" data-act="refresh" aria-label="Refresh">${svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>', 18)}</button></div>
    <h1 class="title display">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}`;

  function pushBanner() {
    if (S.push.sub && S.push.permission === 'granted') return '';
    return `<a class="banner" href="#settings">${IC.alerts}<p><b>Turn on phone alerts</b><br><span class="muted">Get a notification for every new player, like, comment and download.</span></p></a>`;
  }

  function alertsTab() {
    const list = S.activity;
    let body;
    if (list === null) body = '<div class="spin"></div>';
    else if (!list.length) body = '<div class="empty">No activity yet. New players, likes, dislikes, comments and downloads will show up here.</div>';
    else {
      let last = '';
      body = list.map((e) => {
        const d = dayLabel(e.created_at);
        const head = d !== last ? `<div class="day">${esc(d)}</div>` : '';
        last = d;
        return head + `<div class="ev"><div class="ic ${esc(e.kind)}">${IC[e.kind] || IC.test}</div><div style="min-width: 0"><div class="t">${esc(String(e.title).replace(/^[^\p{L}\p{N}]+/u, ''))}</div>${e.body ? `<div class="b">${esc(e.body)}</div>` : ''}<div class="w">${ago(e.created_at)}</div></div></div>`;
      }).join('');
    }
    return top('Alerts', 'Everything players do, as it happens.') + pushBanner() + `<div class="stack">${body}</div>`;
  }

  function overviewTab() {
    const s = S.stats;
    const ranges = [['0', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All time']];
    const card = (k, v, sub) => `<div class="card stat"><span class="k">${k}</span><span class="v">${v ?? '–'}</span><span class="s">${sub}</span></div>`;
    const approval = s && (s.likes + s.dislikes) ? Math.round((s.likes / (s.likes + s.dislikes)) * 100) + '%' : '–';
    return top('Overview') + `<div class="chips">${ranges.map(([v, l]) => `<button class="chip ${S.range === v ? 'on' : ''}" data-act="range" data-v="${v}">${l}</button>`).join('')}</div>` +
      (!s ? '<div class="spin"></div>' : `<div class="grid2">
        ${card('New players', s.new_players, 'In period')}${card('Games claimed', s.claims, 'In period')}
        ${card('Likes', s.likes, 'In period')}${card('Dislikes', s.dislikes, 'In period')}
        ${card('Approval', approval, 'Likes vs dislikes')}${card('Comments', s.comments, 'In period')}
        ${card('Downloads', s.downloads, 'All time')}${card('Wishlists', s.wishlists, 'All time')}
      </div>
      <div class="card" style="margin-top: 12px"><span class="label">Latest comments</span><div class="stack" style="margin-top: 10px">
        ${(s.latest_comments || []).length ? s.latest_comments.map((c) => `<div><b>${esc(c.username)}</b> <span class="muted">on ${esc(c.title)}</span><div style="font-size: 14px; color: #C3C7D8">${esc(c.body)}</div><div class="mono" style="font-size: 11px; color: var(--dim)">${ago(c.created_at)}</div></div>`).join('') : '<span class="muted">No comments yet.</span>'}
      </div></div>
      <div class="card" style="margin-top: 12px"><span class="label">Latest sign-ups</span><div class="stack" style="margin-top: 10px">
        ${(s.latest_signups || []).length ? s.latest_signups.map((c) => `<div style="display: flex; justify-content: space-between"><span>${esc(c.username || '(choosing username)')}</span><span class="mono" style="font-size: 11px; color: var(--dim)">${ago(c.created_at)}</span></div>`).join('') : '<span class="muted">No sign-ups yet.</span>'}
      </div></div>`);
  }

  function feedbackTab() {
    const list = S.feedback;
    let body;
    if (list === null) body = '<div class="spin"></div>';
    else if (!list.length) body = '<div class="empty">No comments yet.</div>';
    else body = list.map((c) => `<div class="card fb ${c.seen_by_owner ? '' : 'new'}">
        <div class="head"><b>${esc(c.username)}</b><span class="muted">on ${esc(c.title)}</span>
          ${c.reaction === 1 ? '<span class="tag up">LIKED</span>' : c.reaction === -1 ? '<span class="tag down">DISLIKED</span>' : ''}
          ${c.seen_by_owner ? '' : '<span class="tag new">NEW</span>'}</div>
        <p class="text">${esc(c.body)}</p>
        <div class="mono" style="font-size: 11px; color: var(--dim); margin-top: 6px">${ago(c.created_at)}</div>
        ${(c.replies || []).map((r) => `<div class="reply"><span class="who">Your reply</span><p>${esc(r.body)}</p></div>`).join('')}
        ${S.replyOpen === c.id
          ? `<form data-form="reply" data-id="${c.id}" data-game="${c.game_id}" style="margin-top: 10px"><textarea class="input" name="body" data-reply maxlength="1000" placeholder="Reply to ${esc(c.username)}">${esc(S.replyDraft)}</textarea>
             <div class="row"><button type="button" class="btn ghost sm" data-act="reply" data-id="">Cancel</button><button class="btn blue sm" style="flex: 1">Send reply</button></div></form>`
          : `<div class="row"><button class="btn ghost sm" data-act="reply" data-id="${c.id}">Reply</button><button class="btn danger sm" data-act="del" data-id="${c.id}">Delete</button></div>`}
      </div>`).join('');
    return top('Feedback', 'Reply here and the player sees it in the launcher.') + `<div class="stack">${body}</div>`;
  }

  function settingsTab() {
    const on = !!(S.push.sub && S.push.permission === 'granted');
    let pushCard;
    if (!pushSupported() && isIOS() && !standalone()) {
      pushCard = `<div class="card"><span class="label">Phone alerts</span>
        <p style="margin: 10px 0 0">To get alerts on your iPhone, add this app to your Home Screen first:</p>
        <ol class="steps"><li>Tap the <b>Share</b> button in Safari (the square with the arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Vireon Owner</b> from your Home Screen and come back here.</li></ol></div>`;
    } else if (!pushSupported()) {
      pushCard = `<div class="card"><span class="label">Phone alerts</span><p style="margin: 10px 0 0" class="muted">This browser can't receive push alerts. On iPhone, use Safari and add the app to your Home Screen (iOS 16.4 or newer).</p></div>`;
    } else {
      pushCard = `<div class="card"><span class="label">Phone alerts</span>
        <div class="status ${on ? 'on' : ''}" style="margin: 12px 0 6px"><i></i>${on ? 'On for this phone' : S.push.permission === 'denied' ? 'Blocked in iPhone Settings' : 'Off'}</div>
        <p class="muted" style="margin: 0 0 14px; font-size: 14px">New players, likes, dislikes, comments and downloads. ${S.devices != null ? `${S.devices} ${S.devices === 1 ? 'device' : 'devices'} registered.` : ''}</p>
        ${S.push.permission === 'denied' ? '<p class="muted" style="font-size: 14px; margin: 0 0 12px">Open iPhone <b>Settings → Notifications → Vireon Owner</b> and allow notifications, then come back.</p>' : ''}
        ${on
          ? `<div class="stack"><button class="btn blue full" data-act="test" ${S.busy ? 'disabled' : ''}>Send a test alert</button><button class="btn ghost full" data-act="pushoff" ${S.busy ? 'disabled' : ''}>Turn off on this phone</button></div>`
          : `<button class="btn blue full" data-act="pushon" ${S.busy || S.push.permission === 'denied' ? 'disabled' : ''}>Turn on phone alerts</button>`}
      </div>`;
    }
    return top('Settings') + `<div class="stack">${pushCard}
      <div class="card"><span class="label">Account</span><p style="margin: 10px 0 14px">${esc(CFG.ownerEmail)}</p><button class="btn danger full" data-act="signout">Sign out</button></div>
      <p class="mono" style="text-align: center; font-size: 11px; color: var(--dim)">VireonGames Owner · alerts keep working when the app is closed</p></div>`;
  }

  const TABS = [['alerts', 'Alerts', alertsTab], ['overview', 'Overview', overviewTab], ['feedback', 'Feedback', feedbackTab], ['settings', 'Settings', settingsTab]];
  function render() {
    if (S.view !== 'main') { app.innerHTML = authScreen(); return; }
    const t = TABS.find((x) => x[0] === S.tab) || TABS[0];
    app.innerHTML = `<main class="screen">${t[2]()}</main>
      <nav class="tabs">${TABS.map(([k, l]) => `<a href="#${k}" class="${S.tab === k ? 'on' : ''}">${IC[k]}${l}${k === 'feedback' && S.unread ? `<span class="dot">${S.unread}</span>` : ''}</a>`).join('')}</nav>`;
  }

  async function openTab(tab) {
    S.tab = TABS.some((x) => x[0] === tab) ? tab : 'alerts';
    render(); window.scrollTo(0, 0);
    await loadTab(S.tab); render();
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  }
  window.addEventListener('hashchange', () => { if (S.view === 'main') openTab(location.hash.slice(1)); });

  // ---------- sign-in flow ----------
  async function afterSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { S.view = 'signin'; return render(); }
    if (!isOwnerEmail(session.user.email)) { S.view = 'denied'; return render(); }
    const { data } = await sb.rpc('is_owner');
    if (data === true) { S.view = 'main'; S.error = ''; await syncSub(); return openTab(location.hash.slice(1) || 'alerts'); }
    S.view = 'ownercode'; render();
  }
  async function syncSub() {
    // Keep this phone's registration up to date (iOS can renew it).
    if (S.push.sub && Notification.permission === 'granted') { try { await saveSub(S.push.sub); } catch {} }
  }

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const d = Object.fromEntries(new FormData(f)); const kind = f.dataset.form;
    S.error = '';
    if (kind === 'signin') {
      S.email = String(d.email || '').trim().toLowerCase();
      if (!isOwnerEmail(S.email)) { S.error = 'This app only works with the VireonGames owner account.'; return render(); }
      S.busy = true; render();
      const pw = await sb.auth.signInWithPassword({ email: S.email, password: String(d.password || '') });
      if (pw.error) { S.busy = false; S.error = pw.error.message === 'Invalid login credentials' ? 'Wrong email or password.' : pw.error.message; return render(); }
      await sb.auth.signOut();
      const otp = await sb.auth.signInWithOtp({ email: S.email, options: { shouldCreateUser: false } });
      S.busy = false;
      if (otp.error) { S.error = otp.error.message; return render(); }
      S.view = 'emailcode'; return render();
    }
    if (kind === 'emailcode') {
      const token = String(d.code || '').replace(/\D/g, '');
      if (token.length !== 6) { S.error = 'Enter the 6-digit code.'; return render(); }
      S.busy = true; render();
      const { error } = await sb.auth.verifyOtp({ email: S.email, token, type: 'email' });
      S.busy = false;
      if (error) { S.error = 'That code is wrong or has expired.'; return render(); }
      return afterSession();
    }
    if (kind === 'ownercode') {
      const code = String(d.code || '').replace(/\D/g, '');
      if (code.length !== 4) { S.error = 'Enter your 4-digit owner code.'; return render(); }
      S.busy = true; render();
      const { data: r, error } = await sb.rpc('verify_owner_code', { code });
      S.busy = false;
      if (error) { S.error = error.message; return render(); }
      if (r?.ok) return afterSession();
      S.error = r?.error === 'locked' ? `Too many wrong codes. Locked until ${new Date(r.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        : r?.error === 'wrong' ? `Wrong code. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left.` : 'Owner access isn’t available for this account.';
      return render();
    }
    if (kind === 'reply') {
      const body = String(d.body || '').trim();
      if (!body) return toast('Write a reply first.', true);
      const { error } = await sb.from('game_comments').insert({ game_id: f.dataset.game, parent_id: f.dataset.id, body });
      if (error) return toast(/row-level security/i.test(error.message) ? 'Your owner session ended. Enter your owner code again.' : error.message, true);
      S.replyOpen = ''; S.replyDraft = '';
      toast('Reply sent');
      await loadTab('feedback'); return render();
    }
  });

  document.addEventListener('input', (e) => { if (e.target.hasAttribute('data-reply')) S.replyDraft = e.target.value; });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'back') { await sb.auth.signOut(); S.view = 'signin'; S.error = ''; return render(); }
    if (act === 'resend') {
      const r = await sb.auth.signInWithOtp({ email: S.email, options: { shouldCreateUser: false } });
      return r.error ? toast(r.error.message, true) : toast('New code sent');
    }
    if (act === 'signout') {
      if (S.view === 'main' && !confirm('Sign out of VireonGames Owner? Phone alerts keep working.')) return;
      try { await sb.rpc('owner_lock'); } catch {}
      await sb.auth.signOut(); S.view = 'signin'; S.error = ''; return render();
    }
    if (act === 'refresh') { el.disabled = true; await loadTab(S.tab); render(); return; }
    if (act === 'range') { S.range = el.dataset.v; S.stats = null; render(); await loadTab('overview'); return render(); }
    if (act === 'reply') { S.replyOpen = el.dataset.id; S.replyDraft = ''; render(); document.querySelector('[data-reply]')?.focus(); return; }
    if (act === 'del') {
      if (!confirm('Delete this comment? Its replies are deleted too.')) return;
      const { error } = await sb.from('game_comments').delete().eq('id', el.dataset.id);
      if (error) return toast(error.message, true);
      await loadTab('feedback'); return render();
    }
    if (act === 'pushon') return enablePush();
    if (act === 'pushoff') return disablePush();
    if (act === 'test') {
      el.disabled = true;
      try { await call('owner_test_push'); toast('Test alert sent. It should arrive in a few seconds.'); setTimeout(() => S.tab === 'alerts' && openTab('alerts'), 2500); }
      catch (err) { toast(ownerErr(err), true); }
      el.disabled = false; return;
    }
  });

  // Tapping a notification while the app is open jumps to Alerts.
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open' && S.view === 'main') { location.hash = '#alerts'; openTab('alerts'); } });
  // Fresh data whenever the app comes back to the front.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.view === 'main') openTab(S.tab); });

  (async () => { render(); await initPush(); await afterSession(); })();
})();
