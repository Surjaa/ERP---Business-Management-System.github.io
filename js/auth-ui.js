/* auth-ui.js: sign in / sign up screen. Decides whether to show the login screen or the app.
   Uses the Auth API from auth.js and starts the app via App.start() after sign in. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const authEl = $('#auth');
  const appEl = $('#app');

  function showError(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.remove('shake');
    void el.offsetWidth; // restart the shake animation
    if (msg) el.classList.add('shake');
  }

  function setBusy(btn, busy, text) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Please wait…' : text;
  }

  // Switch between the Sign in and Create account tabs, with a sliding indicator
  function selectTab(name) {
    const isLogin = name === 'login';
    $('#login-form').hidden = !isLogin;
    $('#signup-form').hidden = isLogin;
    $('#tab-login').setAttribute('aria-selected', String(isLogin));
    $('#tab-signup').setAttribute('aria-selected', String(!isLogin));
    document.querySelector('.auth-indicator').classList.toggle('right', !isLogin);
    $('#login-error').hidden = true;
    $('#signup-error').hidden = true;
  }

  function enterApp(user) {
    $('#user-chip').textContent = user.name.split(' ')[0];
    authEl.classList.add('leaving');
    setTimeout(() => {
      authEl.hidden = true;
      authEl.classList.remove('leaving');
      appEl.hidden = false;
      document.body.classList.add('authed');
      App.start();
    }, 380);
  }

  function init() {
    // Sign out: clear the session and reload to the login screen
    document.querySelectorAll('[data-signout]').forEach((b) => b.addEventListener('click', () => {
      Auth.logout();
      location.hash = '';
      location.reload();
    }));

    const user = Auth.current();
    if (user) {
      enterApp(user);
      return;
    }
    authEl.hidden = false;

    document.querySelectorAll('.auth-tabs [data-tab]').forEach((b) =>
      b.addEventListener('click', () => selectTab(b.dataset.tab)));

    // Sign in
    const loginForm = $('#login-form');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = loginForm.elements;
      const btn = loginForm.querySelector('button[type=submit]');
      showError('#login-error', '');
      if (!f.email.value.trim() || !f.password.value) return showError('#login-error', 'Enter your email and password');
      setBusy(btn, true, 'Sign in');
      try {
        const u = await Auth.login({ email: f.email.value, password: f.password.value, remember: f.remember.checked });
        enterApp(u);
      } catch (err) {
        showError('#login-error', err.message);
        setBusy(btn, false, 'Sign in');
      }
    });

    // Demo account (creates it on first use)
    $('#demo-btn').addEventListener('click', async () => {
      const btn = $('#demo-btn');
      setBusy(btn, true, 'Try the demo account');
      try { enterApp(await Auth.demo()); } catch (err) {
        showError('#login-error', err.message);
        setBusy(btn, false, 'Try the demo account');
      }
    });

    // Sign up
    const signupForm = $('#signup-form');
    const meter = signupForm.querySelector('.strength span');
    signupForm.elements.password.addEventListener('input', (e) => {
      const s = Auth.strength(e.target.value);
      meter.style.width = (s / 4) * 100 + '%';
      meter.dataset.level = s;
    });
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = signupForm.elements;
      const btn = signupForm.querySelector('button[type=submit]');
      showError('#signup-error', '');
      setBusy(btn, true, 'Create account');
      try {
        await Auth.signup({ name: f.name.value, business: f.business.value, email: f.email.value, password: f.password.value });
        const u = await Auth.login({ email: f.email.value, password: f.password.value, remember: true });
        enterApp(u);
      } catch (err) {
        showError('#signup-error', err.message);
        setBusy(btn, false, 'Create account');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
