(function () {
  const shell = document.querySelector('.so-mobile-shell');
  const nav = document.querySelector('.so-mobile-bottom-nav');
  if (!shell || !nav) return;

  const pageId = shell.dataset.page || 'default';

  // helper: find or create a mobile module
  function ensureModule(id, selectorList, placeholderText) {
    let el = null;

    if (selectorList && selectorList.length) {
      for (const sel of selectorList) {
        const found = document.querySelector(sel);
        if (found) {
          el = found;
          break;
        }
      }
    }

    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'so-mobile-module';
      el.textContent = placeholderText || (id + ' (mobile) — coming soon');
      document.body.appendChild(el);
    } else {
      el.classList.add('so-mobile-module');
    }

    return el;
  }

  // page-specific module discovery
  const modules = {};

  if (pageId === 'screenwriter') {
    modules.screenwriter = ensureModule(
      'screenwriter-main',
      ['#screenplay-editor', '.screenplay-editor', '[data-screenwriter]'],
      'Screenwriter (mobile) — missing main editor'
    );
    modules.outline = ensureModule(
      'screenwriter-outline',
      ['#screenplay-outline'],
      'Outline (mobile)'
    );
    modules.notes = ensureModule(
      'screenwriter-notes',
      ['#screenplay-notes'],
      'Notes (mobile)'
    );
  } else if (pageId === 'character-studio') {
    modules.characters = ensureModule(
      'character-studio-main',
      ['#character-studio', '#character-list', '.character-studio', '[data-character-studio]'],
      'Characters (mobile)'
    );
    modules.backstories = ensureModule(
      'character-backstories',
      ['#character-backstories'],
      'Backstories (mobile)'
    );
    modules.relationships = ensureModule(
      'character-relationships',
      ['#character-relationships'],
      'Relationships (mobile)'
    );
  } else {
    // fallback for other pages
    modules.main = ensureModule(
      'so-page-main',
      ['main', '#main', '.main'],
      'Mobile view'
    );
  }

  function activate(id) {
    Object.keys(modules).forEach((key) => {
      const el = modules[key];
      if (!el) return;
      el.classList.remove('so-mobile-active');
    });

    const target = modules[id] || modules.main;
    if (target) {
      target.classList.add('so-mobile-active');
    }

    nav.querySelectorAll('[data-target]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.target === id);
    });

    try {
      localStorage.setItem('so:lastTab:' + pageId, id);
    } catch (e) {}
  }

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-target]');
    if (!btn) return;
    activate(btn.dataset.target);
  });

  // restore per-page tab
  const savedTab = (function () {
    try {
      return localStorage.getItem('so:lastTab:' + pageId);
    } catch (e) {
      return null;
    }
  })();

  // pick first button if no saved tab
  const firstBtn = nav.querySelector('[data-target]');
  const initialTab = savedTab || (firstBtn ? firstBtn.dataset.target : Object.keys(modules)[0]);
  activate(initialTab);

  // optional shared SW (must not throw)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/assets/sw/so-mobile-shell-sw.js')
      .catch(function () {
        // ignore
      });
  }
})();
