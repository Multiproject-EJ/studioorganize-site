import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// footer year
const y = document.getElementById('y');
if (y) y.textContent = new Date().getFullYear();

const THEME_KEY = 'SO_THEME_PREF';

function getStoredTheme(){
  try { return localStorage.getItem(THEME_KEY); }
  catch (err){ return null; }
}

function storeTheme(theme){
  try { localStorage.setItem(THEME_KEY, theme); }
  catch (err){ /* ignore private mode errors */ }
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
    btn.textContent = `${next} mode`;
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    btn.setAttribute('aria-label', `Activate ${next.toLowerCase()} mode`);
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

function applySiteTheme(theme, persist = true){
  const normalized = theme === 'light' ? 'light' : 'dark';
  const prev = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  if (persist) storeTheme(normalized);
  updateToggleLabels(normalized);
  updateThemeSelects(normalized);
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

const authLink = document.querySelector('[data-auth-link]');
const accountMenu = document.querySelector('[data-account-menu]');
const accountButton = document.querySelector('[data-account-button]');
const accountLogoutLink = document.querySelector('[data-account-logout]');
const navHasAuthControls = Boolean(authLink || accountMenu || accountLogoutLink);

function toggleElementVisibility(element, shouldShow){
  if (!element) return;
  if (shouldShow){
    element.hidden = false;
    element.removeAttribute('aria-hidden');
    element.style.display = '';
  } else {
    element.hidden = true;
    element.setAttribute('aria-hidden', 'true');
    element.style.display = 'none';
  }
}

function updateAccountUI(session){
  if (!navHasAuthControls) return;
  const isSignedIn = Boolean(session);
  toggleElementVisibility(authLink, !isSignedIn);
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
