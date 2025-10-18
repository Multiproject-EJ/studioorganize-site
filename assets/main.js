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

  dropdowns.forEach(dropdown => {
    const parts = getParts(dropdown);
    if (!parts) return;
    const { trigger, panel } = parts;

    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');

    trigger.addEventListener('click', event => {
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

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    initDropdownMenus();
    initGoalPlanner();
    initFinishStoryModal();
  }, { once: true });
} else {
  initDropdownMenus();
  initGoalPlanner();
  initFinishStoryModal();
}
