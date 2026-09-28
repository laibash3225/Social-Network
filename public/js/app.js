(function () {
  'use strict';

  // ---------------- State ----------------
  let token = localStorage.getItem('nook_token') || null;
  let me = null;
  let socket = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------- API helper ----------------
  async function api(path, { method = 'GET', body, isForm = false } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function initials(name) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function avatarStyle(user) {
    return user && user.avatar ? `style="background-image:url('${user.avatar}')"` : '';
  }

  // ---------------- Auth screen ----------------
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      $('#login-form').classList.toggle('hidden', which !== 'login');
      $('#register-form').classList.toggle('hidden', which !== 'register');
    });
  });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/login', { method: 'POST', body: Object.fromEntries(fd) });
      onAuthSuccess(data);
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  $('#register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/register', { method: 'POST', body: Object.fromEntries(fd) });
      onAuthSuccess(data);
    } catch (err) {
      $('#register-error').textContent = err.message;
    }
  });

  function onAuthSuccess(data) {
    token = data.token;
    me = data.user;
    localStorage.setItem('nook_token', token);
    enterApp();
  }

  $('#logout-btn').addEventListener('click', () => {
    localStorage.removeItem('nook_token');
    token = null;
    me = null;
    if (socket) socket.close();
    location.reload();
  });

  // ---------------- Navigation ----------------
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      $$('.view').forEach(v => v.classList.add('hidden'));
      $(`#view-${item.dataset.view}`).classList.remove('hidden');
      if (item.dataset.view === 'friends') loadFriendsView();
      if (item.dataset.view === 'notifications') loadNotifications();
      if (item.dataset.view === 'profile') loadProfileView();
    });
  });

  // ---------------- Feed ----------------
  const composerImageInput = $('#post-form [name=image]');
  composerImageInput.addEventListener('change', () => {
    const file = composerImageInput.files[0];
    const preview = $('#composer-preview');
    if (!file) { preview.classList.add('hidden'); preview.innerHTML = ''; return; }
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}">`;
    preview.classList.remove('hidden');
  });

  $('#post-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('text').trim() && !fd.get('image').size) return;
    try {
      const post = await api('/posts', { method: 'POST', body: fd, isForm: true });
      prependPost(post);
      e.target.reset();
      $('#composer-preview').classList.add('hidden');
    } catch (err) {
      toast(err.message);
    }
  });

  function renderPost(post) {
    const isMine = post.author.id === me.id;
    const commentsHtml = post.comments.map(c => `
      <div class="comment"><b>${escapeHtml(c.author.username)}</b>: ${escapeHtml(c.text)}</div>
    `).join('');

    const el = document.createElement('div');
    el.className = 'post';
    el.dataset.postId = post.id;
    el.innerHTML = `
      <div class="post-head">
        <div class="avatar" ${avatarStyle(post.author)}>${post.author.avatar ? '' : initials(post.author.username)}</div>
        <div>
          <div class="post-author">${escapeHtml(post.author.username)}</div>
          <div class="post-meta">${timeAgo(post.createdAt)} · ${post.privacy === 'friends' ? '👥 Friends' : '🌐 Public'}</div>
        </div>
        ${isMine ? '<button class="delete-post">Delete</button>' : ''}
      </div>
      ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
      ${post.image ? `<img class="post-image" src="${post.image}">` : ''}
      <div class="post-actions">
        <button class="post-action like-btn ${post.likedByMe ? 'liked' : ''}">
          ${post.likedByMe ? '❤️' : '🤍'} <span class="like-count">${post.likeCount}</span>
        </button>
        <button class="post-action comment-toggle">💬 <span class="comment-count">${post.comments.length}</span></button>
      </div>
      <div class="comments ${post.comments.length ? '' : 'hidden'}">
        ${commentsHtml}
        <form class="comment-form">
          <input type="text" placeholder="Write a comment…" required>
          <button type="submit">Send</button>
        </form>
      </div>
    `;

    el.querySelector('.like-btn').addEventListener('click', async () => {
      try {
        const res = await api(`/posts/${post.id}/like`, { method: 'POST' });
        el.querySelector('.like-btn').classList.toggle('liked', res.liked);
        el.querySelector('.like-btn').innerHTML = `${res.liked ? '❤️' : '🤍'} <span class="like-count">${res.likeCount}</span>`;
      } catch (err) { toast(err.message); }
    });

    el.querySelector('.comment-toggle').addEventListener('click', () => {
      el.querySelector('.comments').classList.toggle('hidden');
    });

    el.querySelector('.comment-form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const input = ev.target.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      try {
        const comment = await api(`/posts/${post.id}/comment`, { method: 'POST', body: { text } });
        const div = document.createElement('div');
        div.className = 'comment';
        div.innerHTML = `<b>${escapeHtml(comment.author.username)}</b>: ${escapeHtml(comment.text)}`;
        el.querySelector('.comment-form').before(div);
        el.querySelector('.comments').classList.remove('hidden');
        const countEl = el.querySelector('.comment-count');
        countEl.textContent = Number(countEl.textContent) + 1;
        input.value = '';
      } catch (err) { toast(err.message); }
    });

    if (isMine) {
      el.querySelector('.delete-post').addEventListener('click', async () => {
        if (!confirm('Delete this post?')) return;
        try {
          await api(`/posts/${post.id}`, { method: 'DELETE' });
          el.remove();
        } catch (err) { toast(err.message); }
      });
    }

    return el;
  }

  function prependPost(post) {
    $('#feed-list').prepend(renderPost(post));
    $('#feed-empty').classList.add('hidden');
  }

  async function loadFeed() {
    const posts = await api('/posts/feed');
    const list = $('#feed-list');
    list.innerHTML = '';
    posts.forEach(p => list.appendChild(renderPost(p)));
    $('#feed-empty').classList.toggle('hidden', posts.length > 0);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------- Friends view ----------------
  function userRow(user, actionsHtml) {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `
      <div class="avatar" ${avatarStyle(user)}>${user.avatar ? '' : initials(user.username)}</div>
      <div class="user-name">${escapeHtml(user.username)}</div>
      ${actionsHtml || ''}
    `;
    return row;
  }

  let searchDebounce;
  $('#user-search').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchUsers(e.target.value), 250);
  });

  async function searchUsers(q) {
    const users = await api(`/users?q=${encodeURIComponent(q)}`);
    const container = $('#search-results');
    container.innerHTML = '';
    users.forEach(u => {
      const row = userRow(u, `<button class="btn btn-primary add-friend-btn">Add friend</button>`);
      row.querySelector('.add-friend-btn').addEventListener('click', async btn => {
        try {
          await api(`/friends/request/${u.id}`, { method: 'POST' });
          row.querySelector('.add-friend-btn').outerHTML = '<span class="post-meta">Request sent</span>';
        } catch (err) { toast(err.message); }
      });
      container.appendChild(row);
    });
  }

  async function loadFriendsView() {
    const [requests, friends] = await Promise.all([api('/friends/requests'), api('/friends')]);

    const reqList = $('#requests-list');
    reqList.innerHTML = '';
    requests.forEach(r => {
      const row = userRow(r.from, `
        <button class="btn btn-primary accept-btn">Accept</button>
        <button class="btn btn-ghost decline-btn">Decline</button>
      `);
      row.querySelector('.accept-btn').addEventListener('click', async () => {
        await api(`/friends/accept/${r.id}`, { method: 'POST' });
        loadFriendsView();
      });
      row.querySelector('.decline-btn').addEventListener('click', async () => {
        await api(`/friends/decline/${r.id}`, { method: 'POST' });
        loadFriendsView();
      });
      reqList.appendChild(row);
    });
    $('#requests-empty').classList.toggle('hidden', requests.length > 0);
    updateBadge('#requests-badge', requests.length);

    const friendsList = $('#friends-list');
    friendsList.innerHTML = '';
    friends.forEach(f => friendsList.appendChild(userRow(f)));
    $('#friends-empty').classList.toggle('hidden', friends.length > 0);

    renderSidebar(requests, friends);
  }

  async function renderSidebar(requests, friends) {
    const sideReq = $('#side-requests');
    sideReq.innerHTML = '';
    requests.slice(0, 4).forEach(r => {
      const row = userRow(r.from, `<button class="btn btn-primary accept-btn-side">Accept</button>`);
      row.querySelector('.accept-btn-side').addEventListener('click', async () => {
        await api(`/friends/accept/${r.id}`, { method: 'POST' });
        loadFriendsView();
      });
      sideReq.appendChild(row);
    });
    $('#side-requests-empty').classList.toggle('hidden', requests.length > 0);

    const friendIds = new Set(friends.map(f => f.id));
    const allUsers = await api('/users');
    const suggestions = allUsers.filter(u => !friendIds.has(u.id)).slice(0, 5);
    const sideSug = $('#side-suggestions');
    sideSug.innerHTML = '';
    suggestions.forEach(u => {
      const row = userRow(u, `<button class="btn btn-ghost add-friend-btn-side">Add</button>`);
      row.querySelector('.add-friend-btn-side').addEventListener('click', async () => {
        try {
          await api(`/friends/request/${u.id}`, { method: 'POST' });
          toast('Friend request sent');
          renderSidebar(requests, friends);
        } catch (err) { toast(err.message); }
      });
      sideSug.appendChild(row);
    });
  }

  function updateBadge(sel, count) {
    const el = $(sel);
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  }

  // ---------------- Notifications ----------------
  const notifIcons = { like: '❤️', comment: '💬', friend_request: '➕', friend_accept: '🤝' };

  function renderNotification(n) {
    const el = document.createElement('div');
    el.className = `notif ${n.read ? '' : 'unread'}`;
    el.innerHTML = `
      <div>${notifIcons[n.type] || '🔔'}</div>
      <div>
        <div>${escapeHtml(n.message)}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    `;
    return el;
  }

  async function loadNotifications() {
    const notifications = await api('/notifications');
    const list = $('#notifications-list');
    list.innerHTML = '';
    notifications.forEach(n => list.appendChild(renderNotification(n)));
    $('#notif-empty').classList.toggle('hidden', notifications.length > 0);
    updateBadge('#notif-badge', notifications.filter(n => !n.read).length);
  }

  $('#mark-all-read').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    loadNotifications();
  });

  // ---------------- Profile ----------------
  async function loadProfileView() {
    $('#profile-form [name=bio]').value = me.bio || '';
    $('#profile-form [name=privacy]').value = me.privacy;
    const avatarEl = $('#profile-avatar-preview');
    avatarEl.style.backgroundImage = me.avatar ? `url('${me.avatar}')` : '';
    avatarEl.textContent = me.avatar ? '' : initials(me.username);

    const posts = await api(`/posts/user/${me.id}`);
    const list = $('#profile-posts');
    list.innerHTML = '';
    posts.forEach(p => list.appendChild(renderPost(p)));
  }

  $('#profile-form [name=avatar]').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const el = $('#profile-avatar-preview');
    el.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
    el.textContent = '';
  });

  $('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      me = await api('/users/me', { method: 'PUT', body: fd, isForm: true });
      renderMe();
      $('#profile-saved').classList.remove('hidden');
      setTimeout(() => $('#profile-saved').classList.add('hidden'), 2000);
    } catch (err) { toast(err.message); }
  });

  function renderMe() {
    $('#me-username').textContent = me.username;
    const avatarEl = $('#me-avatar');
    avatarEl.style.backgroundImage = me.avatar ? `url('${me.avatar}')` : '';
    avatarEl.textContent = me.avatar ? '' : initials(me.username);
  }

  // ---------------- Realtime (WebSocket) ----------------
  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    socket.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      handleRealtimeEvent(msg);
    });

    socket.addEventListener('close', () => {
      // best-effort reconnect
      setTimeout(() => { if (token) connectSocket(); }, 3000);
    });
  }

  function handleRealtimeEvent(msg) {
    switch (msg.type) {
      case 'new_post': {
        const feedVisible = !$('#view-feed').classList.contains('hidden');
        if (feedVisible) prependPost(msg.post);
        toast(`${msg.post.author.username} shared a new post`);
        break;
      }
      case 'post_updated': {
        const el = document.querySelector(`.post[data-post-id="${msg.postId}"] .like-count`);
        if (el) el.textContent = msg.likeCount;
        break;
      }
      case 'new_comment': {
        const postEl = document.querySelector(`.post[data-post-id="${msg.postId}"]`);
        if (postEl) {
          const div = document.createElement('div');
          div.className = 'comment';
          div.innerHTML = `<b>${escapeHtml(msg.comment.author.username)}</b>: ${escapeHtml(msg.comment.text)}`;
          postEl.querySelector('.comment-form').before(div);
          const countEl = postEl.querySelector('.comment-count');
          countEl.textContent = Number(countEl.textContent) + 1;
        }
        break;
      }
      case 'notification': {
        toast(msg.notification.message);
        const badge = $('#notif-badge');
        updateBadge('#notif-badge', Number(badge.textContent || 0) + 1);
        const notifView = !$('#view-notifications').classList.contains('hidden');
        if (notifView) loadNotifications();
        break;
      }
      case 'friend_request': {
        const friendsView = !$('#view-friends').classList.contains('hidden');
        if (friendsView) loadFriendsView();
        break;
      }
      case 'friend_accepted': {
        const friendsView = !$('#view-friends').classList.contains('hidden');
        if (friendsView) loadFriendsView();
        break;
      }
      default: break;
    }
  }

  // ---------------- Boot ----------------
  async function enterApp() {
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    renderMe();
    connectSocket();
    await loadFeed();
    const notifications = await api('/notifications');
    updateBadge('#notif-badge', notifications.filter(n => !n.read).length);
  }

  (async function init() {
    if (!token) return;
    try {
      me = await api('/users/me');
      enterApp();
    } catch (err) {
      localStorage.removeItem('nook_token');
      token = null;
    }
  })();
})();

// ---------------- Theme (dark / light) ----------------
document.addEventListener('DOMContentLoaded', function () {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  function applyTheme(mode) {
    const dark = mode === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    themeToggle.textContent = dark ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  const saved = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (systemDark ? 'dark' : 'light'));

  themeToggle.addEventListener('click', function () {
    const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
});