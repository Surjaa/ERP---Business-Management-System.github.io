/* auth.js: client-side accounts for the prototype.
   Users live in localStorage; passwords are stored as salted SHA-256 hashes.
   This is a front-end prototype: a real product needs a server-side auth service. */
(function (global) {
  'use strict';

  const USERS_KEY = 'erp-bms-users';
  const SESSION_KEY = 'erp-bms-session';
  const DEMO = { name: 'Demo User', email: 'demo@example.com', password: 'demo1234', business: 'Demo Business' };

  const readJSON = (store, key, fallback) => {
    try { return JSON.parse(store.getItem(key)) ?? fallback; } catch (e) { return fallback; }
  };
  const users = () => readJSON(localStorage, USERS_KEY, []);
  const saveUsers = (list) => { try { localStorage.setItem(USERS_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ } };

  // SHA-256 when available (secure contexts); FNV-1a fallback so the demo still works everywhere
  async function hash(text, salt) {
    const data = new TextEncoder().encode(salt + ':' + text);
    if (global.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (const b of data) { h ^= b; h = Math.imul(h, 16777619) >>> 0; }
    return 'fnv-' + h.toString(16);
  }
  const salt = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, business: u.business, created: u.created };

  function setSession(user, remember) {
    const data = JSON.stringify({ id: user.id, at: Date.now() });
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, data);
      (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
    } catch (e) { /* storage blocked: session lasts for this page only */ }
  }

  const api = {
    // Returns the signed-in user or null
    current() {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)); } catch (e) { s = null; }
      if (!s) return null;
      return publicUser(users().find((u) => u.id === s.id)) || null;
    },

    async signup({ name, email, password, business }) {
      email = email.trim().toLowerCase();
      if (!name.trim()) throw new Error('Please enter your name');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('Use at least one letter and one number');
      if (!business.trim()) throw new Error('Enter your business name');
      const list = users();
      if (list.some((u) => u.email === email)) throw new Error('An account with this email already exists');
      const s = salt();
      const user = {
        id: 'U' + Date.now().toString(36), name: name.trim(), email, business: business.trim(),
        salt: s, hash: await hash(password, s), created: new Date().toISOString(),
      };
      list.push(user);
      saveUsers(list);
      return publicUser(user);
    },

    async login({ email, password, remember }) {
      email = email.trim().toLowerCase();
      const user = users().find((u) => u.email === email);
      // Same error for unknown email and wrong password, so the form does not reveal which accounts exist
      if (!user || (await hash(password, user.salt)) !== user.hash) throw new Error('Email or password is incorrect');
      setSession(user, remember);
      return publicUser(user);
    },

    // One-click demo account: created on first use, then signed in
    async demo() {
      if (!users().some((u) => u.email === DEMO.email)) await api.signup(DEMO);
      return api.login({ email: DEMO.email, password: DEMO.password, remember: false });
    },

    logout() {
      try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    },

    // 0-4 strength score for the signup meter
    strength(pw) {
      let s = 0;
      if (pw.length >= 8) s++;
      if (pw.length >= 12) s++;
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
      if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
      return s;
    },
  };

  global.Auth = api;
})(window);
