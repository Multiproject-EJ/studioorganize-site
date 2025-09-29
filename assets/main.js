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

function updateToggleLabels(theme){
  const next = theme === 'dark' ? 'Light' : 'Dark';
  themeToggles().forEach(btn => {
    btn.textContent = `${next} mode`;
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    btn.setAttribute('aria-label', `Activate ${next.toLowerCase()} mode`);
    btn.setAttribute('title', `Switch to ${next.toLowerCase()} mode`);
  });
}

function applySiteTheme(theme, persist = true){
  const normalized = theme === 'light' ? 'light' : 'dark';
  const prev = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  if (persist) storeTheme(normalized);
  updateToggleLabels(normalized);
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
    updateToggleLabels(document.documentElement.dataset.theme || initial);
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
