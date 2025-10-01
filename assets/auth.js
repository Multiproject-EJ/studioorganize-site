import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ycgqgkwwitqunabowswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU';
const WORKSPACE_URL = 'https://app.studioorganize.com';

const SUPPORT_EMAIL = 'support@studioorganize.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const HCAPTCHA_API_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit';

const authSettingsState = {
  attempted: false,
  captchaRequired: false,
  siteKey: null,
  disableSignup: false
};

let captchaScriptPromise = null;
let captchaId = null;
let captchaToken = null;

function qs(selector, scope = document){
  return scope.querySelector(selector);
}

function qsa(selector, scope = document){
  return Array.from(scope.querySelectorAll(selector));
}

function createModal(){
  const wrapper = document.createElement('div');
  wrapper.className = 'auth-modal';
  wrapper.dataset.mode = 'signup';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = `
    <div class="auth-modal__overlay" data-auth-close tabindex="-1"></div>
    <div class="auth-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <button class="auth-modal__close" type="button" data-auth-close aria-label="Close sign in dialog">×</button>
      <header class="auth-modal__header">
        <h2 id="auth-modal-title">Sign up and create account</h2>
        <p class="auth-modal__subtitle">Access StudioOrganize Online instantly after confirming your email.</p>
      </header>
      <form class="auth-form" data-auth-form="signup" novalidate>
        <div class="auth-form__field">
          <label for="auth-signup-name">Name</label>
          <input id="auth-signup-name" name="name" type="text" autocomplete="name" placeholder="Your name" />
        </div>
        <div class="auth-form__field">
          <label for="auth-signup-email">Email</label>
          <input id="auth-signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <div class="auth-form__field">
          <label for="auth-signup-password">Password</label>
          <input id="auth-signup-password" name="password" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required />
        </div>
        <div class="auth-form__captcha" data-auth-captcha hidden>
          <label class="auth-form__captcha-label">Security check</label>
          <div class="auth-form__captcha-widget" data-auth-captcha-widget></div>
          <p class="auth-form__captcha-help">This step prevents automated sign-ups.</p>
        </div>
        <p class="auth-form__status" data-auth-status="signup" role="status" aria-live="polite"></p>
        <button class="btn btn-primary auth-form__submit" type="submit">Sign up and create account</button>
        <p class="auth-form__switch">Already a creator? <button type="button" data-switch-mode="login">Log in</button></p>
      </form>
      <form class="auth-form" data-auth-form="login" hidden novalidate>
        <div class="auth-form__field">
          <label for="auth-login-email">Email</label>
          <input id="auth-login-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        </div>
        <div class="auth-form__field">
          <label for="auth-login-password">Password</label>
          <input id="auth-login-password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <p class="auth-form__status" data-auth-status="login" role="status" aria-live="polite"></p>
        <button class="btn btn-primary auth-form__submit" type="submit">Log in</button>
        <p class="auth-form__switch">New to StudioOrganize? <button type="button" data-switch-mode="signup">Create an account</button></p>
      </form>
    </div>
  `;
  return wrapper;
}

const modal = createModal();
document.body.appendChild(modal);

const signupForm = qs('[data-auth-form="signup"]', modal);
const loginForm = qs('[data-auth-form="login"]', modal);
const titleEl = qs('#auth-modal-title', modal);
const subtitleEl = qs('.auth-modal__subtitle', modal);
const statusSignup = qs('[data-auth-status="signup"]', modal);
const statusLogin = qs('[data-auth-status="login"]', modal);
const captchaWrapper = qs('[data-auth-captcha]', modal);
const captchaWidget = qs('[data-auth-captcha-widget]', modal);
let currentMode = 'signup';
let previouslyFocused = null;
let latestSession = null;

function setStatus(el, message, type = 'info'){
  if (!el) return;
  el.textContent = message || '';
  el.dataset.statusType = type;
}

function loadCaptchaScript(){
  if (typeof window.hcaptcha !== 'undefined'){
    return Promise.resolve(window.hcaptcha);
  }
  if (!captchaScriptPromise){
    captchaScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HCAPTCHA_API_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (typeof window.hcaptcha !== 'undefined'){
          resolve(window.hcaptcha);
        } else {
          reject(new Error('hCaptcha failed to initialize.'));
        }
      };
      script.onerror = () => reject(new Error('Unable to load hCaptcha.'));
      document.head.appendChild(script);
    });
  }
  return captchaScriptPromise;
}

async function loadAuthSettings(){
  if (authSettingsState.attempted){
    return authSettingsState;
  }
  authSettingsState.attempted = true;
  try {
    const { data, error } = await supabase.auth.getSettings();
    if (error){
      throw error;
    }
    authSettingsState.captchaRequired = false;
    authSettingsState.siteKey = null;
    authSettingsState.disableSignup = false;
    const captchaConfig = data?.captcha || {};
    const legacyCaptchaConfig = data?.hcaptcha || captchaConfig?.hcaptcha || {};
    const captchaEnabled = Boolean(
      legacyCaptchaConfig?.enabled ??
      captchaConfig?.enabled ??
      false
    );
    const siteKey = legacyCaptchaConfig?.site_key || legacyCaptchaConfig?.siteKey || captchaConfig?.hcaptcha?.site_key || captchaConfig?.hcaptcha?.siteKey || null;
    if (captchaEnabled && siteKey){
      authSettingsState.captchaRequired = true;
      authSettingsState.siteKey = siteKey;
    }

    const disableSignupFlag = data?.disable_signup === true;
    const emailSignupEnabled = data?.email?.enable_signup !== false;
    authSettingsState.disableSignup = Boolean(disableSignupFlag || !emailSignupEnabled);
  } catch (error) {
    console.warn('Failed to load Supabase auth settings', error);
    authSettingsState.attempted = false;
  }
  return authSettingsState;
}

function resetCaptcha(){
  if (typeof window.hcaptcha !== 'undefined' && captchaId !== null){
    try {
      window.hcaptcha.reset(captchaId);
    } catch (error) {
      console.warn('Unable to reset hCaptcha widget', error);
    }
  }
  captchaToken = null;
}

async function ensureCaptcha(){
  if (!captchaWrapper || !captchaWidget) return;
  const settings = await loadAuthSettings();
  if (!settings.captchaRequired || !settings.siteKey) return;
  if (captchaId !== null) return;
  try {
    const hcaptcha = await loadCaptchaScript();
    captchaId = hcaptcha.render(captchaWidget, {
      sitekey: settings.siteKey,
      callback: token => {
        captchaToken = token;
      },
      'expired-callback': () => {
        captchaToken = null;
      },
      'error-callback': () => {
        captchaToken = null;
        setStatus(statusSignup, 'Captcha verification failed. Please try again.', 'error');
      }
    });
    captchaWrapper.hidden = !modal.classList.contains('is-open');
  } catch (error) {
    console.warn('Unable to initialize captcha', error);
  }
}

function formatErrorMessage(error, context = 'generic'){
  const message = error && typeof error.message === 'string' ? error.message : '';
  const normalized = message.toLowerCase();

  if (context === 'signup'){
    if (authSettingsState.disableSignup){
      return 'New account creation is currently disabled in Supabase. Re-enable email/password sign-ups under Authentication → Providers to allow members to register.';
    }
    const captchaProblem = normalized.includes('captcha') || normalized.includes('challenge');
    if (captchaProblem){
      return 'Please complete the security check to continue.';
    }
    const disabledSignup =
      (typeof error?.status === 'number' && error.status === 403) ||
      normalized.includes('sign-ins are disabled') ||
      normalized.includes('signups not allowed');

    if (disabledSignup){
      return `We’re currently activating new accounts manually. Email ${SUPPORT_EMAIL} and we’ll help you get set up.`;
    }
  }

  if (context === 'login' && normalized.includes('email not confirmed')){
    return 'Please confirm your email first. Check your inbox for the confirmation link.';
  }

  if (message){
    return message;
  }

  return 'Something went wrong. Please try again.';
}

function disableForm(form, disabled){
  qsa('input, button', form).forEach(el => {
    el.disabled = disabled;
  });
}

function focusFirstField(){
  const form = currentMode === 'signup' ? signupForm : loginForm;
  const field = form ? form.querySelector('input:not([type="hidden"])') : null;
  if (field) field.focus();
}

function setMode(mode){
  currentMode = mode === 'login' ? 'login' : 'signup';
  modal.dataset.mode = currentMode;
  if (currentMode === 'signup'){
    signupForm.hidden = false;
    loginForm.hidden = true;
    titleEl.textContent = 'Sign up and create account';
    subtitleEl.textContent = 'Access StudioOrganize Online instantly after confirming your email.';
  } else {
    signupForm.hidden = true;
    loginForm.hidden = false;
    titleEl.textContent = 'Welcome back';
    subtitleEl.textContent = 'Log in to continue building your projects.';
  }
  requestAnimationFrame(focusFirstField);
}

function trapFocus(e){
  if (!modal.classList.contains('is-open')) return;
  if (e.key !== 'Tab') return;
  const focusable = qsa('button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])', modal)
    .filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first){
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last){
    e.preventDefault();
    first.focus();
  }
}

function openAuthModal(mode = 'signup'){
  previouslyFocused = document.activeElement;
  setMode(mode);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-modal-open');
  focusFirstField();
  ensureCaptcha();
  if (captchaWrapper && captchaId !== null){
    captchaWrapper.hidden = false;
  }
}

function closeAuthModal(){
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-modal-open');
  if (captchaWrapper){
    captchaWrapper.hidden = true;
  }
  if (authSettingsState.captchaRequired){
    resetCaptcha();
  }
  if (previouslyFocused && typeof previouslyFocused.focus === 'function'){
    previouslyFocused.focus();
  }
}

function handleEscape(e){
  if (e.key === 'Escape' && modal.classList.contains('is-open')){
    closeAuthModal();
  }
}

document.addEventListener('keydown', trapFocus);
document.addEventListener('keydown', handleEscape);

modal.addEventListener('click', e => {
  if (e.target && e.target.matches('[data-auth-close]')){
    closeAuthModal();
  }
});

modal.addEventListener('click', e => {
  const switcher = e.target.closest('[data-switch-mode]');
  if (!switcher) return;
  e.preventDefault();
  setStatus(statusLogin, '');
  setStatus(statusSignup, '');
  setMode(switcher.dataset.switchMode || 'signup');
});

async function handleSignup(e){
  e.preventDefault();
  if (!signupForm.reportValidity()){
    return;
  }
  setStatus(statusSignup, 'Creating your account…', 'info');
  disableForm(signupForm, true);
  const settings = await loadAuthSettings();
  if (settings.disableSignup){
    setStatus(statusSignup, 'Sign-ups are turned off in Supabase. Enable email/password registrations from the Authentication settings before trying again.', 'error');
    disableForm(signupForm, false);
    return;
  }
  if (settings.captchaRequired){
    await ensureCaptcha();
  }
  const formData = new FormData(signupForm);
  const name = (formData.get('name') || '').toString().trim();
  const email = (formData.get('email') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  if (settings.captchaRequired && !captchaToken){
    setStatus(statusSignup, 'Please complete the security check to continue.', 'error');
    disableForm(signupForm, false);
    return;
  }
  try {
    const profileData = name ? { full_name: name } : null;
    const options = {};
    if (profileData){
      options.data = profileData;
    }
    if (settings.captchaRequired && captchaToken){
      options.captchaToken = captchaToken;
    }
    const payload = options && Object.keys(options).length
      ? { email, password, options }
      : { email, password };
    const { error } = await supabase.auth.signUp(payload);
    if (error){
      throw error;
    }
    setStatus(statusSignup, 'Check your inbox to confirm your email. Once confirmed you can sign in and access the workspace.', 'success');
    signupForm.reset();
  } catch (error) {
    const errorMessage = (error && typeof error.message === 'string') ? error.message.toLowerCase() : '';
    if (!authSettingsState.captchaRequired && errorMessage.includes('captcha')){
      authSettingsState.captchaRequired = true;
      authSettingsState.attempted = false;
      await loadAuthSettings();
      await ensureCaptcha();
    }
    setStatus(statusSignup, formatErrorMessage(error, 'signup'), 'error');
  } finally {
    disableForm(signupForm, false);
    if (authSettingsState.captchaRequired){
      resetCaptcha();
    }
  }
}

async function handleLogin(e){
  e.preventDefault();
  if (!loginForm.reportValidity()){
    return;
  }
  setStatus(statusLogin, 'Signing you in…', 'info');
  disableForm(loginForm, true);
  const formData = new FormData(loginForm);
  const email = (formData.get('email') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error){
      throw error;
    }
    setStatus(statusLogin, 'Success! Redirecting to your workspace…', 'success');
    setTimeout(() => {
      window.location.href = WORKSPACE_URL;
    }, 900);
  } catch (error) {
    setStatus(statusLogin, formatErrorMessage(error, 'login'), 'error');
  } finally {
    disableForm(loginForm, false);
  }
}

signupForm.addEventListener('submit', handleSignup);
loginForm.addEventListener('submit', handleLogin);

function bindOpeners(){
  qsa('[data-open-auth]').forEach(btn => {
    if (btn.dataset.authBound) return;
    btn.dataset.authBound = 'true';
    if (!btn.dataset.authOriginalLabel){
      btn.dataset.authOriginalLabel = btn.textContent.trim();
    }
    if (!btn.dataset.authDefaultAction){
      const initialAction = btn.dataset.openAuth || btn.dataset.openAuthMode || btn.dataset.openAuthType || btn.dataset.openAuthState || 'signup';
      btn.dataset.authDefaultAction = initialAction;
      btn.dataset.openAuth = initialAction;
    }
    const handler = () => {
      const action = btn.dataset.openAuth || btn.dataset.openAuthMode || btn.dataset.openAuthType || btn.dataset.openAuthState || 'signup';
      if (action === 'workspace'){
        window.location.href = WORKSPACE_URL;
        return;
      }
      openAuthModal(action);
    };
    btn.addEventListener('click', handler);
    btn._authHandler = handler;
    if (btn.tagName === 'BUTTON' && !btn.hasAttribute('type')){
      btn.setAttribute('type', 'button');
    }
  });
  if (latestSession !== null){
    updateCtas(latestSession);
  }
}

function updateCtas(session){
  latestSession = session;
  const authed = Boolean(session);
  qsa('[data-open-auth]').forEach(btn => {
    if (!(btn instanceof HTMLElement)) return;
    const original = btn.dataset.authOriginalLabel || btn.textContent;
    const defaultAction = btn.dataset.authDefaultAction || 'signup';
    const skipRedirect = btn.dataset.authNoRedirect === 'true';
    if (authed && !skipRedirect){
      btn.textContent = 'Open workspace';
      btn.dataset.openAuth = 'workspace';
    } else {
      btn.textContent = original;
      btn.dataset.openAuth = defaultAction;
    }
  });
}

function init(){
  bindOpeners();
  const observer = new MutationObserver(bindOpeners);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

loadAuthSettings().then(settings => {
  if (settings.required){
    ensureCaptcha();
  }
}).catch(error => {
  console.warn('Captcha preflight failed', error);
});

supabase.auth.getSession().then(({ data }) => {
  const session = data?.session || null;
  updateCtas(session);
  document.body.classList.toggle('is-authenticated', !!session);
});

supabase.auth.onAuthStateChange((_event, session) => {
  updateCtas(session);
  document.body.classList.toggle('is-authenticated', !!session);
});

window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.supabaseClient = supabase;

window.dispatchEvent(new CustomEvent('auth:ready', { detail: { supabase } }));
