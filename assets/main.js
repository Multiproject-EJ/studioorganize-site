import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveBrandLogo } from './brand-logos.js';

// footer year
const y = document.getElementById('y');
if (y) y.textContent = new Date().getFullYear();

const THEME_KEY = 'SO_THEME_PREF';
const CONSTRUCTION_KEY = 'SO_SEEN_CONSTRUCTION';
const MOBILE_APP_MEDIA_QUERY = '(max-width: 768px)';
const THEME_COLORS = {
  dark: '#0b0f14',
  light: '#f7f9fc',
};

let themeColorMeta = null;
let appleStatusBarMeta = null;
let mobileMenuToggle = null;
let mobileAppDock = null;
let mobileAppInitialized = false;
let mobileAppMedia = null;

function ensureManifestLink(){
  let link = document.querySelector('link[rel="manifest"]');
  if (!link){
    link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    document.head.appendChild(link);
  }
  return link;
}

function ensureThemeColorMeta(){
  if (themeColorMeta && themeColorMeta.isConnected) return themeColorMeta;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta){
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  themeColorMeta = meta;
  return meta;
}

function ensureAppleCapableMeta(){
  let meta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
  if (!meta){
    meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', 'yes');
  return meta;
}

function ensureAppleStatusBarMeta(){
  if (appleStatusBarMeta && appleStatusBarMeta.isConnected) return appleStatusBarMeta;
  let meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!meta){
    meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-status-bar-style';
    document.head.appendChild(meta);
  }
  appleStatusBarMeta = meta;
  return meta;
}

function updateThemeColor(theme){
  const meta = ensureThemeColorMeta();
  const color = THEME_COLORS[theme] || THEME_COLORS.dark;
  meta.setAttribute('content', color);
  const statusBar = ensureAppleStatusBarMeta();
  statusBar.setAttribute('content', theme === 'dark' ? 'black' : 'default');
}

function initServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.error('Failed to register service worker', error);
    });
  };
  if (document.readyState === 'complete'){
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

ensureManifestLink();
ensureThemeColorMeta();
ensureAppleCapableMeta();
ensureAppleStatusBarMeta();
updateThemeColor(document.documentElement.dataset.theme || 'dark');
initServiceWorker();

function getStoredTheme(){
  try { return localStorage.getItem(THEME_KEY); }
  catch (err){ return null; }
}

function storeTheme(theme){
  try { localStorage.setItem(THEME_KEY, theme); }
  catch (err){ /* ignore private mode errors */ }
}

function markConstructionClass(){
  document.documentElement.classList.add('construction-overlay-dismissed');
}

function getConstructionDismissed(){
  try {
    if (localStorage.getItem(CONSTRUCTION_KEY) === '1') return true;
  } catch (_error){ /* ignore private mode errors */ }
  try {
    if (sessionStorage.getItem(CONSTRUCTION_KEY) === '1') return true;
  } catch (_error){ /* ignore private mode errors */ }
  return false;
}

function markConstructionDismissed(){
  let stored = false;
  try {
    localStorage.setItem(CONSTRUCTION_KEY, '1');
    stored = true;
  } catch (_error){ /* ignore private mode errors */ }
  if (!stored){
    try {
      sessionStorage.setItem(CONSTRUCTION_KEY, '1');
    } catch (_error){ /* ignore private mode errors */ }
  }
  markConstructionClass();
}

function themeToggles(){
  return Array.from(document.querySelectorAll('[data-theme-toggle]'));
}

function themeSelects(){
  return Array.from(document.querySelectorAll('[data-theme-select]'));
}

function updateToggleLabels(theme){
  const next = theme === 'dark' ? 'Light' : 'Dark';
  themeToggles().forEach(btn => {
    const icon = btn.querySelector('[data-theme-icon]');
    if (icon){
      icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    } else {
      btn.textContent = `${next} mode`;
    }
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    btn.setAttribute('aria-label', `Switch to ${next.toLowerCase()} mode`);
    btn.setAttribute('title', `Switch to ${next.toLowerCase()} mode`);
  });
}

function updateThemeSelects(theme){
  themeSelects().forEach(sel => {
    if (!(sel instanceof HTMLSelectElement)) return;
    if (sel.value === theme) return;
    const option = Array.from(sel.options).find(opt => opt.value === theme);
    if (option){
      sel.value = option.value;
    }
  });
}

function markBrandLogoReady(img){
  const brand = img.closest('.brand--logo');
  if (brand){
    brand.classList.add('brand--logo-ready');
  }
}

function bindBrandLogo(img){
  if (img.dataset.brandLogoBound === 'true') return;
  img.dataset.brandLogoBound = 'true';
  img.addEventListener('load', () => markBrandLogoReady(img));
  img.addEventListener('error', () => {
    const brand = img.closest('.brand--logo');
    if (brand){
      brand.classList.remove('brand--logo-ready');
    }
  });
  if (img.complete && img.naturalWidth){
    markBrandLogoReady(img);
  }
}

function updateBrandLogos(theme){
  const next = resolveBrandLogo(theme);
  document.querySelectorAll('[data-brand-logo]').forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    bindBrandLogo(img);
    if (next && img.getAttribute('src') !== next){
      img.setAttribute('src', next);
    } else if (img.complete && img.naturalWidth){
      markBrandLogoReady(img);
    }
  });
}

function closeMobileMenu(){
  if (!document.documentElement.classList.contains('is-mobile-menu-open')) return;
  document.documentElement.classList.remove('is-mobile-menu-open');
  if (mobileMenuToggle){
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
  }
}

function applyMobileMode(isMobile){
  document.documentElement.classList.toggle('is-mobile-app', isMobile);
  if (!isMobile){
    closeMobileMenu();
  }
}

function buildMobileMenu(nav, menu){
  if (!nav || !menu) return;
  if (nav.dataset.mobileMenuBound === 'true') return;
  nav.dataset.mobileMenuBound = 'true';

  if (!menu.id){
    menu.id = 'site-primary-menu';
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'menu__toggle';
  toggle.setAttribute('data-mobile-menu-toggle', '');
  toggle.setAttribute('aria-controls', menu.id);
  toggle.setAttribute('aria-expanded', 'false');

  const icon = document.createElement('span');
  icon.className = 'menu__toggle-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '☰';

  const label = document.createElement('span');
  label.className = 'menu__toggle-label';
  label.textContent = 'Menu';

  toggle.append(icon, label);
  nav.insertBefore(toggle, menu);

  const overlay = document.createElement('div');
  overlay.className = 'mobile-menu-overlay';
  overlay.setAttribute('data-mobile-menu-overlay', '');
  document.body.appendChild(overlay);

  const setOpenState = open => {
    document.documentElement.classList.toggle('is-mobile-menu-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = !document.documentElement.classList.contains('is-mobile-menu-open');
    setOpenState(isOpen);
  });

  overlay.addEventListener('click', () => {
    setOpenState(false);
  });

  menu.querySelectorAll('a, button').forEach(item => {
    item.addEventListener('click', event => {
      const target = event.currentTarget;
      if (target instanceof HTMLElement){
        const isDropdownTrigger = target.classList.contains('dropbtn') || target.closest('.dropdown-toggle');
        if (isDropdownTrigger) return;
      }
      setOpenState(false);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape'){
      setOpenState(false);
    }
  });

  document.addEventListener('click', event => {
    if (!document.documentElement.classList.contains('is-mobile-menu-open')) return;
    if (!(event.target instanceof Node)) return;
    if (menu.contains(event.target) || toggle.contains(event.target)) return;
    setOpenState(false);
  });

  mobileMenuToggle = toggle;
}

function buildMobileAppDock(){
  if (mobileAppDock && mobileAppDock.isConnected) return mobileAppDock;

  const dock = document.createElement('div');
  dock.className = 'mobile-app-dock';
  dock.setAttribute('data-mobile-app-dock', '');

  const workspaceButton = document.createElement('button');
  workspaceButton.type = 'button';
  workspaceButton.className = 'mobile-app-dock__action mobile-app-dock__action--primary';
  workspaceButton.setAttribute('data-mobile-app-workspace', '');
  workspaceButton.innerHTML = '<span class="mobile-app-dock__icon" aria-hidden="true">🎬</span><span>Open Workspace</span>';
  workspaceButton.addEventListener('click', () => {
    const toggle = document.querySelector('[data-workspace-toggle]');
    if (toggle instanceof HTMLElement){
      toggle.click();
    }
  });

  const questionnaireButton = document.createElement('button');
  questionnaireButton.type = 'button';
  questionnaireButton.className = 'mobile-app-dock__action mobile-app-dock__action--secondary';
  questionnaireButton.setAttribute('data-questionnaire-open', '');
  questionnaireButton.innerHTML = '<span class="mobile-app-dock__icon" aria-hidden="true">🧭</span><span>Story Questionnaire</span>';

  dock.append(workspaceButton, questionnaireButton);
  document.body.appendChild(dock);

  mobileAppDock = dock;
  return dock;
}

function initMobileAppExperience(){
  if (mobileAppInitialized) return;
  mobileAppInitialized = true;

  const nav = document.querySelector('.nav');
  const menu = nav?.querySelector('.menu');
  if (nav && menu){
    buildMobileMenu(nav, menu);
  }

  buildMobileAppDock();

  const apply = matches => {
    applyMobileMode(Boolean(matches));
  };

  if (window.matchMedia){
    mobileAppMedia = window.matchMedia(MOBILE_APP_MEDIA_QUERY);
    apply(mobileAppMedia.matches);
    const handler = event => apply(event.matches);
    if (typeof mobileAppMedia.addEventListener === 'function'){
      mobileAppMedia.addEventListener('change', handler);
    } else if (typeof mobileAppMedia.addListener === 'function'){
      mobileAppMedia.addListener(handler);
    }
  } else {
    apply(window.innerWidth <= 768);
    window.addEventListener('resize', () => {
      apply(window.innerWidth <= 768);
    });
  }
}

function applySiteTheme(theme, persist = true){
  const normalized = theme === 'light' ? 'light' : 'dark';
  const prev = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  if (persist) storeTheme(normalized);
  updateToggleLabels(normalized);
  updateThemeSelects(normalized);
  updateBrandLogos(normalized);
  updateThemeColor(normalized);
  if (prev !== normalized){
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: normalized } }));
  }
  return normalized;
}

window.setSiteTheme = function(theme){
  applySiteTheme(theme, true);
};

window.getSiteTheme = function(){
  return document.documentElement.dataset.theme || 'dark';
};

function initTheme(){
  const stored = getStoredTheme();
  const existing = document.documentElement.dataset.theme;
  let initial = stored || existing;
  if (!initial){
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    initial = prefersDark ? 'dark' : 'light';
  }
  applySiteTheme(initial, Boolean(stored));

  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (media && !stored){
    const mediaHandler = e => {
      applySiteTheme(e.matches ? 'dark' : 'light', false);
    };
    if (typeof media.addEventListener === 'function'){
      media.addEventListener('change', mediaHandler);
    } else if (typeof media.addListener === 'function'){
      media.addListener(mediaHandler);
    }
  }

  const attach = () => {
    themeToggles().forEach(btn => {
      if (btn.dataset.themeToggleBound) return;
      btn.dataset.themeToggleBound = 'true';
      btn.addEventListener('click', ()=>{
        const next = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
        applySiteTheme(next, true);
      });
    });
    const current = document.documentElement.dataset.theme || initial;
    updateToggleLabels(current);
    updateThemeSelects(current);
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach, { once:true });
  } else {
    attach();
  }
}

initTheme();

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', e=>{
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); }
  });
});

const SUPABASE_URL = 'https://ycgqgkwwitqunabowswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU';

let supabaseClient = null;
try {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabaseClient = supabaseClient;
} catch (error) {
  console.error('Failed to initialize Supabase client', error);
}

const authLinks = Array.from(document.querySelectorAll('[data-auth-link]'));
const navAuthLink = authLinks.find(link => link.closest('.menu')) || null;
const accountMenu = document.querySelector('[data-account-menu]');
const accountButton = document.querySelector('[data-account-button]');
const accountLogoutLink = document.querySelector('[data-account-logout]');
const navHasAuthControls = Boolean(navAuthLink || accountMenu || accountLogoutLink);

function toggleElementVisibility(element, shouldShow){
  if (!element) return;
  const elements = Array.isArray(element) ? element : [element];
  elements.forEach(item => {
    if (!(item instanceof HTMLElement)) return;
    if (shouldShow){
      item.hidden = false;
      item.removeAttribute('aria-hidden');
      item.style.display = '';
    } else {
      item.hidden = true;
      item.setAttribute('aria-hidden', 'true');
      item.style.display = 'none';
    }
  });
}

function updateAccountUI(session){
  if (!navHasAuthControls) return;
  const isSignedIn = Boolean(session);
  toggleElementVisibility(navAuthLink, !isSignedIn);
  toggleElementVisibility(accountMenu, isSignedIn);
  if (accountButton){
    accountButton.textContent = 'Account';
    const email = session?.user?.email;
    if (email){
      accountButton.setAttribute('data-account-email', email);
    } else {
      accountButton.removeAttribute('data-account-email');
    }
  }
  if (isSignedIn){
    closeAuthPortal();
  }
}

let authPortal = null;
let authPortalDialog = null;
let authPortalMessage = null;
let authPortalActiveView = 'signin';
let authPortalLastFocus = null;

function ensureAuthPortal(){
  if (authPortal && authPortal.isConnected) return authPortal;

  const template = document.createElement('template');
  template.innerHTML = `
    <div class="auth-portal" data-auth-portal hidden aria-hidden="true">
      <div class="auth-portal__backdrop" data-auth-portal-close></div>
      <div class="auth-portal__dialog" data-auth-dialog role="dialog" aria-modal="true" aria-labelledby="auth-portal-title" tabindex="-1">
        <button class="auth-portal__close" type="button" aria-label="Close auth window" data-auth-portal-close>×</button>
        <header class="auth-portal__header">
          <p class="auth-portal__eyebrow">StudioOrganize</p>
          <h2 class="auth-portal__title" id="auth-portal-title">Sign in to your studio</h2>
          <p class="auth-portal__subtitle">Access the workspace, manage your subscription, and pick up where you left off.</p>
          <div class="auth-portal__tabs" role="tablist">
            <button type="button" class="auth-portal__tab" data-auth-tab="signin" role="tab" aria-selected="true">Sign in</button>
            <button type="button" class="auth-portal__tab" data-auth-tab="signup" role="tab" aria-selected="false">Create account</button>
          </div>
        </header>
        <section class="auth-portal__view" id="auth-portal-panel-signin" data-auth-view="signin" role="tabpanel" aria-labelledby="auth-portal-tab-signin">
          <form class="auth-portal__form" data-auth-signin>
            <label class="auth-portal__field">
              <span>Email</span>
              <input type="email" name="email" autocomplete="email" required />
            </label>
            <label class="auth-portal__field">
              <span>Password</span>
              <input type="password" name="password" autocomplete="current-password" required />
            </label>
            <button class="auth-portal__submit" type="submit" data-auth-submit>Sign in</button>
            <p class="auth-portal__hint">Need an account? <button type="button" class="auth-portal__link" data-auth-switch="signup">Create one</button></p>
          </form>
        </section>
        <section class="auth-portal__view" id="auth-portal-panel-signup" data-auth-view="signup" role="tabpanel" aria-labelledby="auth-portal-tab-signup" hidden>
          <form class="auth-portal__form" data-auth-signup>
            <label class="auth-portal__field">
              <span>Name <small>(optional)</small></span>
              <input type="text" name="name" autocomplete="name" />
            </label>
            <label class="auth-portal__field">
              <span>Email</span>
              <input type="email" name="email" autocomplete="email" required />
            </label>
            <label class="auth-portal__field">
              <span>Password</span>
              <input type="password" name="password" autocomplete="new-password" minlength="8" required />
            </label>
            <label class="auth-portal__checkbox">
              <input type="checkbox" name="marketing_opt_out" value="yes" />
              <span>Let me know about new StudioOrganize tools and resources.</span>
            </label>
            <button class="auth-portal__submit" type="submit" data-auth-submit>Create account</button>
            <p class="auth-portal__hint">Already joined? <button type="button" class="auth-portal__link" data-auth-switch="signin">Sign in instead</button></p>
          </form>
        </section>
        <div class="auth-portal__message" data-auth-message hidden role="status" aria-live="polite"></div>
      </div>
    </div>
  `;

  authPortal = template.content.firstElementChild;
  if (!authPortal) return null;
  authPortalDialog = authPortal.querySelector('[data-auth-dialog]');
  authPortalMessage = authPortal.querySelector('[data-auth-message]');

  const closeElements = Array.from(authPortal.querySelectorAll('[data-auth-portal-close]'));
  closeElements.forEach(btn => {
    btn.addEventListener('click', () => closeAuthPortal());
  });

  authPortal.addEventListener('click', event => {
    if (event.target === authPortal){
      closeAuthPortal();
    }
  });

  const tabs = Array.from(authPortal.querySelectorAll('[data-auth-tab]'));
  tabs.forEach(tab => {
    const view = tab.dataset.authTab || 'signin';
    tab.id = tab.id || `auth-portal-tab-${view}`;
    const panel = authPortal.querySelector(`[data-auth-view="${view}"]`);
    if (panel && !panel.id){
      panel.id = `auth-portal-panel-${view}`;
    }
    if (panel?.id){
      tab.setAttribute('aria-controls', panel.id);
    }
    tab.addEventListener('click', () => {
      setAuthPortalView(view);
    });
  });

  const switchers = Array.from(authPortal.querySelectorAll('[data-auth-switch]'));
  switchers.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.authSwitch || 'signin';
      setAuthPortalView(target);
    });
  });

  const signInForm = authPortal.querySelector('[data-auth-signin]');
  if (signInForm){
    signInForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!supabaseClient){
        setAuthPortalMessage('Authentication is temporarily unavailable. Please try again later.', 'error');
        return;
      }
      const form = event.currentTarget;
      const data = new FormData(form);
      const email = (data.get('email') || '').toString().trim();
      const password = (data.get('password') || '').toString();
      if (!email || !password){
        setAuthPortalMessage('Enter your email and password to continue.', 'error');
        return;
      }
      setAuthPortalLoading(form, true, 'Signing in…');
      try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error){
          setAuthPortalMessage(error.message || 'Sign-in failed. Please check your details and try again.', 'error');
          return;
        }
        setAuthPortalMessage('Signed in! Loading your studio…', 'success');
      } catch (error){
        console.error('Unexpected sign-in error', error);
        setAuthPortalMessage('We ran into a problem signing you in. Please try again.', 'error');
      } finally {
        setAuthPortalLoading(form, false);
      }
    });
  }

  const signUpForm = authPortal.querySelector('[data-auth-signup]');
  if (signUpForm){
    signUpForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!supabaseClient){
        setAuthPortalMessage('Authentication is temporarily unavailable. Please try again later.', 'error');
        return;
      }
      const form = event.currentTarget;
      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const password = (data.get('password') || '').toString();
      if (!email || !password){
        setAuthPortalMessage('Add your email and a password with at least 8 characters.', 'error');
        return;
      }
      setAuthPortalLoading(form, true, 'Creating account…');
      try {
        const { data: result, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: name ? { full_name: name } : {}
          }
        });
        if (error){
          setAuthPortalMessage(error.message || 'Sign-up failed. Please try again.', 'error');
          return;
        }
        form.reset();
        setAuthPortalView('signin');
        const needsConfirmation = !result.session;
        const successMessage = needsConfirmation ?
          'Check your inbox to confirm your email. Once verified you can sign in here.' :
          'Account created! You can sign in now.';
        setAuthPortalMessage(successMessage, 'success');
      } catch (error){
        console.error('Unexpected sign-up error', error);
        setAuthPortalMessage('We ran into a problem creating your account. Please try again.', 'error');
      } finally {
        setAuthPortalLoading(form, false);
      }
    });
  }

  document.body.appendChild(authPortal);
  setAuthPortalView('signin');
  return authPortal;
}

function setAuthPortalView(view){
  authPortalActiveView = view === 'signup' ? 'signup' : 'signin';
  if (!authPortal) return;
  const tabs = Array.from(authPortal.querySelectorAll('[data-auth-tab]'));
  const panels = Array.from(authPortal.querySelectorAll('[data-auth-view]'));
  tabs.forEach(tab => {
    const isActive = (tab.dataset.authTab || 'signin') === authPortalActiveView;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  panels.forEach(panel => {
    const isActive = (panel.dataset.authView || 'signin') === authPortalActiveView;
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
  if (authPortalMessage){
    setAuthPortalMessage('');
  }
  const activeForm = authPortal?.querySelector(`[data-auth-view="${authPortalActiveView}"] form`);
  const focusTarget = activeForm?.querySelector('input');
  if (!authPortal?.hidden && focusTarget instanceof HTMLElement){
    focusTarget.focus();
  }
}

function setAuthPortalMessage(message, tone = 'info'){
  if (!authPortalMessage) return;
  const trimmed = (message || '').toString().trim();
  if (!trimmed){
    authPortalMessage.hidden = true;
    authPortalMessage.textContent = '';
    authPortalMessage.removeAttribute('data-auth-message-tone');
    return;
  }
  authPortalMessage.hidden = false;
  authPortalMessage.textContent = trimmed;
  authPortalMessage.setAttribute('data-auth-message-tone', tone);
}

function setAuthPortalLoading(form, loading, label){
  if (!(form instanceof HTMLFormElement)) return;
  const submit = form.querySelector('[data-auth-submit]');
  if (submit instanceof HTMLButtonElement){
    if (!submit.dataset.originalLabel){
      submit.dataset.originalLabel = submit.textContent || '';
    }
    submit.disabled = Boolean(loading);
    submit.textContent = loading ? (label || 'Please wait…') : submit.dataset.originalLabel;
  }
  form.classList.toggle('is-loading', Boolean(loading));
}

function openAuthPortal(initialView = 'signin'){
  if (!ensureAuthPortal()) return;
  if (authPortal && !authPortal.hidden){
    setAuthPortalView(initialView);
    return;
  }
  authPortalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setAuthPortalView(initialView);
  authPortal.hidden = false;
  authPortal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (authPortalDialog instanceof HTMLElement){
    authPortalDialog.focus();
  }
  document.addEventListener('keydown', handleAuthPortalEscape);
}

function closeAuthPortal(){
  if (!authPortal || authPortal.hidden) return;
  authPortal.hidden = true;
  authPortal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleAuthPortalEscape);
  if (authPortalLastFocus){
    authPortalLastFocus.focus();
    authPortalLastFocus = null;
  }
}

function handleAuthPortalEscape(event){
  if (event.key === 'Escape' && authPortal && !authPortal.hidden){
    closeAuthPortal();
  }
}

function bindAuthLinks(){
  if (!authLinks.length) return;
  authLinks.forEach(link => {
    if (!(link instanceof HTMLElement)) return;
    if (link.dataset.authLinkBound === 'true') return;
    link.dataset.authLinkBound = 'true';
    link.addEventListener('click', event => {
      if (!supabaseClient){
        return; // fall back to default navigation when auth is unavailable
      }
      event.preventDefault();
      const normalizedText = (link.textContent || '').toLowerCase();
      const defaultIntent = normalizedText.includes('sign up') || normalizedText.includes('create') ? 'signup' : 'signin';
      const intent = link.dataset.authIntent || link.getAttribute('data-auth-switch') || defaultIntent;
      const initialView = intent === 'signup' ? 'signup' : 'signin';
      openAuthPortal(initialView);
    });
  });
}

async function refreshAccountSession(){
  if (!supabaseClient || !navHasAuthControls) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error){
      console.error('Failed to fetch Supabase session', error);
      return;
    }
    updateAccountUI(data.session ?? null);
  } catch (error){
    console.error('Unexpected error while checking Supabase session', error);
  }
}

if (accountLogoutLink && !accountLogoutLink.dataset.logoutBound && supabaseClient){
  accountLogoutLink.dataset.logoutBound = 'true';
  accountLogoutLink.addEventListener('click', async event => {
    event.preventDefault();
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error){
        console.error('Supabase sign-out failed', error);
      }
    } catch (error){
      console.error('Unexpected error during Supabase sign-out', error);
    }
  });
}

if (supabaseClient && navHasAuthControls){
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAccountUI(session ?? null);
  });
  refreshAccountSession();
}

bindAuthLinks();

const STORY_SCOPE_PROJECT = 'project';
const STORY_SCOPE_TEMPLATE = 'new_story_template';
const AI_PREFERENCE_LOCAL_KEY = 'SO_AI_PREFERENCES';
const AI_FEATURE_KEYS = ['progress_nudges', 'structure_spotlight', 'tone_cheerleader'];
const LAST_PROJECT_STORAGE_KEY = 'SW_LAST_PROJECT_ID';

const AI_DEFAULT_PREFERENCE = Object.freeze({
  mode: 'continue',
  storyLength: 'medium',
  featureFlags: {
    progress_nudges: true,
    structure_spotlight: true,
    tone_cheerleader: false
  },
  biasNote: ''
});

function getLastTrackedProjectId(){
  try {
    const value = localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
    return value || null;
  } catch (_error){
    return null;
  }
}

function loadLocalAiPreferenceMap(){
  try {
    const raw = localStorage.getItem(AI_PREFERENCE_LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_error){
    return {};
  }
}

function persistLocalAiPreferenceMap(map){
  try {
    localStorage.setItem(AI_PREFERENCE_LOCAL_KEY, JSON.stringify(map));
  } catch (_error){
    /* ignore storage quota errors */
  }
}

function localPreferenceKey(projectId, scope){
  const normalizedScope = scope === STORY_SCOPE_TEMPLATE ? STORY_SCOPE_TEMPLATE : STORY_SCOPE_PROJECT;
  if (normalizedScope === STORY_SCOPE_PROJECT){
    if (!projectId) return null;
    return `${normalizedScope}:${projectId}`;
  }
  return `${normalizedScope}:global`;
}

function normalizeAiFeatureFlags(input){
  const source = (input && typeof input === 'object') ? input : {};
  const normalized = {};
  AI_FEATURE_KEYS.forEach(key => {
    normalized[key] = Boolean(source[key]);
  });
  return normalized;
}

function normalizeAiPreference(preference){
  const source = (preference && typeof preference === 'object') ? preference : {};
  const mode = source.mode === 'new' ? 'new' : 'continue';
  const lengthCandidates = ['short', 'medium', 'long'];
  const requestedLength = typeof source.storyLength === 'string' ? source.storyLength.toLowerCase() : null;
  const storyLength = mode === 'new'
    ? (lengthCandidates.includes(requestedLength) ? requestedLength : 'medium')
    : null;
  const biasNote = typeof source.biasNote === 'string'
    ? source.biasNote.trim()
    : (typeof source.bias === 'string' ? source.bias.trim() : '');
  const normalized = {
    mode,
    storyLength: storyLength || (mode === 'new' ? 'medium' : null),
    featureFlags: normalizeAiFeatureFlags(source.featureFlags || source.features || source),
    biasNote
  };
  return normalized;
}

function readLocalPreference(projectId, scope){
  const key = localPreferenceKey(projectId, scope);
  if (!key) return null;
  const map = loadLocalAiPreferenceMap();
  const stored = map[key];
  return stored ? normalizeAiPreference(stored) : null;
}

function writeLocalPreference(projectId, scope, preference){
  const key = localPreferenceKey(projectId, scope);
  if (!key) return;
  const map = loadLocalAiPreferenceMap();
  map[key] = normalizeAiPreference(preference);
  persistLocalAiPreferenceMap(map);
}

async function fetchSupabaseUser(){
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error){
      console.error('Failed to fetch Supabase session for AI preferences', error);
      return null;
    }
    return data?.session?.user ?? null;
  } catch (error){
    console.error('Unexpected Supabase session error for AI preferences', error);
    return null;
  }
}

function mapPreferenceRow(row){
  if (!row) return null;
  return normalizeAiPreference({
    mode: row.mode,
    storyLength: row.story_length,
    featureFlags: row.feature_flags,
    biasNote: row.bias_note
  });
}

async function fetchSupabasePreference(projectId, scope){
  if (!supabaseClient) return null;
  const user = await fetchSupabaseUser();
  if (!user) return null;
  try {
    let query = supabaseClient
      .from('story_ai_preferences')
      .select('mode, story_length, feature_flags, bias_note, project_id, scope, updated_at')
      .eq('scope', scope)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (scope === STORY_SCOPE_PROJECT){
      query = query.eq('project_id', projectId);
    } else {
      query = query.is('project_id', null);
    }
    const { data, error } = await query.maybeSingle();
    if (error){
      if (error.code !== 'PGRST116'){
        console.error('Failed to load AI preference from Supabase', error);
      }
      return null;
    }
    if (!data) return null;
    const normalized = mapPreferenceRow(data);
    if (normalized){
      writeLocalPreference(projectId ?? null, scope, normalized);
    }
    return normalized;
  } catch (error){
    console.error('Unexpected error loading AI preference from Supabase', error);
    return null;
  }
}

async function upsertSupabasePreference(projectId, scope, preference){
  if (!supabaseClient) return { success: false, reason: 'no_client', preference: normalizeAiPreference(preference) };
  const user = await fetchSupabaseUser();
  if (!user) return { success: false, reason: 'not_signed_in', preference: normalizeAiPreference(preference) };
  try {
    const payload = {
      owner_id: user.id,
      project_id: scope === STORY_SCOPE_PROJECT ? projectId : null,
      scope,
      mode: preference.mode,
      story_length: preference.mode === 'new' ? preference.storyLength : null,
      feature_flags: preference.featureFlags,
      bias_note: preference.biasNote || null
    };
    const { data, error } = await supabaseClient
      .from('story_ai_preferences')
      .upsert(payload, { onConflict: 'owner_id,project_id,scope' })
      .select()
      .maybeSingle();
    if (error){
      console.error('Failed to save AI preference to Supabase', error);
      return { success: false, reason: 'request_failed', preference: normalizeAiPreference(preference) };
    }
    const normalized = mapPreferenceRow(data) || normalizeAiPreference(preference);
    writeLocalPreference(projectId ?? null, scope, normalized);
    return { success: true, source: 'supabase', preference: normalized };
  } catch (error){
    console.error('Unexpected error saving AI preference to Supabase', error);
    return { success: false, reason: 'unexpected', preference: normalizeAiPreference(preference) };
  }
}

function getDefaultAiPreference(){
  return normalizeAiPreference(AI_DEFAULT_PREFERENCE);
}

async function loadAiPreference(projectId, { scope = STORY_SCOPE_PROJECT } = {}){
  const normalizedScope = scope === STORY_SCOPE_TEMPLATE ? STORY_SCOPE_TEMPLATE : STORY_SCOPE_PROJECT;
  if (normalizedScope === STORY_SCOPE_PROJECT && !projectId){
    return {
      success: false,
      preference: getDefaultAiPreference(),
      reason: 'missing_project',
      source: 'default'
    };
  }

  const local = readLocalPreference(projectId ?? null, normalizedScope);
  try {
    const remote = await fetchSupabasePreference(projectId ?? null, normalizedScope);
    if (remote){
      return { success: true, preference: remote, source: 'supabase' };
    }
  } catch (error){
    console.error('AI preference Supabase fetch error', error);
  }

  if (local){
    return { success: true, preference: local, source: 'local' };
  }

  return {
    success: false,
    preference: getDefaultAiPreference(),
    reason: 'not_found',
    source: 'default'
  };
}

async function saveAiPreference(projectId, preference, { scope = STORY_SCOPE_PROJECT } = {}){
  const normalizedScope = scope === STORY_SCOPE_TEMPLATE ? STORY_SCOPE_TEMPLATE : STORY_SCOPE_PROJECT;
  if (normalizedScope === STORY_SCOPE_PROJECT && !projectId){
    const normalizedPreference = normalizeAiPreference(preference);
    return {
      success: false,
      preference: normalizedPreference,
      reason: 'missing_project',
      source: 'error'
    };
  }

  const normalizedPreference = normalizeAiPreference(preference);
  const result = await upsertSupabasePreference(projectId ?? null, normalizedScope, normalizedPreference);
  if (result.success){
    return result;
  }

  writeLocalPreference(projectId ?? null, normalizedScope, normalizedPreference);
  return {
    success: true,
    preference: normalizedPreference,
    source: 'local',
    reason: result.reason ?? 'stored_locally'
  };
}

const existingHelpers = window.StudioOrganizeAI || {};
const aiHelperApi = {
  getDefaultPreference: getDefaultAiPreference,
  normalizePreference: normalizeAiPreference,
  loadPreference: loadAiPreference,
  savePreference: saveAiPreference,
  getLastTrackedProjectId,
  STORY_SCOPE_PROJECT,
  STORY_SCOPE_TEMPLATE
};

window.StudioOrganizeAI = Object.assign(existingHelpers, aiHelperApi);
window.dispatchEvent(new CustomEvent('studioorganize-ai-ready', { detail: { ready: true } }));

function initDropdownMenus(){
  const dropdowns = Array.from(document.querySelectorAll('.dropdown'));
  if (!dropdowns.length) return;

  const getParts = dropdown => {
    const trigger = dropdown.querySelector('button');
    const panel = dropdown.querySelector('.dropdown-content');
    if (!trigger || !panel) return null;
    return { trigger, panel };
  };

  const closeDropdown = dropdown => {
    const parts = getParts(dropdown);
    if (!parts) return;
    dropdown.classList.remove('is-open');
    parts.trigger.setAttribute('aria-expanded', 'false');
    parts.panel.setAttribute('aria-hidden', 'true');
  };

  const openDropdown = dropdown => {
    const parts = getParts(dropdown);
    if (!parts) return;
    dropdown.classList.add('is-open');
    parts.trigger.setAttribute('aria-expanded', 'true');
    parts.panel.setAttribute('aria-hidden', 'false');
  };

  const closeAll = except => {
    dropdowns.forEach(dropdown => {
      if (dropdown === except) return;
      closeDropdown(dropdown);
    });
  };

  const getAccountDestination = dropdown => {
    const firstLink = dropdown?.querySelector('.dropdown-content a');
    if (firstLink instanceof HTMLAnchorElement){
      const href = firstLink.getAttribute('href');
      if (href && href.trim()){
        return href;
      }
    }
    return '/account.html';
  };

  dropdowns.forEach(dropdown => {
    const parts = getParts(dropdown);
    if (!parts) return;
    const { trigger, panel } = parts;
    const isAccountMenu = dropdown.hasAttribute('data-account-menu');

    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');

    trigger.addEventListener('click', event => {
      if (isAccountMenu && document.documentElement.classList.contains('is-mobile-app')){
        event.preventDefault();
        event.stopPropagation();
        const destination = getAccountDestination(dropdown);
        closeAll();
        closeMobileMenu();
        if (destination){
          window.location.assign(destination);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const isOpen = dropdown.classList.contains('is-open');
      if (isOpen){
        closeDropdown(dropdown);
      } else {
        closeAll(dropdown);
        openDropdown(dropdown);
      }
    });

    panel.addEventListener('click', event => {
      const link = event.target instanceof HTMLElement ? event.target.closest('a') : null;
      if (link){
        closeAll();
        return;
      }
      event.stopPropagation();
    });
  });

  document.addEventListener('click', event => {
    if (dropdowns.some(dropdown => dropdown.contains(event.target))){
      return;
    }
    closeAll();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape'){
      closeAll();
    }
  });
}

function initNotificationCenter(){
  const container = document.querySelector('[data-notifications]');
  const modal = document.querySelector('[data-notifications-modal]');
  if (!container || !(modal instanceof HTMLElement)) return;

  const toggle = container.querySelector('[data-notifications-toggle]');
  if (!(toggle instanceof HTMLElement)) return;
  if (toggle.dataset.notificationsBound === 'true') return;
  toggle.dataset.notificationsBound = 'true';

  const countElement = toggle.querySelector('[data-notifications-count]');
  const labelElement = toggle.querySelector('[data-notifications-label]');
  const closeButton = modal.querySelector('[data-notifications-close]');
  const overlay = modal.querySelector('[data-notifications-overlay]');
  const dialogSurface = modal.querySelector('.notifications-modal__dialog');
  const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const notifications = Array.from(modal.querySelectorAll('[data-notification-item]'));
  const notificationCount = notifications.length;

  if (countElement instanceof HTMLElement){
    if (notificationCount > 0){
      countElement.textContent = `${notificationCount}`;
      countElement.classList.remove('is-empty');
      countElement.setAttribute('aria-hidden', 'true');
    } else {
      countElement.textContent = '';
      countElement.classList.add('is-empty');
      countElement.removeAttribute('aria-hidden');
    }
  }

  if (labelElement instanceof HTMLElement){
    const labelText = notificationCount > 0
      ? `Open notifications (${notificationCount} new)`
      : 'Open notifications';
    labelElement.textContent = labelText;
    toggle.setAttribute('aria-label', labelText);
    toggle.setAttribute('title', labelText);
  }

  let lastFocusedElement = null;

  const focusElement = element => {
    if (!(element instanceof HTMLElement)) return;
    try {
      element.focus({ preventScroll: true });
    } catch (_error){
      element.focus();
    }
  };

  const getFocusableElements = () => {
    return Array.from(modal.querySelectorAll(focusableSelectors)).filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  };

  const handleKeydown = event => {
    if (event.key === 'Escape'){
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey){
      if (document.activeElement === first || !modal.contains(document.activeElement)){
        event.preventDefault();
        focusElement(last);
      }
    } else {
      if (document.activeElement === last){
        event.preventDefault();
        focusElement(first);
      }
    }
  };

  const openModal = () => {
    if (!modal.hidden) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('has-modal-open');

    window.requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length){
        focusElement(focusable[0]);
      } else if (closeButton instanceof HTMLElement){
        focusElement(closeButton);
      }
    });

    document.addEventListener('keydown', handleKeydown);
  };

  const closeModal = ({ returnFocus = true } = {}) => {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-modal-open');
    document.removeEventListener('keydown', handleKeydown);

    if (returnFocus && lastFocusedElement instanceof HTMLElement){
      focusElement(lastFocusedElement);
    }

    lastFocusedElement = null;
  };

  toggle.addEventListener('click', event => {
    event.preventDefault();
    if (modal.hidden){
      openModal();
    } else {
      closeModal();
    }
  });

  if (closeButton instanceof HTMLElement){
    closeButton.addEventListener('click', event => {
      event.preventDefault();
      closeModal();
    });
  }

  if (overlay instanceof HTMLElement){
    overlay.addEventListener('click', () => {
      closeModal();
    });
  }

  if (dialogSurface instanceof HTMLElement){
    dialogSurface.addEventListener('click', event => {
      event.stopPropagation();
    });
  }

  modal.addEventListener('click', event => {
    if (event.target === modal){
      closeModal();
    }
  });
}

const WORKSPACE_LAUNCHER_MODULES = [
  { href: '/use-cases/screenplay-writing.html', label: 'Screenplay Writing', image: '/assets/img/screenplay_writer1.webp' },
  { href: '/CharacterStudio.html', label: 'Character Studio', image: '/assets/img/studioorganize_mock.png' },
  { href: '/StoryboardPro.html', label: 'Storyboard Pro', image: '/assets/img/studioorganize_mock.png' },
  { href: '/use-cases/generate-ideas.html', label: 'Idea Generator', image: '/assets/img/studioorganize_mock.png' },
  { href: '/use-cases/set-design.html', label: 'Set Design', image: '/assets/img/studioorganize_mock.png' },
  { href: '/creative-hub.html', label: 'Creative Hub', image: '/assets/img/studioorganize_mock.png' },
];

function renderWorkspaceModuleLink({ href, label, image }){
  const safeLabel = typeof label === 'string' ? label : '';
  const safeAttr = safeLabel.replace(/"/g, '&quot;');
  const safeHref = typeof href === 'string' ? href : '#';
  const safeImage = typeof image === 'string' ? image : '/assets/img/studioorganize_mock.png';
  return `
    <a class="workspace-launcher__module" href="${safeHref}" data-label="${safeAttr}">
      <span class="workspace-launcher__module-icon" aria-hidden="true">
        <img src="${safeImage}" alt="" loading="lazy" />
      </span>
      <span class="sr-only">${safeLabel}</span>
    </a>
  `;
}

function ensureWorkspaceLauncherStructure(launcher){
  if (!(launcher instanceof HTMLElement)) return;
  if (launcher.dataset.workspaceLauncherPrepared === 'true') return;

  const panel = launcher.querySelector('[data-workspace-panel]');
  if (!(panel instanceof HTMLElement)) return;

  let moduleStack = panel.querySelector('.workspace-launcher__module-stack');
  if (!(moduleStack instanceof HTMLElement)){
    moduleStack = document.createElement('div');
    moduleStack.className = 'workspace-launcher__module-stack';
    panel.appendChild(moduleStack);
  }

  let actions = panel.querySelector('.workspace-launcher__actions');
  if (!(actions instanceof HTMLElement)){
    actions = document.createElement('div');
    actions.className = 'workspace-launcher__actions';
    actions.innerHTML = `
      <button type="button" class="workspace-launcher__script" data-workspace-script>
        <span class="workspace-launcher__script-icon" aria-hidden="true">＋</span>
        <span>STORY</span>
      </button>
    `;
  }
  if (actions.parentElement !== moduleStack){
    moduleStack.insertBefore(actions, moduleStack.firstChild);
  }

  let modules = panel.querySelector('.workspace-launcher__modules');
  if (!(modules instanceof HTMLElement)){
    modules = document.createElement('nav');
    modules.className = 'workspace-launcher__modules';
    modules.setAttribute('aria-label', 'Workspace modules');
    moduleStack.appendChild(modules);
  } else if (modules.parentElement !== moduleStack){
    moduleStack.appendChild(modules);
  }

  if (!modules.children.length){
    modules.innerHTML = WORKSPACE_LAUNCHER_MODULES.map(renderWorkspaceModuleLink).join('');
  }

  let assistant = panel.querySelector('.workspace-launcher__assistant');
  if (!(assistant instanceof HTMLElement)){
    assistant = document.createElement('div');
    assistant.className = 'workspace-launcher__assistant';
    panel.insertBefore(assistant, moduleStack);
  } else if (assistant.parentElement !== panel){
    panel.insertBefore(assistant, moduleStack);
  }

  if (!assistant.querySelector('.workspace-launcher__assistant-header')){
    assistant.insertAdjacentHTML('afterbegin', `
      <div class="workspace-launcher__assistant-header">
        <span class="workspace-launcher__assistant-avatar" aria-hidden="true">🤖</span>
        <div>
          <p class="workspace-launcher__assistant-title">StudioOrganize Assistant</p>
          <p class="workspace-launcher__assistant-subtitle">Tell me if we're continuing a story or starting fresh and I'll tailor the prompts.</p>
        </div>
      </div>
    `);
  }

  const chat = launcher.querySelector('[data-workspace-chat]');
  let assistantActions = assistant.querySelector('.workspace-launcher__assistant-actions');
  if (!(assistantActions instanceof HTMLElement)){
    assistantActions = document.createElement('div');
    assistantActions.className = 'workspace-launcher__assistant-actions';
    assistantActions.innerHTML = `
      <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="continue">
        <span>📚 Check in on my current story</span>
      </button>
      <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="new">
        <span>✨ Start something new</span>
      </button>
      <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="settings">
        <span>⚙️ Adjust how you coach me</span>
      </button>
    `;
    if (chat instanceof HTMLElement && chat.parentElement === assistant){
      assistant.insertBefore(assistantActions, chat);
    } else {
      assistant.appendChild(assistantActions);
    }
  }

  if (chat instanceof HTMLElement){
    chat.classList.add('workspace-launcher__chat--docked');
    if (!assistant.contains(chat)){
      assistant.appendChild(chat);
    } else if (assistantActions instanceof HTMLElement){
      assistant.appendChild(chat);
    }
    if (!chat.hasAttribute('hidden')){
      chat.hidden = true;
      chat.setAttribute('aria-hidden', 'true');
    }
  }

  launcher.dataset.workspaceLauncherPrepared = 'true';
}

function injectGlobalWorkspaceLauncher(){
  if (document.querySelector('[data-workspace-launcher]')) return;
  if (!(document.body instanceof HTMLElement)) return;

  const modulesMarkup = WORKSPACE_LAUNCHER_MODULES.map(renderWorkspaceModuleLink).join('');
  const template = document.createElement('div');
  template.innerHTML = `
    <div class="workspace-launcher" data-workspace-launcher data-global-workspace-launcher>
      <div class="workspace-launcher__controls">
        <div class="workspace-launcher__toggle-wrap">
          <button class="workspace-launcher__toggle" type="button" aria-expanded="false" aria-label="Workspace menu" data-workspace-toggle>
            <span class="sr-only">Workspace menu</span>
            <span class="workspace-launcher__icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="workspace-launcher__panel" data-workspace-panel aria-hidden="true" hidden tabindex="-1">
        <div class="workspace-launcher__assistant">
          <div class="workspace-launcher__assistant-header">
            <span class="workspace-launcher__assistant-avatar" aria-hidden="true">🤖</span>
            <div>
              <p class="workspace-launcher__assistant-title">StudioOrganize Assistant</p>
              <p class="workspace-launcher__assistant-subtitle">Tell me if we're continuing a story or starting fresh and I'll tailor the prompts.</p>
            </div>
          </div>
          <div class="workspace-launcher__assistant-actions">
            <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="continue">
              <span>📚 Check in on my current story</span>
            </button>
            <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="new">
              <span>✨ Start something new</span>
            </button>
            <button type="button" class="workspace-launcher__assistant-action" data-workspace-chat-suggestion data-workspace-chat-action="settings">
              <span>⚙️ Adjust how you coach me</span>
            </button>
          </div>
          <div class="workspace-launcher__chat workspace-launcher__chat--docked" data-workspace-chat hidden aria-hidden="true">
            <div class="workspace-launcher__chat-bubble">
              <div class="workspace-launcher__chat-thread" data-workspace-chat-thread>
                <div class="workspace-launcher__chat-message workspace-launcher__chat-message--assistant">Hi there! Ready to build something great today?</div>
              </div>
              <div class="workspace-launcher__chat-suggestions">
                <button type="button" class="workspace-launcher__chat-chip" data-workspace-chat-suggestion data-workspace-chat-action="continue">Check my progress</button>
                <button type="button" class="workspace-launcher__chat-chip" data-workspace-chat-suggestion data-workspace-chat-action="new">Spin up something new</button>
                <button type="button" class="workspace-launcher__chat-chip" data-workspace-chat-suggestion data-workspace-chat-action="settings">How should you behave?</button>
              </div>
              <form class="workspace-launcher__chat-form" data-workspace-chat-form>
                <div class="workspace-launcher__chat-input">
                  <input type="text" placeholder="Ask StudioOrganize…" aria-label="Ask the workspace assistant" data-workspace-chat-input />
                  <button type="submit" class="workspace-launcher__chat-send" aria-label="Send chat message">
                    <span aria-hidden="true">➤</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <div class="workspace-launcher__module-stack">
          <div class="workspace-launcher__actions">
            <button type="button" class="workspace-launcher__script" data-workspace-script>
              <span class="workspace-launcher__script-icon" aria-hidden="true">＋</span>
              <span>STORY</span>
            </button>
          </div>
          <nav class="workspace-launcher__modules" aria-label="Workspace modules">
            ${modulesMarkup}
          </nav>
        </div>
      </div>
    </div>
  `;

  const launcher = template.firstElementChild;
  if (launcher instanceof HTMLElement){
    document.body.appendChild(launcher);
  }
}

function initWorkspaceLauncher(){
  injectGlobalWorkspaceLauncher();
  const launchers = Array.from(document.querySelectorAll('[data-workspace-launcher]'));
  if (!launchers.length) return;

  const OPEN_CLASS = 'workspace-launcher--open';
  const CHAT_VISIBLE_CLASS = 'workspace-launcher__chat--visible';
  const CLOSE_TIMEOUT = 280;
  const CHAT_TIMEOUT = 260;

  const getChatBubble = launcher => {
    return launcher.querySelector('[data-workspace-chat]');
  };

  const getChatInput = launcher => {
    return launcher.querySelector('[data-workspace-chat-input]');
  };

  const showChatBubble = (launcher, { focusInput = true } = {}) => {
    const chat = getChatBubble(launcher);
    if (!(chat instanceof HTMLElement)) return;
    if (!chat.hidden && chat.classList.contains(CHAT_VISIBLE_CLASS)){
      if (focusInput){
        const input = getChatInput(launcher);
        if (input instanceof HTMLElement){
          window.requestAnimationFrame(() => {
            if (typeof input.focus === 'function'){
              input.focus({ preventScroll: true });
            }
          });
        }
      }
      return;
    }

    chat.hidden = false;
    chat.setAttribute('aria-hidden', 'false');
    void chat.offsetWidth;
    chat.classList.add(CHAT_VISIBLE_CLASS);

    if (focusInput){
      const input = getChatInput(launcher);
      if (input instanceof HTMLElement){
        window.requestAnimationFrame(() => {
          if (typeof input.focus === 'function'){
            try {
              input.focus({ preventScroll: true });
            } catch (_error){
              input.focus();
            }
          }
        });
      }
    }
  };

  const hideChatBubble = launcher => {
    const chat = getChatBubble(launcher);
    if (!(chat instanceof HTMLElement)) return;
    if (chat.hidden) return;

    const handleTransitionEnd = event => {
      if (event.target !== chat) return;
      chat.removeEventListener('transitionend', handleTransitionEnd);
      chat.hidden = true;
    };

    chat.addEventListener('transitionend', handleTransitionEnd);
    window.setTimeout(() => {
      chat.removeEventListener('transitionend', handleTransitionEnd);
      if (!chat.hidden){
        chat.hidden = true;
      }
    }, CHAT_TIMEOUT);

    chat.classList.remove(CHAT_VISIBLE_CLASS);
    chat.setAttribute('aria-hidden', 'true');
  };

  const closeLauncher = (launcher, { focusToggle = false } = {}) => {
    if (!(launcher instanceof HTMLElement)) return;
    const toggle = launcher.querySelector('[data-workspace-toggle]');
    const panel = launcher.querySelector('[data-workspace-panel]');
    if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    if (!launcher.classList.contains(OPEN_CLASS) && panel.hidden) return;

    launcher.classList.remove(OPEN_CLASS);
    panel.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    hideChatBubble(launcher);

    if (!panel.hidden){
      panel.dataset.workspaceClosing = 'true';
      const handleTransitionEnd = event => {
        if (event.target !== panel) return;
        if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') return;
        panel.hidden = true;
        delete panel.dataset.workspaceClosing;
      };
      panel.addEventListener('transitionend', handleTransitionEnd, { once: true });
      window.setTimeout(() => {
        panel.removeEventListener('transitionend', handleTransitionEnd);
        if (panel.dataset.workspaceClosing === 'true'){
          panel.hidden = true;
          delete panel.dataset.workspaceClosing;
        }
      }, CLOSE_TIMEOUT);
    }

    if (focusToggle && toggle instanceof HTMLElement){
      try {
        toggle.focus({ preventScroll: true });
      } catch (_error){
        toggle.focus();
      }
    }
  };

  const openLauncher = (launcher, { focusPanel = true, revealChat = false } = {}) => {
    if (!(launcher instanceof HTMLElement)) return;
    const toggle = launcher.querySelector('[data-workspace-toggle]');
    const panel = launcher.querySelector('[data-workspace-panel]');
    if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    if (panel.hidden){
      panel.hidden = false;
      void panel.offsetWidth;
    }

    delete panel.dataset.workspaceClosing;

    launcher.classList.add(OPEN_CLASS);
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');

    if (revealChat){
      showChatBubble(launcher);
    } else {
      hideChatBubble(launcher);
    }

    if (focusPanel){
      window.requestAnimationFrame(() => {
        try {
          panel.focus({ preventScroll: true });
        } catch (_error){
          panel.focus();
        }
      });
    }
  };

  const closeAll = except => {
    launchers.forEach(launcher => {
      if (launcher === except) return;
      closeLauncher(launcher);
    });
  };

  launchers.forEach((launcher, index) => {
    if (!(launcher instanceof HTMLElement)) return;
    ensureWorkspaceLauncherStructure(launcher);
    if (launcher.dataset.workspaceLauncherBound === 'true') return;
    launcher.dataset.workspaceLauncherBound = 'true';

    const toggle = launcher.querySelector('[data-workspace-toggle]');
    const panel = launcher.querySelector('[data-workspace-panel]');

    if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    if (!panel.id){
      panel.id = `workspaceLauncherPanel${index + 1}`;
    }

    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');

    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (launcher.classList.contains(OPEN_CLASS)){
        closeLauncher(launcher);
      } else {
        closeAll(launcher);
        const shouldFocusPanel = typeof event.detail === 'number' ? event.detail === 0 : true;
        openLauncher(launcher, { focusPanel: shouldFocusPanel, revealChat: true });
      }
    });

    let hoverTimeoutId;

    const clearHoverTimeout = () => {
      if (hoverTimeoutId){
        window.clearTimeout(hoverTimeoutId);
        hoverTimeoutId = undefined;
      }
    };

    const handlePointerEnter = () => {
      clearHoverTimeout();
      if (!launcher.classList.contains(OPEN_CLASS)){
        closeAll(launcher);
        openLauncher(launcher, { focusPanel: false, revealChat: false });
      }
    };

    const handlePointerLeave = () => {
      clearHoverTimeout();
      hoverTimeoutId = window.setTimeout(() => {
        if (!launcher.matches(':hover') && !launcher.matches(':focus-within')){
          closeLauncher(launcher);
        }
      }, CLOSE_TIMEOUT);
    };

    launcher.addEventListener('pointerenter', handlePointerEnter);
    launcher.addEventListener('pointerleave', handlePointerLeave);

    if (panel instanceof HTMLElement){
      panel.addEventListener('pointerenter', handlePointerEnter);
      panel.addEventListener('pointerleave', handlePointerLeave);
    }

    panel.addEventListener('mousedown', event => {
      event.stopPropagation();
    });

    panel.addEventListener('click', event => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('[data-workspace-script]')) return;
      event.stopPropagation();
    });

    const scriptButton = panel.querySelector('[data-workspace-script]');
    if (scriptButton instanceof HTMLElement && scriptButton.dataset.workspaceScriptBound !== 'true'){
      scriptButton.dataset.workspaceScriptBound = 'true';
      scriptButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        closeAll();

        const dialog = document.getElementById('scriptDialog');
        const isOpen = dialog instanceof HTMLElement && dialog.classList.contains('open');

        if (typeof window.openScriptDialog === 'function'){
          if (isOpen && typeof window.closeScriptDialog === 'function'){
            window.closeScriptDialog();
          } else {
            window.openScriptDialog();
          }
        } else {
          window.location.href = '/use-cases/screenplay-writing.html';
        }
      });
    }

    const chat = launcher.querySelector('[data-workspace-chat]');
    const chatThread = chat?.querySelector('[data-workspace-chat-thread]') ?? null;
    const chatInput = chat?.querySelector('[data-workspace-chat-input]') ?? null;
    const chatForm = chat?.querySelector('[data-workspace-chat-form]') ?? null;
    const suggestionsContainer = chat?.querySelector('[data-workspace-chat-suggestions]') ?? null;
    const defaultSuggestionsMarkup = suggestionsContainer instanceof HTMLElement ? suggestionsContainer.innerHTML : '';

    const LENGTH_OPTIONS = [
      { value: 'short', label: 'Short story sprint', emoji: '⚡️' },
      { value: 'medium', label: 'Medium story arc', emoji: '🎯' },
      { value: 'long', label: 'Long-form journey', emoji: '🌌' }
    ];

    const LENGTH_DESCRIPTIONS = {
      short: 'quick short-form sprint',
      medium: 'balanced mid-length arc',
      long: 'full-length epic arc'
    };

    const appendChatMessage = (role, message) => {
      if (!(chatThread instanceof HTMLElement)) return;
      if (!message) return;
      const bubble = document.createElement('div');
      bubble.className = `workspace-launcher__chat-message workspace-launcher__chat-message--${role}`;
      bubble.textContent = message;
      chatThread.appendChild(bubble);
      chatThread.scrollTop = chatThread.scrollHeight;
    };

    if (chatForm instanceof HTMLFormElement && chatForm.dataset.workspaceChatFormBound !== 'true'){
      chatForm.dataset.workspaceChatFormBound = 'true';
      chatForm.addEventListener('submit', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!(chatInput instanceof HTMLInputElement)) return;
        const value = chatInput.value.trim();
        if (!value) return;
        appendChatMessage('user', value);
        chatInput.value = '';

        const ai = window.StudioOrganizeAI || null;
        if (!ai){
          appendChatMessage('assistant', 'I’ll keep that in mind! Tap STORY or jump into a workspace when you’re ready.');
          return;
        }

        const projectId = typeof ai.getLastTrackedProjectId === 'function' ? ai.getLastTrackedProjectId() : null;
        const hasProject = Boolean(projectId);
        const scope = hasProject ? ai.STORY_SCOPE_PROJECT : ai.STORY_SCOPE_TEMPLATE;
        let preferenceResult;
        try {
          preferenceResult = await ai.loadPreference(hasProject ? projectId : null, { scope });
        } catch (error){
          console.error('Failed to load AI preference for chat response', error);
        }

        const preference = preferenceResult?.preference || ai.getDefaultPreference();
        const pieces = [];
        if (preference.mode === 'new'){
          const length = preference.storyLength || 'medium';
          pieces.push(`Let’s build a ${LENGTH_DESCRIPTIONS[length] || 'fresh outline'} to kick things off.`);
        } else {
          pieces.push('I’ll scan your saved goals and point out what still needs attention.');
        }

        const emphasis = [];
        if (preference.featureFlags?.progress_nudges) emphasis.push('progress nudges');
        if (preference.featureFlags?.structure_spotlight) emphasis.push('structure check-ins');
        if (preference.featureFlags?.tone_cheerleader) emphasis.push('cheerleader energy');
        if (emphasis.length){
          if (emphasis.length === 1){
            pieces.push(`Expect ${emphasis[0]} along the way.`);
          } else if (emphasis.length === 2){
            pieces.push(`Expect ${emphasis[0]} and ${emphasis[1]} as we go.`);
          } else {
            pieces.push(`Expect ${emphasis.slice(0, -1).join(', ')}, and ${emphasis.slice(-1)} as we go.`);
          }
        }

        if (preference.biasNote){
          pieces.push(`I’ll keep this pinned: “${preference.biasNote}”.`);
        }

        if (preferenceResult?.source === 'local'){
          pieces.push('Sign in to sync this plan everywhere.');
        }

        const response = pieces.length
          ? pieces.join(' ')
          : 'Let me know when you want to jump into STORY and I’ll line up the next move.';
        appendChatMessage('assistant', response);
      });
    }

    const restoreDefaultSuggestions = () => {
      if (!(suggestionsContainer instanceof HTMLElement)) return;
      suggestionsContainer.innerHTML = defaultSuggestionsMarkup;
    };

    const renderLengthSuggestions = () => {
      if (!(suggestionsContainer instanceof HTMLElement)) return;
      const markup = LENGTH_OPTIONS.map(option => `
        <button type="button" class="workspace-launcher__chat-chip" data-workspace-chat-suggestion data-workspace-chat-length="${option.value}">
          ${option.emoji} ${option.label}
        </button>
      `).join('');
      suggestionsContainer.innerHTML = markup;
    };

    const getAiHelpers = () => window.StudioOrganizeAI || null;

    const handleContinueAction = async label => {
      appendChatMessage('user', label || 'Check in on my current story');
      const ai = getAiHelpers();
      if (!ai){
        appendChatMessage('assistant', 'I can cheer you on right away—sign in when you want me to remember goals across sessions.');
        return;
      }
      const projectId = typeof ai.getLastTrackedProjectId === 'function' ? ai.getLastTrackedProjectId() : null;
      if (!projectId){
        appendChatMessage('assistant', 'Open a script from the Creator Hub so I know which goals to compare against.');
        return;
      }
      let existing;
      try {
        existing = await ai.loadPreference(projectId);
      } catch (error){
        console.error('Failed to load existing AI preference for continue action', error);
      }
      const baseline = existing?.preference || ai.getDefaultPreference();
      const preference = { ...baseline, mode: 'continue', storyLength: null };
      const result = await ai.savePreference(projectId, preference);
      if (result.success && result.source === 'supabase'){
        appendChatMessage('assistant', 'Locked in. I’ll cross-check your saved goals and nudge you on unfinished beats.');
      } else if (result.success){
        appendChatMessage('assistant', 'I’ll remember that here. Sign in next time to sync it everywhere.');
      } else {
        appendChatMessage('assistant', 'I couldn’t sync that plan, but let’s keep moving with the story you have open.');
      }
    };

    const handleNewAction = label => {
      appendChatMessage('user', label || 'Start something new');
      appendChatMessage('assistant', 'Fresh canvas! Pick the scope and I’ll shape the outline.');
      renderLengthSuggestions();
    };

    const handleSettingsAction = label => {
      appendChatMessage('user', label || 'Adjust how you coach me');
      appendChatMessage('assistant', 'Head to Creator Hub → AI Assistant Plan to set feature checkboxes, bias notes, and story length defaults. I’ll follow whatever you save there.');
    };

    const handleLengthSelection = async (length, label) => {
      appendChatMessage('user', label || 'Set story length');
      const ai = getAiHelpers();
      if (!ai){
        appendChatMessage('assistant', `I’ll aim for a ${LENGTH_DESCRIPTIONS[length] || 'fresh outline'}. Sign in to save this preference.`);
        restoreDefaultSuggestions();
        return;
      }
      let existing;
      try {
        existing = await ai.loadPreference(null, { scope: ai.STORY_SCOPE_TEMPLATE });
      } catch (error){
        console.error('Failed to load new story preference', error);
      }
      const baseline = existing?.preference || ai.getDefaultPreference();
      const preference = { ...baseline, mode: 'new', storyLength: length };
      const result = await ai.savePreference(null, preference, { scope: ai.STORY_SCOPE_TEMPLATE });
      if (result.success && result.source === 'supabase'){
        appendChatMessage('assistant', `Saved! I’ll prep a ${LENGTH_DESCRIPTIONS[length] || 'fresh outline'} whenever you start a new story.`);
      } else if (result.success){
        appendChatMessage('assistant', `Got it. I’ll map a ${LENGTH_DESCRIPTIONS[length] || 'fresh outline'} here—sign in to sync across devices.`);
      } else {
        appendChatMessage('assistant', `I’ll still guide you through a ${LENGTH_DESCRIPTIONS[length] || 'fresh outline'} even though the setting didn’t sync.`);
      }
      restoreDefaultSuggestions();
    };

    if (launcher.dataset.workspaceChatSuggestionsBound !== 'true'){
      launcher.dataset.workspaceChatSuggestionsBound = 'true';
      launcher.addEventListener('click', event => {
        const target = event.target instanceof HTMLElement ? event.target.closest('[data-workspace-chat-suggestion]') : null;
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        const length = target.getAttribute('data-workspace-chat-length');
        const label = target.textContent?.trim() || '';
        if (length){
          handleLengthSelection(length, label);
          return;
        }
        const action = target.getAttribute('data-workspace-chat-action');
        if (action === 'continue'){
          handleContinueAction(label);
        } else if (action === 'new'){
          handleNewAction(label);
        } else if (action === 'settings'){
          handleSettingsAction(label);
        }
      });
    }
  });

  if (document.documentElement.dataset.workspaceLauncherGlobalBound === 'true') return;
  document.documentElement.dataset.workspaceLauncherGlobalBound = 'true';

  document.addEventListener('click', () => {
    closeAll();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape'){
      const openLauncherEl = launchers.find(launcher => launcher.classList.contains(OPEN_CLASS));
      if (openLauncherEl){
        closeLauncher(openLauncherEl, { focusToggle: true });
      }
    }
  });
}

const GOALS_STORAGE_KEY = 'SO_ACCOUNT_GOALS';

function parseStoredGoals(value){
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error){
    return [];
  }
}

function loadStoredGoals(){
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    return parseStoredGoals(stored);
  } catch (_error){
    return [];
  }
}

function persistGoals(goals){
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (_error){
    /* ignore write errors (e.g. private mode) */
  }
}

function formatGoalDate(dateString){
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())){
    return '';
  }
  return date.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

function buildGoalListItem(goal){
  const item = document.createElement('li');
  item.className = 'goal-list__item';
  item.dataset.goalId = goal.id;

  const header = document.createElement('div');
  header.className = 'goal-list__item-header';

  const title = document.createElement('p');
  title.className = 'goal-list__item-title';
  title.textContent = goal.title;

  const actions = document.createElement('div');
  actions.className = 'goal-list__actions';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'goal-list__remove';
  removeButton.textContent = 'Remove goal';
  removeButton.setAttribute('data-goal-remove', goal.id);
  removeButton.setAttribute('aria-label', `Remove goal “${goal.title}”`);

  actions.appendChild(removeButton);
  header.append(title, actions);
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'goal-list__item-meta';

  const metaPieces = [];
  const deadlineLabel = goal.deadline ? formatGoalDate(goal.deadline) : '';
  if (deadlineLabel){
    metaPieces.push(`Target: ${deadlineLabel}`);
  }
  if (goal.reminderLabel){
    metaPieces.push(`Reminder: ${goal.reminderLabel}`);
  }
  if (goal.createdAt){
    const createdLabel = formatGoalDate(goal.createdAt);
    if (createdLabel){
      metaPieces.push(`Added: ${createdLabel}`);
    }
  }

  if (metaPieces.length){
    meta.textContent = metaPieces.join(' • ');
    item.appendChild(meta);
  }

  if (goal.note){
    const note = document.createElement('p');
    note.className = 'goal-list__item-note';
    note.textContent = goal.note;
    item.appendChild(note);
  }

  return item;
}

function renderGoalList(goals, listElement, emptyState){
  if (!listElement || !emptyState) return;
  listElement.textContent = '';
  if (!Array.isArray(goals) || goals.length === 0){
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  const fragment = document.createDocumentFragment();
  goals.forEach(goal => {
    fragment.appendChild(buildGoalListItem(goal));
  });
  listElement.appendChild(fragment);
}

function initQuestionnaireModal(){
  const modal = document.querySelector('[data-questionnaire-modal]');
  const triggers = Array.from(document.querySelectorAll('[data-questionnaire-open]'));
  if (!modal || !triggers.length) return;
  if (modal.dataset.questionnaireBound === 'true') return;
  modal.dataset.questionnaireBound = 'true';

  const dialog = modal.querySelector('.questionnaire-modal__dialog');
  const overlay = modal.querySelector('.questionnaire-modal__overlay');
  const closeTriggers = Array.from(modal.querySelectorAll('[data-questionnaire-close]'));
  const form = modal.querySelector('[data-questionnaire-form]');
  const successMessage = modal.querySelector('[data-questionnaire-success]');
  const submitButton = form?.querySelector('.questionnaire-submit');

  const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocusedElement = null;

  const focusElement = element => {
    if (!(element instanceof HTMLElement)) return;
    try {
      element.focus({ preventScroll: true });
    } catch (_error){
      element.focus();
    }
  };

  const getFocusableElements = () => {
    return Array.from(modal.querySelectorAll(focusableSelectors)).filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  };

  const resetFormState = () => {
    if (!(form instanceof HTMLFormElement)) return;
    form.reset();
    form.classList.remove('is-complete');
    if (successMessage instanceof HTMLElement){
      successMessage.hidden = true;
    }
    if (submitButton instanceof HTMLButtonElement){
      submitButton.disabled = false;
      submitButton.textContent = 'Send my answers';
    }
  };

  const handleKeydown = event => {
    if (event.key === 'Escape'){
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey){
      if (document.activeElement === first || !modal.contains(document.activeElement)){
        event.preventDefault();
        focusElement(last);
      }
    } else {
      if (document.activeElement === last){
        event.preventDefault();
        focusElement(first);
      }
    }
  };

  const openModal = () => {
    if (!modal.hidden) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetFormState();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-modal-open');
    document.addEventListener('keydown', handleKeydown);

    window.requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length){
        focusElement(focusable[0]);
      } else if (dialog instanceof HTMLElement){
        focusElement(dialog);
      }
    });
  };

  const closeModal = ({ returnFocus = true } = {}) => {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-modal-open');
    document.removeEventListener('keydown', handleKeydown);

    if (returnFocus && lastFocusedElement instanceof HTMLElement){
      focusElement(lastFocusedElement);
    }

    lastFocusedElement = null;
  };

  triggers.forEach(trigger => {
    if (!(trigger instanceof HTMLElement)) return;
    trigger.addEventListener('click', event => {
      event.preventDefault();
      openModal();
    });
  });

  closeTriggers.forEach(closeTrigger => {
    if (!(closeTrigger instanceof HTMLElement)) return;
    closeTrigger.addEventListener('click', event => {
      event.preventDefault();
      closeModal();
    });
  });

  if (overlay instanceof HTMLElement){
    overlay.addEventListener('click', () => {
      closeModal();
    });
  }

  if (form instanceof HTMLFormElement){
    form.addEventListener('submit', event => {
      event.preventDefault();
      form.classList.add('is-complete');
      if (submitButton instanceof HTMLButtonElement){
        submitButton.disabled = true;
        submitButton.textContent = 'Submitted';
      }
      if (successMessage instanceof HTMLElement){
        successMessage.hidden = false;
        window.requestAnimationFrame(() => {
          focusElement(successMessage);
        });
      }
    });
  }
}

function initGoalPlanner(){
  const form = document.querySelector('[data-goal-form]');
  const list = document.querySelector('[data-goal-list]');
  const empty = document.querySelector('[data-goal-empty]');
  if (!form || !list || !empty) return;

  const titleInput = form.querySelector('input[name="goal"]');
  const dateInput = form.querySelector('input[name="deadline"]');
  const reminderSelect = form.querySelector('select[name="reminder"]');
  const noteInput = form.querySelector('textarea[name="note"]');

  let goals = loadStoredGoals();
  renderGoalList(goals, list, empty);

  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = (titleInput?.value || '').trim();
    if (!title){
      if (titleInput){
        titleInput.setCustomValidity('Please enter a goal title.');
        titleInput.reportValidity();
        titleInput.focus();
      }
      return;
    }
    if (titleInput){
      titleInput.setCustomValidity('');
    }

    const deadlineValue = (dateInput?.value || '').trim();
    const reminderValue = reminderSelect?.value || '';
    const reminderLabel = reminderSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
    const noteValue = (noteInput?.value || '').trim();

    const goal = {
      id: `goal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      deadline: deadlineValue ? `${deadlineValue}T00:00:00` : '',
      reminder: reminderValue,
      reminderLabel,
      note: noteValue,
      createdAt: new Date().toISOString(),
    };

    goals = [goal, ...goals];
    persistGoals(goals);
    renderGoalList(goals, list, empty);
    form.reset();
    titleInput?.focus();
  });

  list.addEventListener('click', event => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-goal-remove]') : null;
    if (!button) return;
    const goalId = button.getAttribute('data-goal-remove');
    if (!goalId) return;
    goals = goals.filter(goal => goal.id !== goalId);
    persistGoals(goals);
    renderGoalList(goals, list, empty);
  });
}

function buildFinishStoryDialog(){
  let dialog = document.getElementById('finish-story-dialog');
  if (dialog instanceof HTMLDialogElement) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'finish-story-dialog';
  dialog.className = 'modal';
  dialog.setAttribute('aria-labelledby', 'finish-story-dialog-title');

  dialog.innerHTML = `
    <div class="modal__surface" role="document">
      <header class="modal__header">
        <div class="modal__header-copy">
          <p class="modal__eyebrow">FinishThatStory.com</p>
          <h2 id="finish-story-dialog-title">Story studio preview</h2>
        </div>
        <button type="button" class="modal__close" data-modal-close aria-label="Close dialog">×</button>
      </header>
      <div class="modal__body">
        <section class="modal__section">
          <h3>Featured story spotlight</h3>
          <p class="modal__section-lead">Hero area reserved for the weekly feature. Expect rich media, creator credits, and a quick synopsis.</p>
          <ul class="modal__list">
            <li>Large trailer player or illustrated cover art.</li>
            <li>Short logline, creator bios, production status, and funding goals.</li>
            <li>Call-to-action for readers to subscribe, rate, or share.</li>
          </ul>
        </section>

        <section class="modal__section">
          <h3>Community story grid</h3>
          <p class="modal__section-lead">A masonry-like gallery for submissions from the FinishThatStory community.</p>
          <div class="modal__grid">
            <div class="modal__card">
              <span class="modal__badge">Thumbnail</span>
              <h4>Story title</h4>
              <p>Genre tags • Creator name</p>
              <dl class="modal__ratings">
                <div><dt>Members rating</dt><dd>★★★★★</dd></div>
                <div><dt>Technical score</dt><dd>▲▲▲▲△</dd></div>
              </dl>
            </div>
            <div class="modal__card">
              <span class="modal__badge">Thumbnail</span>
              <h4>Story title</h4>
              <p>Short descriptor + runtime</p>
              <dl class="modal__ratings">
                <div><dt>Members rating</dt><dd>4.7</dd></div>
                <div><dt>Technical score</dt><dd>Pro tier</dd></div>
              </dl>
            </div>
            <div class="modal__card">
              <span class="modal__badge">Thumbnail</span>
              <h4>Story title</h4>
              <p>Format • Language • Budget tier</p>
              <dl class="modal__ratings">
                <div><dt>Members rating</dt><dd>Trending</dd></div>
                <div><dt>Technical score</dt><dd>In review</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section class="modal__section">
          <h3>Detailed story card</h3>
          <p class="modal__section-lead">Clicking a story opens a deep-dive card where members can experience and support the project.</p>
          <ul class="modal__list">
            <li>Embedded reader or video player with chapters for episode releases.</li>
            <li>Production timeline, team roster, budget breakdown, and behind-the-scenes gallery.</li>
            <li>Voting module: “Should we finance Episode 2?” with member sentiment tracking.</li>
            <li>Creator notes, downloadable pitch decks, and discussion threads.</li>
          </ul>
        </section>

        <section class="modal__section">
          <h3>Categories &amp; filters</h3>
          <p class="modal__section-lead">Let fans browse by mood, length, and medium.</p>
          <ul class="modal__list modal__list--columns">
            <li>Short</li>
            <li>Comedy</li>
            <li>Script</li>
            <li>Novel</li>
            <li>Cartoon</li>
            <li>Documentary</li>
            <li>Animated series</li>
            <li>Audio drama</li>
            <li>Experimental</li>
          </ul>
        </section>
      </div>
      <footer class="modal__footer">
        <p>We&apos;re preparing the full FinishThatStory.com experience. Stay tuned for the official launch!</p>
      </footer>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeButton = dialog.querySelector('[data-modal-close]');
  if (closeButton instanceof HTMLButtonElement){
    closeButton.addEventListener('click', () => {
      dialog.close('dismissed');
    });
  }

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close('dismissed');
  });

  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog){
      dialog.close('backdrop');
    }
  });

  return dialog;
}

function initFinishStoryModal(){
  const links = Array.from(document.querySelectorAll('a[href^="https://finishthatstory.com"], a[href^="http://finishthatstory.com"], a[href^="//finishthatstory.com"]'));
  if (!links.length) return;

  const dialog = buildFinishStoryDialog();

  const focusTarget = dialog.querySelector('.modal__surface');
  let lastFocusedTrigger = null;

  if (!dialog.dataset.finishStoryFocusBound){
    dialog.dataset.finishStoryFocusBound = 'true';
    dialog.addEventListener('close', () => {
      if (lastFocusedTrigger instanceof HTMLElement){
        try {
          lastFocusedTrigger.focus({ preventScroll: true });
        } catch (_error){
          lastFocusedTrigger.focus();
        }
      }
      lastFocusedTrigger = null;
    });
  }

  links.forEach(link => {
    if (!(link instanceof HTMLAnchorElement)) return;
    if (link.dataset.finishStoryBound) return;
    link.dataset.finishStoryBound = 'true';
    link.setAttribute('role', 'button');
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', dialog.id);
    link.addEventListener('click', event => {
      event.preventDefault();
      lastFocusedTrigger = link;
      if (typeof dialog.showModal === 'function'){
        dialog.showModal();
        document.body.classList.add('modal-open');
        if (focusTarget instanceof HTMLElement){
          focusTarget.setAttribute('tabindex', '-1');
          focusTarget.focus();
        }
      } else if (link.href){
        window.open(link.href, link.target || '_blank');
        lastFocusedTrigger = null;
      }
    });
  });
}

function initConstructionOverlay(){
  const overlay = document.querySelector('[data-construction-overlay]');
  if (!(overlay instanceof HTMLElement)) return;

  const continueLink = overlay.querySelector('[data-construction-continue]');
  const dismissed = getConstructionDismissed();

  const removeOverlay = () => {
    overlay.remove();
  };

  const hideOverlay = () => {
    overlay.classList.add('construction-overlay--hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('transitionend', removeOverlay, { once: true });
  };

  if (dismissed){
    overlay.classList.add('construction-overlay--hidden');
    overlay.setAttribute('aria-hidden', 'true');
    markConstructionClass();
    requestAnimationFrame(removeOverlay);
    return;
  }

  document.documentElement.classList.remove('construction-overlay-dismissed');

  if (continueLink instanceof HTMLElement){
    const dismiss = event => {
      event.preventDefault();
      markConstructionDismissed();
      hideOverlay();
    };
    continueLink.addEventListener('click', dismiss);
    continueLink.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' '){
        dismiss(event);
      }
    });
    try {
      continueLink.focus({ preventScroll: true });
    } catch (_error){
      continueLink.focus();
    }
  }

  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape'){
      markConstructionDismissed();
      hideOverlay();
    }
  });
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    initWorkspaceLauncher();
    initDropdownMenus();
    initNotificationCenter();
    initMobileAppExperience();
    initQuestionnaireModal();
    initGoalPlanner();
    initFinishStoryModal();
    initConstructionOverlay();
  }, { once: true });
} else {
  initWorkspaceLauncher();
  initDropdownMenus();
  initNotificationCenter();
  initMobileAppExperience();
  initQuestionnaireModal();
  initGoalPlanner();
  initFinishStoryModal();
  initConstructionOverlay();
}
