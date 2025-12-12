let createClient = null;
try {
  const module = await import('https://esm.sh/@supabase/supabase-js@2');
  createClient = module.createClient;
} catch (error) {
  console.warn('Failed to load Supabase client:', error);
}
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

const SCRIPT_DIALOG_MESSAGE_TYPE = 'so-script-dialog';
let scriptDialogOverlayController = null;

let videoLessonDialogController = null;
let musicMoodOverlayController = null;

// Video lesson library data
const VIDEO_LESSONS = [
  {
    id: 'lesson-story-premise',
    title: 'Developing a Story Premise Readers Remember',
    url: 'https://youtu.be/HLLZdhkXiSQ?si=smWMSTN7ZTEc1eDV',
    lessonType: 'Story Development',
    tags: ['premise', 'story idea', 'creative process']
  },
  {
    id: 'lesson-character-arcs',
    title: 'Building Character Arcs with Emotional Stakes',
    url: 'https://youtu.be/GMWLIvY-jG0?si=kNloWFwQEf8o65vV',
    lessonType: 'Character Development',
    tags: ['character arc', 'emotion', 'motivation']
  },
  {
    id: 'lesson-scene-structure',
    title: 'Scene Structure: Turning Beats into Momentum',
    url: 'https://youtu.be/TUFHJMuunxA?si=JIHeMxxd3uqPRZr9',
    lessonType: 'Plot Structure',
    tags: ['beats', 'pacing', 'scene design']
  },
  {
    id: 'lesson-dialogue',
    title: 'Writing Dialogue that Reveals Character',
    url: 'https://youtu.be/-Nua3TH1mF4?si=xvabAsf0XOvsv8a4',
    lessonType: 'Writing Technique',
    tags: ['dialogue', 'voice', 'subtext']
  },
  {
    id: 'lesson-three-act',
    title: 'Three-Act Structure for Modern Storytellers',
    url: 'https://youtu.be/3TukzX6R57Y?si=BqdJtnr1ToPekSox',
    lessonType: 'Plot Structure',
    tags: ['structure', 'acts', 'narrative']
  },
  {
    id: 'lesson-worldbuilding',
    title: 'Worldbuilding Foundations for Film & Animation',
    url: 'https://youtu.be/CsfLB79qhCY?si=LZw-aXnsZVVLoWgH',
    lessonType: 'Worldbuilding',
    tags: ['worldbuilding', 'setting', 'visual storytelling']
  },
  {
    id: 'lesson-revision',
    title: 'Revising Scripts with a Director’s Eye',
    url: 'https://youtu.be/DGaNVqDD2vA?si=b1opPsyUWaxRRRox',
    lessonType: 'Editing & Revision',
    tags: ['script edit', 'feedback', 'iteration']
  }
];

const CREATE_WITH_MUSIC_LIBRARY = [
  {
    id: 'music-midnight-flow',
    title: 'Midnight City Flow',
    description: 'Floating synth pads and gentle rhythms to keep drafting sessions unhurried.',
    url: 'https://youtu.be/1dDwdhgxZ8M?si=Uay-GR3DMKYumADX',
    emotions: ['calm', 'hopeful', 'focus'],
    source: 'YouTube • Ambient chill mix'
  },
  {
    id: 'music-shadowbeats',
    title: 'Shadow Beats, Soft Hearts',
    description: 'Brooding strings that slowly bloom into cathartic drama.',
    url: 'https://youtu.be/1hhHhLP3_To?si=O6jHidDAkvv6pdkS',
    emotions: ['sad', 'introspective', 'tension'],
    source: 'YouTube • Emotional score'
  },
  {
    id: 'music-electric-bounce',
    title: 'Electric Bounce Draft Sprint',
    description: 'Upbeat cinematic pulse to keep dialogue playful and bright.',
    url: 'https://youtu.be/zuuZyT2AVIQ?si=WfIdiaRH9VJyIrJR',
    emotions: ['happy', 'energetic', 'confident'],
    source: 'YouTube • Euphoric EDM'
  },
  {
    id: 'music-cozy-chapters',
    title: 'Cozy Chapters (coming soon)',
    description: 'Acoustic hums for soft, romantic beats. Drop your favorites soon.',
    url: '',
    emotions: ['romantic', 'warm', 'hopeful'],
    source: 'StudioOrganize',
    comingSoon: true
  },
  {
    id: 'music-rallying-anthem',
    title: 'Rallying Anthem (coming soon)',
    description: 'Big heroic crescendos for climax pages. Placeholder while we mix it.',
    url: '',
    emotions: ['epic', 'victorious', 'determined'],
    source: 'StudioOrganize',
    comingSoon: true
  }
];

function ensureScriptDialogOverlayController(){
  if (scriptDialogOverlayController) {
    console.log('[ScriptDialog] Overlay controller already exists');
    return scriptDialogOverlayController;
  }
  if (!document.body) {
    console.error('[ScriptDialog] Cannot create overlay: document.body not available');
    return null;
  }

  console.log('[ScriptDialog] Creating overlay controller');

  const overlay = document.createElement('div');
  overlay.className = 'script-dialog-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="script-dialog-overlay__backdrop" data-script-dialog-overlay-close></div>
    <div class="script-dialog-overlay__panel" role="dialog" aria-modal="true" aria-label="Script library dialog">
      <button type="button" class="script-dialog-overlay__close" data-script-dialog-overlay-close aria-label="Close script dialog">✕</button>
      <iframe class="script-dialog-overlay__frame" title="Script dialog" loading="lazy" allow="clipboard-write"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
  console.log('[ScriptDialog] Overlay HTML appended to body');

  const iframe = overlay.querySelector('iframe');
  const closeTriggers = overlay.querySelectorAll('[data-script-dialog-overlay-close]');
  const resolvedOrigin = window.location?.origin;
  const messageOrigin = resolvedOrigin && resolvedOrigin !== 'null' ? resolvedOrigin : '*';
  let frameReady = false;
  let pendingOpen = false;

  const postToFrame = action => {
    if (!frameReady || !(iframe?.contentWindow)) {
      console.log(`[ScriptDialog] Cannot post '${action}' to frame: frameReady=${frameReady}, hasContentWindow=${!!(iframe?.contentWindow)}`);
      return;
    }
    console.log(`[ScriptDialog] Posting '${action}' to frame`);
    try {
      iframe.contentWindow.postMessage({ type: SCRIPT_DIALOG_MESSAGE_TYPE, action }, messageOrigin);
    } catch (_error){
      iframe.contentWindow.postMessage({ type: SCRIPT_DIALOG_MESSAGE_TYPE, action }, '*');
    }
  };

  const handleKeydown = event => {
    if (event.key === 'Escape'){
      event.preventDefault();
      controller.close();
    }
  };

  const controller = {
    open(){
      if (!iframe) {
        console.error('[ScriptDialog] Cannot open: iframe not found');
        return;
      }
      console.log('[ScriptDialog] Opening overlay');
      if (!iframe.src){
        const iframeSrc = '/use-cases/screenplay-writing.html?embed=script-dialog';
        console.log(`[ScriptDialog] Setting iframe src to: ${iframeSrc}`);
        iframe.src = iframeSrc;
      } else {
        console.log('[ScriptDialog] Iframe already has src:', iframe.src);
      }
      pendingOpen = true;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
      });
      document.documentElement.classList.add('script-dialog-overlay-open');
      window.addEventListener('keydown', handleKeydown);
      if (frameReady){
        postToFrame('open');
      } else {
        console.log('[ScriptDialog] Frame not ready yet, will post open message when ready');
      }
      setTimeout(() => {
        try { iframe.focus(); } catch (_error){}
      }, 150);
    },
    close({ notifyChild = true } = {}){
      if (!overlay.classList.contains('is-open')) {
        console.log('[ScriptDialog] Overlay not open, skipping close');
        return;
      }
      console.log('[ScriptDialog] Closing overlay');
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.hidden = true;
      pendingOpen = false;
      document.documentElement.classList.remove('script-dialog-overlay-open');
      window.removeEventListener('keydown', handleKeydown);
      if (notifyChild){
        postToFrame('close');
      }
    },
    notifyReady(){
      console.log('[ScriptDialog] Frame notified ready');
      frameReady = true;
      if (pendingOpen){
        console.log('[ScriptDialog] Pending open detected, posting open message now');
        postToFrame('open');
      }
    },
    isOpen(){
      return overlay.classList.contains('is-open');
    }
  };

  closeTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      console.log('[ScriptDialog] Close trigger clicked');
      controller.close();
    });
  });

  overlay.addEventListener('click', event => {
    if (event.target === overlay){
      console.log('[ScriptDialog] Backdrop clicked, closing');
      controller.close();
    }
  });

  window.addEventListener('message', event => {
    if (!iframe || event.source !== iframe.contentWindow) return;
    if (messageOrigin !== '*' && event.origin && event.origin !== messageOrigin && event.origin !== 'null') return;
    const data = event.data;
    if (!data || data.type !== SCRIPT_DIALOG_MESSAGE_TYPE) return;
    console.log(`[ScriptDialog] Received message from frame:`, data.action);
    if (data.action === 'ready'){
      frameReady = true;
      controller.notifyReady();
    } else if (data.action === 'closed'){
      controller.close({ notifyChild: false });
    }
  });

  scriptDialogOverlayController = controller;
  console.log('[ScriptDialog] Overlay controller created successfully');
  return controller;
}

function setupScriptDialogFallback(){
  if (typeof window.openScriptDialog === 'function') {
    console.log('[ScriptDialog] Fallback: openScriptDialog already exists, skipping setup');
    return;
  }
  if (document.getElementById('scriptDialog')) {
    console.log('[ScriptDialog] Fallback: inline dialog exists, skipping overlay');
    return;
  }
  // Ensure document.body is ready before creating the overlay
  if (!document.body) {
    console.log('[ScriptDialog] Fallback: body not ready, waiting...');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupScriptDialogFallback, { once: true });
    } else {
      // Body should exist but doesn't - wait a bit and retry
      setTimeout(setupScriptDialogFallback, 0);
    }
    return;
  }
  console.log('[ScriptDialog] Fallback: creating overlay controller');
  const controller = ensureScriptDialogOverlayController();
  if (!controller) {
    console.error('[ScriptDialog] Fallback: failed to create overlay controller');
    return;
  }
  window.openScriptDialog = () => {
    console.log('[ScriptDialog] Opening overlay dialog');
    controller.open();
  };
  window.closeScriptDialog = () => {
    console.log('[ScriptDialog] Closing overlay dialog');
    controller.close();
  };
  console.log('[ScriptDialog] Fallback: setup complete, window.openScriptDialog is now available');
}

if (typeof window.openScriptDialog !== 'function'){
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupScriptDialogFallback, { once: true });
  } else {
    setupScriptDialogFallback();
  }
}

function ensureVideoLessonDialogController(){
  if (videoLessonDialogController) return videoLessonDialogController;
  if (!document.body) return null;

  const overlay = document.createElement('div');
  overlay.className = 'video-lesson-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;

  const extractVideoId = url => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&"'>]+)/);
    return match ? match[1] : null;
  };

  const escapeHtml = str => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const renderVideoCard = lesson => {
    const videoId = extractVideoId(lesson.url);
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${escapeHtml(videoId)}/mqdefault.jpg` : '';
    const tags = Array.isArray(lesson.tags) ? lesson.tags : [];
    const tagsMarkup = tags.map(tag => `<span class="video-lesson__tag">${escapeHtml(tag)}</span>`).join('');
    const safeTitle = escapeHtml(lesson.title);
    const safeType = escapeHtml(lesson.lessonType);
    const safeUrl = escapeHtml(lesson.url);
    const safeId = escapeHtml(lesson.id);
    
    return `
      <div class="video-lesson__card" data-video-lesson-id="${safeId}" data-video-url="${safeUrl}" data-video-title="${safeTitle}">
        <div class="video-lesson__thumbnail">
          ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${safeTitle}" loading="lazy" />` : ''}
          <button type="button" class="video-lesson__play" data-video-play aria-label="Play ${safeTitle}">▶</button>
        </div>
        <div class="video-lesson__info">
          <h3 class="video-lesson__title">${safeTitle}</h3>
          <p class="video-lesson__type">${safeType}</p>
          <div class="video-lesson__tags">${tagsMarkup}</div>
        </div>
      </div>
    `;
  };

  const videoCardsMarkup = VIDEO_LESSONS.map(renderVideoCard).join('');

  overlay.innerHTML = `
    <div class="video-lesson-overlay__backdrop" data-video-lesson-close></div>
    <div class="video-lesson-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="video-lesson-title">
      <button type="button" class="video-lesson-overlay__close" data-video-lesson-close aria-label="Close video lessons">✕</button>
      <header class="video-lesson-overlay__header">
        <h2 id="video-lesson-title">📺 Video Lesson Library</h2>
        <p class="video-lesson-overlay__subtitle">Learn storytelling techniques from expert tutorials</p>
      </header>
      <div class="video-lesson-overlay__player" data-video-player hidden>
        <div class="video-lesson-overlay__player-bar">
          <button type="button" class="video-lesson-overlay__back" data-video-back aria-label="Back to library">← Back to Library</button>
          <button type="button" class="video-lesson-overlay__popout" data-video-popout aria-label="Pop out video player">Pop out</button>
        </div>
        <div class="video-lesson-overlay__embed" data-video-embed></div>
      </div>
      <div class="video-lesson-overlay__grid" data-video-grid>
        ${videoCardsMarkup}
      </div>
    </div>
    <div class="video-lesson-overlay__pip" data-video-pip hidden>
      <div class="video-lesson-overlay__pip-header">
        <div class="video-lesson-overlay__pip-meta">
          <span class="video-lesson-overlay__pip-icon">▶</span>
          <div class="video-lesson-overlay__pip-text">
            <p class="video-lesson-overlay__pip-label">Now Playing</p>
            <p class="video-lesson-overlay__pip-title" data-video-pip-title>Video Lesson</p>
          </div>
        </div>
        <div class="video-lesson-overlay__pip-actions">
          <button type="button" class="video-lesson-overlay__pip-button" data-video-pip-library aria-label="Browse video lessons">Library</button>
          <button type="button" class="video-lesson-overlay__pip-button video-lesson-overlay__pip-button--close" data-video-lesson-close aria-label="Close video lesson">✕</button>
        </div>
      </div>
      <div class="video-lesson-overlay__pip-body" data-video-pip-embed></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeTriggers = overlay.querySelectorAll('[data-video-lesson-close]');
  const grid = overlay.querySelector('[data-video-grid]');
  const playerContainer = overlay.querySelector('[data-video-player]');
  const embedContainer = overlay.querySelector('[data-video-embed]');
  const backButton = overlay.querySelector('[data-video-back]');
  const popoutButton = overlay.querySelector('[data-video-popout]');
  const pipContainer = overlay.querySelector('[data-video-pip]');
  const pipEmbed = overlay.querySelector('[data-video-pip-embed]');
  const pipTitle = overlay.querySelector('[data-video-pip-title]');
  const pipLibraryButton = overlay.querySelector('[data-video-pip-library]');

  const handleKeydown = event => {
    if (event.key === 'Escape'){
      event.preventDefault();
      controller.close();
    }
  };

  let iframe = null;
  let currentVideoId = null;
  let currentVideoTitle = '';
  let keydownBound = false;

  const bindKeydown = () => {
    if (keydownBound) return;
    window.addEventListener('keydown', handleKeydown);
    keydownBound = true;
  };

  const unbindKeydown = () => {
    if (!keydownBound) return;
    window.removeEventListener('keydown', handleKeydown);
    keydownBound = false;
  };

  const ensureIframe = () => {
    if (!iframe){
      iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.title = 'YouTube video player';
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowfullscreen', '');
    }
    return iframe;
  };

  const mountIframe = container => {
    if (!container || !currentVideoId) return;
    const player = ensureIframe();
    const desiredSrc = `https://www.youtube.com/embed/${encodeURIComponent(currentVideoId)}?rel=0&autoplay=1`;
    if (player.dataset.videoId !== currentVideoId){
      player.src = desiredSrc;
      player.dataset.videoId = currentVideoId;
    }
    container.innerHTML = '';
    container.appendChild(player);
  };

  const stopVideo = () => {
    if (iframe){
      try {
        iframe.removeAttribute('src');
        iframe.dataset.videoId = '';
      } catch (err){}
      try {
        iframe.remove();
      } catch (err){}
    }
    iframe = null;
    currentVideoId = null;
    currentVideoTitle = '';
    if (embedContainer) embedContainer.innerHTML = '';
    if (pipEmbed) pipEmbed.innerHTML = '';
  };

  const resetLibraryView = () => {
    if (playerContainer) playerContainer.hidden = true;
    if (grid) grid.hidden = false;
    if (embedContainer) embedContainer.innerHTML = '';
  };

  const enterPiP = () => {
    if (!pipContainer || !pipEmbed || !currentVideoId) return;
    overlay.dataset.mode = 'pip';
    pipContainer.hidden = false;
    if (pipTitle) pipTitle.textContent = currentVideoTitle || 'Video Lesson';
    mountIframe(pipEmbed);
    if (embedContainer) embedContainer.innerHTML = '';
    resetLibraryView();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });
    document.documentElement.classList.remove('video-lesson-overlay-open');
    bindKeydown();
  };

  const enterLibrary = ({ showCurrentVideo = false } = {}) => {
    overlay.dataset.mode = 'library';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (pipContainer){
      pipContainer.hidden = true;
    }
    if (pipEmbed){
      pipEmbed.innerHTML = '';
    }
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });
    document.documentElement.classList.add('video-lesson-overlay-open');
    if (showCurrentVideo && currentVideoId && embedContainer && playerContainer){
      mountIframe(embedContainer);
      playerContainer.hidden = false;
      if (grid) grid.hidden = true;
    } else {
      resetLibraryView();
    }
    bindKeydown();
  };

  const showPlayer = (videoUrl, videoTitle) => {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) return;
    currentVideoId = videoId;
    currentVideoTitle = videoTitle || '';
    enterPiP();
  };

  if (backButton){
    backButton.addEventListener('click', event => {
      event.preventDefault();
      stopVideo();
      resetLibraryView();
    });
  }

  if (popoutButton){
    popoutButton.addEventListener('click', event => {
      event.preventDefault();
      if (!currentVideoId){
        return;
      }
      enterPiP();
    });
  }

  if (pipLibraryButton){
    pipLibraryButton.addEventListener('click', event => {
      event.preventDefault();
      const hasVideo = Boolean(currentVideoId);
      enterLibrary({ showCurrentVideo: hasVideo });
    });
  }

  overlay.addEventListener('click', event => {
    // Handle play button clicks
    const playButton = event.target instanceof HTMLElement ? event.target.closest('[data-video-play]') : null;
    if (playButton){
      event.preventDefault();
      const card = playButton.closest('[data-video-lesson-id]');
      const videoUrl = card?.getAttribute('data-video-url');
      const videoTitle = card?.getAttribute('data-video-title') || '';
      if (videoUrl){
        showPlayer(videoUrl, videoTitle);
      }
      return;
    }

    // Handle backdrop clicks to close
    if (event.target === overlay && overlay.dataset.mode !== 'pip'){
      controller.close();
    }
  });

  const controller = {
    open(){
      if (!overlay) return;
      enterLibrary();
    },
    close(){
      if (!overlay.classList.contains('is-open')) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        overlay.hidden = true;
        stopVideo();
        resetLibraryView();
        if (pipContainer){
          pipContainer.hidden = true;
        }
        overlay.dataset.mode = '';
      }, 300);
      document.documentElement.classList.remove('video-lesson-overlay-open');
      unbindKeydown();
    },
    isOpen(){
      return overlay.classList.contains('is-open');
    }
  };

  closeTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      controller.close();
    });
  });

  videoLessonDialogController = controller;
  return controller;
}

function setupVideoLessonDialog(){
  if (typeof window.openVideoLessonDialog === 'function') return;
  const controller = ensureVideoLessonDialogController();
  if (!controller) return;
  window.openVideoLessonDialog = () => controller.open();
  window.closeVideoLessonDialog = () => controller.close();
}

if (typeof window.openVideoLessonDialog !== 'function'){
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupVideoLessonDialog, { once: true });
  } else {
    setupVideoLessonDialog();
  }
}

function ensureMusicMoodOverlayController(){
  if (musicMoodOverlayController) return musicMoodOverlayController;
  if (!document.body) return null;

  const normalizeEmotion = emotion => typeof emotion === 'string' ? emotion.trim().toLowerCase() : '';
  const formatEmotion = emotion => {
    if (!emotion) return '';
    return emotion.charAt(0).toUpperCase() + emotion.slice(1);
  };

  const escapeHtml = str => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const extractVideoId = url => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&"'>]+)/);
    return match ? match[1] : null;
  };

  const normalizedLibrary = CREATE_WITH_MUSIC_LIBRARY.map(track => {
    const normalizedEmotions = Array.isArray(track.emotions)
      ? track.emotions.map(normalizeEmotion).filter(Boolean)
      : [];
    return { ...track, normalizedEmotions };
  });

  const overlay = document.createElement('div');
  overlay.className = 'music-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;

  const renderMusicCard = track => {
    const safeTitle = escapeHtml(track.title || 'Untitled track');
    const safeDescription = escapeHtml(track.description || '');
    const safeSource = escapeHtml(track.source || 'YouTube');
    const safeId = escapeHtml(track.id || 'music-track');
    const videoId = extractVideoId(track.url);
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg` : '';
    const moodAttr = track.normalizedEmotions.join(',');
    const moodTags = track.normalizedEmotions.length
      ? track.normalizedEmotions.map(mood => `<span class="music-track__emotion">${escapeHtml(formatEmotion(mood))}</span>`).join('')
      : '<span class="music-track__emotion">Any</span>';
    const comingSoon = Boolean(track.comingSoon || !track.url);
    return `
      <article class="music-track${comingSoon ? ' music-track--soon' : ''}" data-music-track data-music-track-id="${safeId}" data-music-emotions="${escapeHtml(moodAttr)}">
        <div class="music-track__thumbnail">
          ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="${safeTitle}" loading="lazy" />` : '<div class="music-track__thumbnail-placeholder" aria-hidden="true">🎧</div>'}
          ${comingSoon
            ? '<span class="music-track__soon-badge">Coming soon</span>'
            : `<button type="button" class="music-track__play" data-music-play aria-label="Play ${safeTitle}">▶</button>`}
        </div>
        <div class="music-track__body">
          <p class="music-track__label">${safeSource}</p>
          <h3 class="music-track__title">${safeTitle}</h3>
          <p class="music-track__description">${safeDescription}</p>
          <div class="music-track__emotions">${moodTags}</div>
        </div>
      </article>
    `;
  };

  const uniqueEmotions = Array.from(new Set(
    normalizedLibrary.flatMap(track => track.normalizedEmotions)
  )).sort();

  const filtersMarkup = uniqueEmotions.map(emotion => `
    <button type="button" class="music-overlay__filter" data-music-filter="${escapeHtml(emotion)}">
      ${escapeHtml(formatEmotion(emotion))}
    </button>
  `).join('');

  const cardsMarkup = normalizedLibrary.map(renderMusicCard).join('');

  overlay.innerHTML = `
    <div class="music-overlay__backdrop" data-music-overlay-close></div>
    <div class="music-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="music-overlay-title">
      <button type="button" class="music-overlay__close" data-music-overlay-close aria-label="Close Create with Music">✕</button>
      <header class="music-overlay__header">
        <h2 id="music-overlay-title">🎶 Create with Music</h2>
        <p>Drop into a mood-matched soundtrack while you outline scenes.</p>
      </header>
      <div class="music-overlay__filters" data-music-filters>
        <button type="button" class="music-overlay__filter is-active" data-music-filter="all">All moods</button>
        ${filtersMarkup}
      </div>
      <div class="music-overlay__body">
        <section class="music-overlay__player" data-music-player hidden>
          <div class="music-overlay__now-playing">
            <p class="music-overlay__now-playing-label">Now playing</p>
            <h3 class="music-overlay__now-playing-title" data-music-title>Pick a track</h3>
            <p class="music-overlay__now-playing-source" data-music-source>—</p>
            <p class="music-overlay__now-playing-moods" data-music-moods></p>
          </div>
          <div class="music-overlay__embed" data-music-embed></div>
          <button type="button" class="music-overlay__stop" data-music-stop hidden>Stop playback</button>
        </section>
        <div class="music-overlay__library" data-music-library>
          <div class="music-overlay__grid" data-music-grid>
            ${cardsMarkup}
          </div>
          <div class="music-overlay__empty" data-music-empty hidden>
            <p>We’re mixing more <span data-music-empty-label>fresh</span> vibes for that mood.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeTriggers = overlay.querySelectorAll('[data-music-overlay-close]');
  const filterButtons = Array.from(overlay.querySelectorAll('[data-music-filter]'));
  const cards = Array.from(overlay.querySelectorAll('[data-music-track]'));
  const player = overlay.querySelector('[data-music-player]');
  const embedContainer = overlay.querySelector('[data-music-embed]');
  const stopButton = overlay.querySelector('[data-music-stop]');
  const nowPlayingTitle = overlay.querySelector('[data-music-title]');
  const nowPlayingSource = overlay.querySelector('[data-music-source]');
  const nowPlayingMoods = overlay.querySelector('[data-music-moods]');
  const emptyState = overlay.querySelector('[data-music-empty]');
  const emptyLabel = overlay.querySelector('[data-music-empty-label]');

  const trackMap = new Map(normalizedLibrary.map(track => [track.id, track]));

  let iframe = null;
  let activeTrackId = null;
  let activeFilter = 'all';
  let keydownBound = false;

  const ensureIframe = () => {
    if (!iframe){
      iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.title = 'YouTube music player';
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowfullscreen', '');
    }
    return iframe;
  };

  const handleKeydown = event => {
    if (event.key === 'Escape'){
      event.preventDefault();
      controller.close();
    }
  };

  const bindKeydown = () => {
    if (keydownBound) return;
    window.addEventListener('keydown', handleKeydown);
    keydownBound = true;
  };

  const unbindKeydown = () => {
    if (!keydownBound) return;
    window.removeEventListener('keydown', handleKeydown);
    keydownBound = false;
  };

  const setActiveTrack = trackId => {
    activeTrackId = trackId || null;
    cards.forEach(card => {
      const isActive = card.getAttribute('data-music-track-id') === activeTrackId;
      card.classList.toggle('music-track--active', isActive);
    });
  };

  const stopPlayback = () => {
    if (iframe){
      try {
        iframe.removeAttribute('src');
        iframe.dataset.videoId = '';
      } catch (error){}
      try {
        iframe.remove();
      } catch (error){}
    }
    iframe = null;
    if (embedContainer) embedContainer.innerHTML = '';
    if (player) player.hidden = true;
    if (stopButton) stopButton.hidden = true;
    if (nowPlayingTitle) nowPlayingTitle.textContent = 'Pick a track';
    if (nowPlayingSource) nowPlayingSource.textContent = '—';
    if (nowPlayingMoods) nowPlayingMoods.textContent = '';
    setActiveTrack(null);
  };

  const mountIframe = videoId => {
    if (!embedContainer || !videoId) return;
    const playerFrame = ensureIframe();
    const desiredSrc = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1`;
    if (playerFrame.dataset.videoId !== videoId){
      playerFrame.src = desiredSrc;
      playerFrame.dataset.videoId = videoId;
    }
    embedContainer.innerHTML = '';
    embedContainer.appendChild(playerFrame);
  };

  const playTrack = track => {
    if (!track || !track.url) return;
    const videoId = extractVideoId(track.url);
    if (!videoId) return;
    mountIframe(videoId);
    if (player) player.hidden = false;
    if (stopButton) stopButton.hidden = false;
    if (nowPlayingTitle) nowPlayingTitle.textContent = track.title || 'Now Playing';
    if (nowPlayingSource) nowPlayingSource.textContent = track.source || 'YouTube';
    if (nowPlayingMoods){
      nowPlayingMoods.textContent = track.normalizedEmotions.length
        ? track.normalizedEmotions.map(formatEmotion).join(' • ')
        : '';
    }
    setActiveTrack(track.id);
  };

  const updateEmptyState = visibleCount => {
    if (!(emptyState instanceof HTMLElement)) return;
    if (visibleCount === 0){
      emptyState.hidden = false;
      if (emptyLabel instanceof HTMLElement){
        emptyLabel.textContent = activeFilter === 'all' ? 'fresh' : formatEmotion(activeFilter);
      }
    } else {
      emptyState.hidden = true;
    }
  };

  const setFilter = mood => {
    const normalized = mood && mood !== 'all' ? normalizeEmotion(mood) : 'all';
    activeFilter = normalized || 'all';
    filterButtons.forEach(button => {
      const buttonFilter = button.getAttribute('data-music-filter') || '';
      button.classList.toggle('is-active', buttonFilter === activeFilter || (activeFilter === 'all' && buttonFilter === 'all'));
    });
    let visibleCount = 0;
    cards.forEach(card => {
      if (!(card instanceof HTMLElement)) return;
      const emotionsAttr = card.getAttribute('data-music-emotions') || '';
      const emotions = emotionsAttr
        .split(',')
        .map(normalizeEmotion)
        .filter(Boolean);
      const shouldShow = activeFilter === 'all' || emotions.includes(activeFilter);
      card.hidden = !shouldShow;
      if (shouldShow) visibleCount++;
    });
    updateEmptyState(visibleCount);
  };

  overlay.addEventListener('click', event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const playButton = target.closest('[data-music-play]');
    if (playButton){
      event.preventDefault();
      const card = playButton.closest('[data-music-track-id]');
      const trackId = card?.getAttribute('data-music-track-id');
      const track = trackMap.get(trackId);
      if (track){
        playTrack(track);
      }
      return;
    }

    const filterButton = target.closest('[data-music-filter]');
    if (filterButton){
      event.preventDefault();
      const mood = filterButton.getAttribute('data-music-filter') || 'all';
      setFilter(mood);
      return;
    }

    if (target === overlay){
      controller.close();
    }
  });

  if (stopButton instanceof HTMLElement){
    stopButton.addEventListener('click', event => {
      event.preventDefault();
      stopPlayback();
    });
  }

  const controller = {
    open(options = {}){
      const desiredFilter = typeof options === 'string'
        ? options
        : (options && typeof options === 'object' ? options.mood : null);
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
      });
      document.documentElement.classList.add('music-overlay-open');
      bindKeydown();
      setFilter(desiredFilter || 'all');
    },
    close(){
      if (!overlay.classList.contains('is-open')) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        overlay.hidden = true;
        stopPlayback();
        setFilter('all');
      }, 250);
      document.documentElement.classList.remove('music-overlay-open');
      unbindKeydown();
    },
    isOpen(){
      return overlay.classList.contains('is-open');
    }
  };

  closeTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      controller.close();
    });
  });

  setFilter('all');

  musicMoodOverlayController = controller;
  return controller;
}

function setupMusicMoodOverlay(){
  if (typeof window.openMusicMoodOverlay === 'function') return;
  const controller = ensureMusicMoodOverlayController();
  if (!controller) return;
  window.openMusicMoodOverlay = mood => {
    if (typeof mood === 'string'){
      controller.open({ mood });
      return;
    }
    if (mood && typeof mood === 'object'){
      controller.open(mood);
      return;
    }
    controller.open();
  };
  window.closeMusicMoodOverlay = () => controller.close();
}

if (typeof window.openMusicMoodOverlay !== 'function'){
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupMusicMoodOverlay, { once: true });
  } else {
    setupMusicMoodOverlay();
  }
}

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
    // Default to dark mode for first-time visitors
    initial = 'dark';
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

const SUPABASE_URL = 'https://ycgqgkwwitqunabowswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Fna3d3aXRxdW5hYm93c3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTg2NTAsImV4cCI6MjA3NDczNDY1MH0.W0mKqZlHVn6tRYSyZ4VRK4zCpCPC1ICwqtqoWrQMBuU';

let supabaseClient = null;
try {
  if (typeof createClient === 'function') {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
  } else {
    console.warn('Supabase createClient not available - running without database features');
  }
} catch (error) {
  console.error('Failed to initialize Supabase client', error);
}

const workspaceThemes = createWorkspaceThemeManager();
const workspaceVisibility = createWorkspaceVisibilityManager();
window.StudioOrganize = window.StudioOrganize || {};
window.StudioOrganize.workspaceThemes = workspaceThemes;
window.StudioOrganize.workspaceVisibility = workspaceVisibility;
window.StudioOrganize.requestWorkspaceSave = requestWorkspaceSave;
// Expose Supabase config for debug console Header Check feature
window.StudioOrganize.SUPABASE_URL = SUPABASE_URL;
window.StudioOrganize.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
document.dispatchEvent(new CustomEvent('studioorganize:workspace-themes-ready', { detail: { workspaceThemes } }));
document.dispatchEvent(new CustomEvent('studioorganize:workspace-visibility-ready', { detail: { workspaceVisibility } }));

const currentWorkspaceModule = workspaceThemes.getModuleForPath(window.location.pathname);
if (currentWorkspaceModule){
  let suppressNextThemeSave = false;
  workspaceThemes.subscribe(snapshot => {
    const desiredTheme = snapshot?.[currentWorkspaceModule];
    if (!desiredTheme) return;
    const currentTheme = typeof window.getSiteTheme === 'function'
      ? window.getSiteTheme()
      : (document.documentElement.dataset.theme || 'dark');
    if (currentTheme === desiredTheme) return;
    suppressNextThemeSave = true;
    applySiteTheme(desiredTheme, false);
  });
  workspaceThemes.loadRemote();
  workspaceVisibility.loadRemote();
  document.addEventListener('themechange', event => {
    const theme = event?.detail?.theme;
    if (!theme) return;
    if (suppressNextThemeSave){
      suppressNextThemeSave = false;
      return;
    }
    workspaceThemes.savePreference(currentWorkspaceModule, theme);
  });
}

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', e=>{
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); }
  });
});

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

function createWorkspaceThemeManager(){
  const STORAGE_KEY = 'SO_WORKSPACE_THEME_PREFS';
  const DEFAULT_THEME = 'light';
  const MODULES = Object.freeze([
    { id: 'script_writer', label: 'Script Writer', paths: [/screenplay-writing/] },
    { id: 'storyboard', label: 'Storyboard', paths: [/storyboardpro/, /storyboard\//] }
  ]);

  let local = loadLocal();
  let remote = null;
  let loadingPromise = null;
  let lastSessionUserId = null;
  const listeners = new Set();

  function normalizeTheme(theme){
    return theme === 'dark' ? 'dark' : 'light';
  }

  function loadLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const map = {};
      Object.entries(parsed).forEach(([moduleId, theme]) => {
        map[moduleId] = normalizeTheme(theme);
      });
      return map;
    } catch (_error){
      return {};
    }
  }

  function persistLocal(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    } catch (_error){
      /* ignore */
    }
  }

  function getPreference(moduleId){
    if (!moduleId) return DEFAULT_THEME;
    const remoteTheme = remote && remote[moduleId];
    if (remoteTheme) return normalizeTheme(remoteTheme);
    const localTheme = local && local[moduleId];
    if (localTheme) return normalizeTheme(localTheme);
    return DEFAULT_THEME;
  }

  function getSnapshot(){
    const snapshot = {};
    MODULES.forEach(module => {
      snapshot[module.id] = getPreference(module.id);
    });
    return snapshot;
  }

  function notify(){
    const snapshot = getSnapshot();
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error){
        console.error('Workspace theme listener failed', error);
      }
    });
  }

  function subscribe(listener){
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    try {
      listener(getSnapshot());
    } catch (error){
      console.error('Workspace theme subscriber threw on init', error);
    }
    return () => {
      listeners.delete(listener);
    };
  }

  function setLocalPreference(moduleId, theme){
    if (!moduleId) return DEFAULT_THEME;
    const normalized = normalizeTheme(theme);
    local = { ...(local || {}), [moduleId]: normalized };
    persistLocal();
    return normalized;
  }

  async function savePreference(moduleId, theme){
    const normalized = setLocalPreference(moduleId, theme);
    notify();
    if (!moduleId) return { success: false, reason: 'invalid_module', theme: normalized };
    if (!supabaseClient) return { success: false, reason: 'no_client', theme: normalized };
    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError){
        console.error('Failed to fetch Supabase session for workspace theme preference', sessionError);
        return { success: false, reason: 'session_error', theme: normalized };
      }
      const user = sessionData?.session?.user;
      lastSessionUserId = user?.id || null;
      if (!user){
        return { success: false, reason: 'not_signed_in', theme: normalized };
      }
      const { data, error } = await supabaseClient
        .from('workspace_theme_preferences')
        .upsert({ owner_id: user.id, module: moduleId, theme: normalized }, { onConflict: 'owner_id,module' })
        .select('module, theme')
        .maybeSingle();
      if (error){
        console.error('Failed to save workspace theme preference', error);
        return { success: false, reason: 'request_failed', theme: normalized };
      }
      const savedModule = data?.module || moduleId;
      const savedTheme = data?.theme || normalized;
      remote = { ...(remote || {}), [savedModule]: normalizeTheme(savedTheme) };
      notify();
      return { success: true, source: 'supabase', theme: normalizeTheme(savedTheme) };
    } catch (error){
      console.error('Unexpected error saving workspace theme preference', error);
      return { success: false, reason: 'unexpected', theme: normalized };
    }
  }

  async function loadRemote(){
    if (!supabaseClient) return { success: false, reason: 'no_client' };
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError){
          console.error('Failed to fetch Supabase session for workspace theme preferences', sessionError);
          return { success: false, reason: 'session_error' };
        }
        const user = sessionData?.session?.user;
        lastSessionUserId = user?.id || null;
        if (!user){
          remote = null;
          notify();
          return { success: false, reason: 'not_signed_in' };
        }
        const { data, error } = await supabaseClient
          .from('workspace_theme_preferences')
          .select('module, theme');
        if (error){
          console.error('Failed to load workspace theme preferences', error);
          return { success: false, reason: 'request_failed' };
        }
        const map = {};
        (data || []).forEach(row => {
          if (row && typeof row.module === 'string'){
            map[row.module] = normalizeTheme(row.theme);
          }
        });
        remote = map;
        notify();
        return { success: true, preferences: { ...map } };
      } catch (error){
        console.error('Unexpected error loading workspace theme preferences', error);
        return { success: false, reason: 'unexpected' };
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  function handleSessionChange(session){
    const nextUserId = session?.user?.id || null;
    lastSessionUserId = nextUserId;
    if (!nextUserId){
      remote = null;
      notify();
      return;
    }
    loadRemote();
  }

  function getModuleForPath(pathname){
    const normalizedPath = (pathname || window.location.pathname || '').toLowerCase();
    const module = MODULES.find(entry => (entry.paths || []).some(pattern => pattern.test(normalizedPath)));
    return module ? module.id : null;
  }

  function applyModuleTheme(moduleId){
    if (!moduleId) return;
    const theme = getPreference(moduleId);
    applySiteTheme(theme, false);
  }

  function isSignedIn(){
    return Boolean(lastSessionUserId);
  }

  return {
    MODULES,
    getPreference,
    subscribe,
    savePreference,
    loadRemote,
    handleSessionChange,
    getModuleForPath,
    applyModuleTheme,
    isSignedIn,
  };
}

function createWorkspaceVisibilityManager(){
  const STORAGE_KEY = 'SO_WORKSPACE_VISIBILITY_PREFS';
  const MODULES = Object.freeze([
    { id: 'script_writer', label: 'Screenplay Writing', paths: [/screenplay-writing/] },
    { id: 'storyboard', label: 'Storyboard', paths: [/storyboardpro/, /storyboard\//] },
    { id: 'character_studio', label: 'Character Studio', paths: [/characterstudio\./, /characterstudio/] },
    { id: 'set_design', label: 'Set Design', paths: [/set-design/] },
    { id: 'video_editing', label: 'Video & Editing', paths: [/videoediting/, /video-editing/] },
    { id: 'creative_hub', label: 'Creative Hub', paths: [/creative-hub/] },
  ]);
  const DEFAULTS = Object.freeze({
    script_writer: Object.freeze({
      scene_panel: false,
      workspace_tools: false,
      timeline: true,
    }),
    storyboard: Object.freeze({}),
    character_studio: Object.freeze({}),
    set_design: Object.freeze({}),
    video_editing: Object.freeze({}),
    creative_hub: Object.freeze({}),
  });

  let local = loadLocal();
  let remote = null;
  let loadingPromise = null;
  let lastSessionUserId = null;
  const listeners = new Set();

  function clonePreference(preference){
    try {
      return JSON.parse(JSON.stringify(preference));
    } catch (_error){
      return preference && typeof preference === 'object' ? { ...preference } : {};
    }
  }

  function getDefaultPreference(moduleId){
    const defaults = DEFAULTS[moduleId];
    return defaults ? clonePreference(defaults) : {};
  }

  function normalizePreference(moduleId, value){
    const defaults = getDefaultPreference(moduleId);
    const result = { ...defaults };
    const source = value && typeof value === 'object' ? value : {};
    Object.keys(source).forEach(key => {
      const sourceValue = source[key];
      if (typeof defaults[key] === 'boolean'){
        result[key] = Boolean(sourceValue);
      } else if (!(key in result)) {
        result[key] = sourceValue;
      } else {
        result[key] = sourceValue;
      }
    });
    return result;
  }

  function loadLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const map = {};
      Object.entries(parsed).forEach(([moduleId, preference]) => {
        map[moduleId] = normalizePreference(moduleId, preference);
      });
      return map;
    } catch (_error){
      return {};
    }
  }

  function persistLocal(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    } catch (_error){
      /* ignore */
    }
  }

  function getPreference(moduleId){
    if (!moduleId) return {};
    if (remote && remote[moduleId]){
      return clonePreference(normalizePreference(moduleId, remote[moduleId]));
    }
    if (local && local[moduleId]){
      return clonePreference(normalizePreference(moduleId, local[moduleId]));
    }
    return getDefaultPreference(moduleId);
  }

  function getSnapshot(){
    const snapshot = {};
    MODULES.forEach(module => {
      snapshot[module.id] = getPreference(module.id);
    });
    return snapshot;
  }

  function notify(){
    const snapshot = getSnapshot();
    listeners.forEach(listener => {
      try {
        listener(clonePreference(snapshot));
      } catch (error){
        console.error('Workspace visibility listener failed', error);
      }
    });
  }

  function subscribe(listener){
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    try {
      listener(getSnapshot());
    } catch (error){
      console.error('Workspace visibility subscriber threw on init', error);
    }
    return () => {
      listeners.delete(listener);
    };
  }

  function setLocalPreference(moduleId, preference){
    if (!moduleId) return {};
    const normalized = normalizePreference(moduleId, preference);
    local = { ...(local || {}), [moduleId]: normalized };
    persistLocal();
    return normalized;
  }

  function mergePreference(moduleId, updates){
    const current = getPreference(moduleId);
    const merged = { ...current, ...(updates && typeof updates === 'object' ? updates : {}) };
    return setLocalPreference(moduleId, merged);
  }

  async function savePreference(moduleId, updates){
    const merged = mergePreference(moduleId, updates);
    notify();
    const cloned = clonePreference(merged);
    if (!moduleId) return { success: false, reason: 'invalid_module', preference: cloned };
    if (!supabaseClient) return { success: false, reason: 'no_client', preference: cloned };
    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError){
        console.error('Failed to fetch Supabase session for workspace visibility preference', sessionError);
        return { success: false, reason: 'session_error', preference: cloned };
      }
      const user = sessionData?.session?.user;
      lastSessionUserId = user?.id || null;
      if (!user){
        return { success: false, reason: 'not_signed_in', preference: cloned };
      }
      const payload = {
        owner_id: user.id,
        module: moduleId,
        preferences: merged,
      };
      const { data, error } = await supabaseClient
        .from('workspace_visibility_preferences')
        .upsert(payload, { onConflict: 'owner_id,module' })
        .select('module, preferences')
        .maybeSingle();
      if (error){
        console.error('Failed to save workspace visibility preference', error);
        return { success: false, reason: 'request_failed', preference: cloned };
      }
      const savedModule = data?.module || moduleId;
      const savedPreference = normalizePreference(savedModule, data?.preferences || merged);
      remote = { ...(remote || {}), [savedModule]: savedPreference };
      notify();
      return { success: true, source: 'supabase', preference: clonePreference(savedPreference) };
    } catch (error){
      console.error('Unexpected error saving workspace visibility preference', error);
      return { success: false, reason: 'unexpected', preference: cloned };
    }
  }

  async function loadRemote(){
    if (!supabaseClient) return { success: false, reason: 'no_client' };
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError){
          console.error('Failed to fetch Supabase session for workspace visibility preferences', sessionError);
          return { success: false, reason: 'session_error' };
        }
        const user = sessionData?.session?.user;
        lastSessionUserId = user?.id || null;
        if (!user){
          remote = null;
          notify();
          return { success: false, reason: 'not_signed_in' };
        }
        const { data, error } = await supabaseClient
          .from('workspace_visibility_preferences')
          .select('module, preferences')
          .eq('owner_id', user.id);
        if (error){
          console.error('Failed to load workspace visibility preferences', error);
          return { success: false, reason: 'request_failed' };
        }
        const map = {};
        (data || []).forEach(row => {
          if (!row || typeof row !== 'object') return;
          const moduleId = row.module;
          if (!moduleId) return;
          map[moduleId] = normalizePreference(moduleId, row.preferences);
        });
        remote = map;
        notify();
        return { success: true, source: 'supabase' };
      } catch (error){
        console.error('Unexpected error loading workspace visibility preferences', error);
        return { success: false, reason: 'unexpected' };
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  function handleSessionChange(session){
    const nextUserId = session?.user?.id || null;
    if (nextUserId === lastSessionUserId) return;
    lastSessionUserId = nextUserId;
    if (!nextUserId){
      remote = null;
      notify();
      return;
    }
    loadRemote();
  }

  function getModuleForPath(pathname){
    const normalizedPath = (pathname || window.location.pathname || '').toLowerCase();
    const module = MODULES.find(entry => (entry.paths || []).some(pattern => pattern.test(normalizedPath)));
    return module ? module.id : null;
  }

  function isSignedIn(){
    return Boolean(lastSessionUserId);
  }

  return {
    MODULES,
    getPreference,
    getDefaultPreference,
    subscribe,
    savePreference,
    loadRemote,
    handleSessionChange,
    getModuleForPath,
    isSignedIn,
  };
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
          <p class="auth-portal__eyebrow">STUDIOORGANIZE</p>
          <h2 class="auth-portal__title" id="auth-portal-title">Sign in to your studio</h2>
          <p class="auth-portal__subtitle">Access the workspace, manage your subscription, and pick up where you left off.</p>
          <div class="auth-portal__tabs" role="tablist">
            <button type="button" class="auth-portal__tab" data-auth-tab="signin" role="tab" aria-selected="true">Sign in</button>
            <button type="button" class="auth-portal__tab" data-auth-tab="signup" role="tab" aria-selected="false">Create account</button>
          </div>
        </header>
        <div class="auth-portal__content">
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
        </div>
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

function handleAuthLinkIntent(link){
  if (!(link instanceof HTMLElement)) return;
  const normalizedText = (link.textContent || '').toLowerCase();
  const defaultIntent = normalizedText.includes('sign up') || normalizedText.includes('create') ? 'signup' : 'signin';
  const intent = link.dataset.authIntent || link.getAttribute('data-auth-switch') || defaultIntent;
  const initialView = intent === 'signup' ? 'signup' : 'signin';
  openAuthPortal(initialView);
  if (!supabaseClient){
    setAuthPortalMessage('Authentication is temporarily unavailable. Please try again later.', 'error');
  }
}

function bindAuthLinks(){
  if (!authLinks.length) return;
  authLinks.forEach(link => {
    if (!(link instanceof HTMLElement)) return;
    if (link.dataset.authLinkBound === 'true') return;
    link.dataset.authLinkBound = 'true';
    link.addEventListener('click', event => {
      event.preventDefault();
      handleAuthLinkIntent(link);
    });
  });
}

document.addEventListener('click', event => {
  if (event.defaultPrevented) return;
  const target = event.target instanceof HTMLElement ? event.target.closest('[data-auth-link]') : null;
  if (!target) return;
  event.preventDefault();
  handleAuthLinkIntent(target);
});

async function refreshAccountSession(){
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error){
      console.error('Failed to fetch Supabase session', error);
      return;
    }
    const session = data.session ?? null;
    if (navHasAuthControls){
      updateAccountUI(session);
    }
    workspaceThemes.handleSessionChange(session);
    workspaceVisibility.handleSessionChange(session);
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

if (supabaseClient){
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const resolvedSession = session ?? null;
    if (navHasAuthControls){
      updateAccountUI(resolvedSession);
    }
    workspaceThemes.handleSessionChange(resolvedSession);
    workspaceVisibility.handleSessionChange(resolvedSession);
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

function ensureNotificationModal(){
  if (document.querySelector('[data-notifications-modal]')) return;
  if (!(document.body instanceof HTMLElement)) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div
      class="notifications-modal"
      id="notificationsModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notificationsModalTitle"
      hidden
      data-notifications-modal
    >
      <div class="notifications-modal__overlay" data-notifications-overlay></div>
      <div class="notifications-modal__dialog" role="document">
        <header class="notifications-modal__header">
          <div>
            <h3 id="notificationsModalTitle">Notifications</h3>
            <p class="muted">Review your studio alerts and nudges from the AI coach.</p>
          </div>
          <button type="button" class="notifications-modal__close" aria-label="Close notifications" data-notifications-close>
            ×
          </button>
        </header>
        <ul class="creator-notifications__list">
          <li class="creator-notifications__item creator-notifications__item--alert" data-notification-item>
            <div class="creator-notifications__icon" aria-hidden="true">⏰</div>
            <div class="creator-notifications__content">
              <h4>Storyboard draft deadline passed</h4>
              <p>The "Episode 3 storyboard" milestone was due yesterday. Reschedule to keep your collaborators updated.</p>
              <button type="button" class="creator-notifications__action">Reschedule now</button>
            </div>
          </li>
          <li class="creator-notifications__item creator-notifications__item--coach" data-notification-item>
            <div class="creator-notifications__icon" aria-hidden="true">🤖</div>
            <div class="creator-notifications__content">
              <h4>StudioOrganize AI Coach</h4>
              <p>"Great consistency! Want a warm-up prompt for today's writing sprint?"</p>
              <div class="creator-notifications__actions">
                <button type="button" class="creator-notifications__action">Send prompt</button>
                <button type="button" class="creator-notifications__action creator-notifications__action--ghost">Remind me later</button>
              </div>
            </div>
          </li>
          <li class="creator-notifications__item" data-notification-item>
            <div class="creator-notifications__icon" aria-hidden="true">📌</div>
            <div class="creator-notifications__content">
              <h4>New reference board shared</h4>
              <p>Alex added a "Lighting moods" board to the Set Design workspace. Add your notes before Friday.</p>
              <button type="button" class="creator-notifications__action">Open board</button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `);
}

function initNotificationCenter(){
  ensureNotificationModal();

  const container = document.querySelector('[data-notifications]');
  const modal = document.querySelector('[data-notifications-modal]');
  if (!container || !(modal instanceof HTMLElement)) return;

  let toggle = container.querySelector('[data-notifications-toggle]');
  if (!(toggle instanceof HTMLElement) && container.hasAttribute('data-notifications-toggle')){
    toggle = container;
  }
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

const CREATIVE_HUB_ICON = '/assets/img/IMG_6896.webp';

const WORKSPACE_LAUNCHER_MODULES = [
  { href: '/use-cases/screenplay-writing.html', label: 'Screenplay Writing', image: '/assets/img/IMG_6892.webp' },
  { href: '/CharacterStudio.html', label: 'Character Studio', image: '/assets/img/IMG_6894.webp' },
  { href: '/use-cases/set-design.html', label: 'Set Design', image: '/assets/img/IMG_6903.webp' },
  { href: '/MusicStudio.html', label: 'Music Workspace', icon: 'music' },
  { href: '/StoryboardPro.html', label: 'Storyboard Pro', image: '/assets/img/IMG_6893.webp' },
  { href: '/VideoEditing.html', label: 'Video & Editing', image: '/assets/img/IMG_6893.webp' },
];

const WORKSPACE_SAVE_EVENT = 'studioorganize:save-requested';

function requestWorkspaceSave({ action = 'save', source = 'workspace-launcher', context = null } = {}){
  const pending = [];
  const detail = {
    action,
    source,
    context,
    handled: false,
    waitUntil(promise){
      if (!promise || typeof promise.then !== 'function') return;
      pending.push(Promise.resolve(promise));
    },
    markHandled(){
      detail.handled = true;
    }
  };

  document.dispatchEvent(new CustomEvent(WORKSPACE_SAVE_EVENT, { detail }));

  if (!pending.length){
    return Promise.resolve({ handled: detail.handled, success: false, results: [] });
  }

  return Promise.allSettled(pending).then(entries => {
    const results = entries.map(entry => entry.status === 'fulfilled'
      ? entry.value
      : { success: false, error: entry.reason });
    const success = results.some(result => result && typeof result === 'object' && result.success);
    const handled = detail.handled || pending.length > 0;
    return { handled, success, results };
  });
}

const SAVE_BUTTON_STATE_CLASSES = {
  saving: 'is-saving',
  success: 'is-success',
  error: 'is-error'
};

const SAVE_BUTTON_RESET_DELAYS = {
  success: 1600,
  error: 2200
};

const saveButtonResetTimers = new WeakMap();

function clearSaveButtonReset(button){
  if (!(button instanceof HTMLElement)) return;
  const existing = saveButtonResetTimers.get(button);
  if (typeof existing === 'number'){
    window.clearTimeout(existing);
    saveButtonResetTimers.delete(button);
  }
}

function setSaveButtonState(button, state){
  if (!(button instanceof HTMLElement)) return;
  clearSaveButtonReset(button);
  const normalized = state === 'saving' || state === 'success' || state === 'error' ? state : 'idle';
  Object.entries(SAVE_BUTTON_STATE_CLASSES).forEach(([, className]) => {
    button.classList.remove(className);
  });
  if (normalized === 'idle'){
    delete button.dataset.workspaceSaveState;
    button.disabled = false;
    return;
  }
  Object.entries(SAVE_BUTTON_STATE_CLASSES).forEach(([key, className]) => {
    button.classList.toggle(className, normalized === key);
  });
  button.dataset.workspaceSaveState = normalized;
  button.disabled = normalized !== 'error';
}

function scheduleSaveButtonReset(button, delay){
  if (!(button instanceof HTMLElement)) return;
  clearSaveButtonReset(button);
  const timeoutId = window.setTimeout(() => {
    setSaveButtonState(button, 'idle');
    saveButtonResetTimers.delete(button);
  }, typeof delay === 'number' ? delay : SAVE_BUTTON_RESET_DELAYS.success);
  saveButtonResetTimers.set(button, timeoutId);
}

async function evaluateSaveResponse(result){
  const entries = Array.isArray(result?.results) ? result.results : [];
  let anySuccess = Boolean(result && result.success);
  let requiresVerification = false;
  let verifiedSuccess = false;
  const verificationErrors = [];

  for (const entry of entries){
    if (!entry || typeof entry !== 'object') continue;
    if (entry.requiresVerification === true || typeof entry.verify === 'function'){
      requiresVerification = true;
    }
    if (entry.success){
      anySuccess = true;
      if (entry.verified === true || entry.confirmed === true){
        verifiedSuccess = true;
        continue;
      }
      if (entry.verified === false){
        verificationErrors.push(new Error('Save result reported verification failure.'));
        continue;
      }
      if (typeof entry.verify === 'function'){
        try {
          const verificationResult = await entry.verify();
          const normalized = typeof verificationResult === 'object' && verificationResult !== null
            ? verificationResult
            : { verified: Boolean(verificationResult) };
          if (normalized.verified === true || normalized.success === true){
            verifiedSuccess = true;
          } else {
            verificationErrors.push(new Error('Save verification returned a negative result.'));
          }
        } catch (error){
          verificationErrors.push(error);
        }
      }
    }
  }

  const verified = verifiedSuccess || (anySuccess && !requiresVerification);
  return { success: anySuccess, verified, requiresVerification, verificationErrors };
}

let workspaceLauncherObserver = null;
let workspaceLauncherObserverScheduled = false;

function scheduleWorkspaceLauncherRefresh(){
  if (workspaceLauncherObserverScheduled) return;
  workspaceLauncherObserverScheduled = true;
  Promise.resolve().then(() => {
    workspaceLauncherObserverScheduled = false;
    initWorkspaceLauncher({ fromObserver: true });
  });
}

function observeWorkspaceLaunchers(){
  if (workspaceLauncherObserver) return;
  if (!(document.body instanceof HTMLElement)){
    document.addEventListener('DOMContentLoaded', observeWorkspaceLaunchers, { once: true });
    return;
  }
  workspaceLauncherObserver = new MutationObserver(mutations => {
    for (const mutation of mutations){
      for (const node of mutation.addedNodes){
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('[data-workspace-launcher]') || node.querySelector('[data-workspace-launcher]')){
          scheduleWorkspaceLauncherRefresh();
          return;
        }
      }
    }
  });
  workspaceLauncherObserver.observe(document.body, { childList: true, subtree: true });
}

function renderWorkspaceModuleLink({ href, label, image, icon }){
  const safeLabel = typeof label === 'string' ? label : '';
  const safeAttr = safeLabel.replace(/"/g, '&quot;');
  const safeHref = typeof href === 'string' ? href : '#';
  const safeImage = typeof image === 'string' ? image : '/assets/img/studioorganize_mock.png';
  const iconMarkup = icon === 'music'
    ? '<span class="workspace-launcher__module-icon workspace-launcher__module-icon--music" aria-hidden="true"><span aria-hidden="true">🎵❤️</span></span>'
    : `<span class="workspace-launcher__module-icon" aria-hidden="true"><img src="${safeImage}" alt="" loading="lazy" /></span>`;
  return `
    <a class="workspace-launcher__module" href="${safeHref}" data-label="${safeAttr}">
      ${iconMarkup}
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

  let modules = panel.querySelector('.workspace-launcher__modules');
  if (!(modules instanceof HTMLElement)){
    modules = document.createElement('nav');
    modules.className = 'workspace-launcher__modules';
    modules.setAttribute('aria-label', 'Workspace modules');
    moduleStack.appendChild(modules);
  } else if (modules.parentElement !== moduleStack){
    moduleStack.appendChild(modules);
  }

  const ensureButton = (selector, html) => {
    let button = panel.querySelector(selector);
    if (!button){
      modules.insertAdjacentHTML('beforeend', html);
      button = panel.querySelector(selector);
    }
    return button instanceof HTMLElement ? button : null;
  };

  const saveButton = ensureButton('[data-workspace-save]', `
      <button type="button" class="workspace-launcher__module workspace-launcher__module--save" data-workspace-save data-label="Save Progress">
        <span class="workspace-launcher__module-icon" aria-hidden="true">
          <span class="workspace-launcher__save-dots" aria-hidden="true">
            <span class="workspace-launcher__save-dot"></span>
            <span class="workspace-launcher__save-dot"></span>
            <span class="workspace-launcher__save-dot"></span>
          </span>
          <span class="workspace-launcher__save-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </span>
          <span class="workspace-launcher__save-status workspace-launcher__save-status--success" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="5 13 9 17 19 7"></polyline>
            </svg>
          </span>
          <span class="workspace-launcher__save-status workspace-launcher__save-status--error" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="7" y1="7" x2="17" y2="17"></line>
              <line x1="17" y1="7" x2="7" y2="17"></line>
            </svg>
          </span>
        </span>
        <span class="workspace-launcher__module-label">SAVE</span>
        <span class="sr-only">Save Progress</span>
      </button>
    `);

  const storyButton = ensureButton('.workspace-launcher__module--story', `
      <button type="button" class="workspace-launcher__module workspace-launcher__module--story" data-workspace-script data-label="New Story">
        <span class="workspace-launcher__module-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </span>
        <span class="workspace-launcher__module-label">NEW</span>
        <span class="sr-only">New Story</span>
      </button>
    `);

  if (modules.querySelectorAll('a.workspace-launcher__module').length === 0){
    modules.insertAdjacentHTML('afterbegin', WORKSPACE_LAUNCHER_MODULES.map(renderWorkspaceModuleLink).join(''));
  }

  let assistantToggle = panel.querySelector('[data-workspace-assistant-toggle]');
  if (!(assistantToggle instanceof HTMLElement)){
    assistantToggle = document.createElement('button');
    assistantToggle.type = 'button';
    assistantToggle.className = 'workspace-launcher__module workspace-launcher__module--assistant';
    assistantToggle.setAttribute('data-workspace-assistant-toggle', '');
    assistantToggle.setAttribute('data-label', 'Assistant');
  }
  assistantToggle.innerHTML = `
    <span class="workspace-launcher__module-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </span>
    <span class="workspace-launcher__module-label">ASSISTANT</span>
    <span class="sr-only">Open StudioOrganize Assistant</span>
  `;
  assistantToggle.setAttribute('aria-pressed', assistantToggle.getAttribute('aria-pressed') === 'true' ? 'true' : 'false');
  assistantToggle.setAttribute('aria-expanded', assistantToggle.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
  assistantToggle.setAttribute('aria-label', 'Open StudioOrganize Assistant');

  let quickActions = panel.querySelector('.workspace-launcher__quick-actions');
  if (!(quickActions instanceof HTMLElement)){
    quickActions = document.createElement('div');
    quickActions.className = 'workspace-launcher__quick-actions';
    quickActions.innerHTML = `
      <p class="workspace-launcher__quick-actions-label">Quick actions</p>
      <div class="workspace-launcher__quick-actions-buttons" role="group" aria-label="Workspace quick actions"></div>
    `;
  }
  if (quickActions.parentElement !== panel){
    panel.insertBefore(quickActions, moduleStack);
  } else if (panel.firstElementChild !== quickActions){
    panel.insertBefore(quickActions, moduleStack);
  }

  let quickActionsGroup = quickActions.querySelector('.workspace-launcher__quick-actions-buttons');
  if (!(quickActionsGroup instanceof HTMLElement)){
    quickActionsGroup = document.createElement('div');
    quickActionsGroup.className = 'workspace-launcher__quick-actions-buttons';
    quickActionsGroup.setAttribute('role', 'group');
    quickActionsGroup.setAttribute('aria-label', 'Workspace quick actions');
    quickActions.appendChild(quickActionsGroup);
  }

  let scriptButton = quickActionsGroup.querySelector('.workspace-launcher__script[data-workspace-script]');
  if (!(scriptButton instanceof HTMLElement)){
    scriptButton = document.createElement('button');
    scriptButton.type = 'button';
    scriptButton.className = 'workspace-launcher__script';
    scriptButton.setAttribute('data-workspace-script', '');
  }
  scriptButton.setAttribute('aria-label', 'Story');
  scriptButton.innerHTML = `
    <span class="workspace-launcher__script-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    </span>
    <span class="workspace-launcher__script-label">STORY</span>
    <span class="sr-only">Story</span>
  `;

  let creatorLink = quickActionsGroup.querySelector('.workspace-launcher__creator');
  if (!(creatorLink instanceof HTMLElement)){
    creatorLink = document.createElement('a');
    creatorLink.className = 'workspace-launcher__script workspace-launcher__creator';
    creatorLink.setAttribute('href', '/account.html');
    creatorLink.setAttribute('aria-label', 'Creator Page');
  }
  creatorLink.innerHTML = `
    <span class="workspace-launcher__script-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    </span>
    <span class="workspace-launcher__script-label">CREATOR</span>
    <span class="sr-only">Creator Page</span>
  `;

  let creativeHubLink = quickActionsGroup.querySelector('.workspace-launcher__module--creative-hub');
  if (!(creativeHubLink instanceof HTMLElement)){
    creativeHubLink = document.createElement('a');
    creativeHubLink.className = 'workspace-launcher__module workspace-launcher__module--creative-hub';
    creativeHubLink.setAttribute('href', '/creative-hub.html');
    creativeHubLink.setAttribute('data-label', 'Creative Hub');
  }
  creativeHubLink.setAttribute('aria-label', 'Creative Hub');
  creativeHubLink.innerHTML = `
    <span class="workspace-launcher__module-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
    </span>
    <span class="workspace-launcher__module-label">HUB</span>
    <span class="sr-only">Creative Hub</span>
  `;

  let videoLessonsButton = quickActionsGroup.querySelector('[data-video-lessons-open]');
  if (!(videoLessonsButton instanceof HTMLElement)){
    videoLessonsButton = document.createElement('button');
    videoLessonsButton.type = 'button';
    videoLessonsButton.className = 'workspace-launcher__module workspace-launcher__module--lessons';
    videoLessonsButton.setAttribute('data-video-lessons-open', '');
    videoLessonsButton.setAttribute('data-label', 'Video Lessons');
  }
  videoLessonsButton.setAttribute('aria-label', 'Open video lesson library');
  videoLessonsButton.innerHTML = `
    <span class="workspace-launcher__module-icon workspace-launcher__module-icon--lessons" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    </span>
    <span class="workspace-launcher__module-label">LESSONS</span>
    <span class="sr-only">Open video lesson library</span>
  `;

  let musicButton = quickActionsGroup.querySelector('[data-music-library-open]');
  if (!(musicButton instanceof HTMLElement)){
    musicButton = document.createElement('button');
    musicButton.type = 'button';
    musicButton.className = 'workspace-launcher__module workspace-launcher__module--music-note';
    musicButton.setAttribute('data-music-library-open', '');
    musicButton.setAttribute('data-label', 'Create with Music');
  }
  musicButton.setAttribute('aria-label', 'Open Create with Music');
  musicButton.innerHTML = `
    <span class="workspace-launcher__module-icon workspace-launcher__module-icon--music-note" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
      </svg>
    </span>
    <span class="workspace-launcher__module-label">MUSIC</span>
    <span class="sr-only">Open Create with Music</span>
  `;

  let notificationsButton = quickActionsGroup.querySelector('[data-notifications-toggle]');
  if (!(notificationsButton instanceof HTMLElement)){
    notificationsButton = document.createElement('button');
    notificationsButton.type = 'button';
    notificationsButton.className = 'workspace-launcher__module workspace-launcher__module--notifications';
    notificationsButton.setAttribute('data-notifications', '');
    notificationsButton.setAttribute('data-notifications-toggle', '');
  }
  notificationsButton.setAttribute('aria-haspopup', 'dialog');
  notificationsButton.setAttribute('aria-expanded', 'false');
  notificationsButton.setAttribute('aria-controls', 'notificationsModal');
  notificationsButton.innerHTML = `
    <span class="workspace-launcher__module-icon" aria-hidden="true">
      <span class="workspace-launcher__notifications-icon" aria-hidden="true">✉️</span>
      <span class="notifications-toggle__badge is-empty" data-notifications-count></span>
    </span>
    <span class="workspace-launcher__module-label">ALERTS</span>
    <span class="sr-only" data-notifications-label>Open notifications</span>
  `;

  // Create auth/theme combined button
  let authThemeButton = quickActionsGroup.querySelector('.workspace-launcher__auth-theme');
  if (!(authThemeButton instanceof HTMLElement)){
    authThemeButton = document.createElement('button');
    authThemeButton.type = 'button';
    authThemeButton.className = 'workspace-launcher__auth-theme';
    authThemeButton.setAttribute('data-auth-theme-toggle', '');
  }
  authThemeButton.setAttribute('aria-label', 'Sign In / Theme');
  authThemeButton.innerHTML = `
    <span class="workspace-launcher__auth-theme-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    </span>
    <span class="workspace-launcher__auth-theme-label">SIGN IN</span>
    <span class="sr-only">Sign In / Theme</span>
  `;

  // Clear previous content
  quickActionsGroup.innerHTML = '';

  // Add buttons in rows
  // First row with regular buttons
  [
    scriptButton,
    creatorLink,
    creativeHubLink,
    videoLessonsButton,
    musicButton,
    notificationsButton,
    saveButton,
    storyButton
  ].forEach(button => {
    if (button instanceof HTMLElement){
      quickActionsGroup.appendChild(button);
    }
  });

  // Second row with 50% width buttons (Assistant and Auth/Theme)
  const bottomRow = document.createElement('div');
  bottomRow.className = 'workspace-launcher__quick-actions-row workspace-launcher__quick-actions-row--full';
  if (assistantToggle instanceof HTMLElement){
    bottomRow.appendChild(assistantToggle);
  }
  if (authThemeButton instanceof HTMLElement){
    bottomRow.appendChild(authThemeButton);
  }
  quickActionsGroup.appendChild(bottomRow);

  const legacyActions = panel.querySelector('.workspace-launcher__actions');
  if (legacyActions instanceof HTMLElement && legacyActions !== quickActions){
    legacyActions.remove();
  }

  const chatBubble = launcher.querySelector('.workspace-launcher__chat-bubble');
  if (chatBubble instanceof HTMLElement){
    let chatHeader = chatBubble.querySelector('.workspace-launcher__chat-header');
    if (!(chatHeader instanceof HTMLElement)){
      chatHeader = document.createElement('div');
      chatHeader.className = 'workspace-launcher__chat-header';
      chatHeader.innerHTML = `
        <div class="workspace-launcher__chat-avatar" aria-hidden="true"></div>
        <div class="workspace-launcher__chat-meta">
          <p class="workspace-launcher__chat-name">StudioOrganize AI</p>
          <p class="workspace-launcher__chat-role">Director in your corner</p>
        </div>
      `;
      chatBubble.prepend(chatHeader);
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
      <div class="workspace-launcher__quick-actions">
        <p class="workspace-launcher__quick-actions-label">Quick actions</p>
        <div class="workspace-launcher__quick-actions-buttons" role="group" aria-label="Workspace quick actions">
          <button type="button" class="workspace-launcher__script" data-workspace-script aria-label="Story">
            <span class="workspace-launcher__script-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </span>
            <span class="workspace-launcher__script-label">STORY</span>
            <span class="sr-only">Story</span>
          </button>
          <a class="workspace-launcher__script workspace-launcher__creator" href="/account.html" aria-label="Creator Page">
            <span class="workspace-launcher__script-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <span class="workspace-launcher__script-label">CREATOR</span>
            <span class="sr-only">Creator Page</span>
          </a>
          <a class="workspace-launcher__module workspace-launcher__module--creative-hub" href="/creative-hub.html" data-label="Creative Hub" aria-label="Creative Hub">
            <span class="workspace-launcher__module-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </span>
            <span class="workspace-launcher__module-label">HUB</span>
            <span class="sr-only">Creative Hub</span>
          </a>
          <button type="button" class="workspace-launcher__module workspace-launcher__module--lessons" data-video-lessons-open data-label="Video Lessons" aria-label="Open video lesson library">
            <span class="workspace-launcher__module-icon workspace-launcher__module-icon--lessons" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </span>
            <span class="workspace-launcher__module-label">LESSONS</span>
            <span class="sr-only">Open video lesson library</span>
          </button>
          <button type="button" class="workspace-launcher__module workspace-launcher__module--music-note" data-music-library-open data-label="Create with Music" aria-label="Open Create with Music">
            <span class="workspace-launcher__module-icon workspace-launcher__module-icon--music-note" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </span>
            <span class="workspace-launcher__module-label">MUSIC</span>
            <span class="sr-only">Open Create with Music</span>
          </button>
          <button type="button" class="workspace-launcher__module workspace-launcher__module--notifications" data-notifications data-notifications-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="notificationsModal">
            <span class="workspace-launcher__module-icon" aria-hidden="true">
              <span class="workspace-launcher__notifications-icon" aria-hidden="true">✉️</span>
              <span class="notifications-toggle__badge is-empty" data-notifications-count></span>
            </span>
            <span class="workspace-launcher__module-label">ALERTS</span>
            <span class="sr-only" data-notifications-label>Open notifications</span>
          </button>
          <button type="button" class="workspace-launcher__module workspace-launcher__module--assistant" data-workspace-assistant-toggle data-label="Assistant" aria-pressed="false" aria-expanded="false" aria-label="Open StudioOrganize Assistant">
            <span class="workspace-launcher__module-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </span>
            <span class="workspace-launcher__module-label">ASSISTANT</span>
            <span class="sr-only">Open StudioOrganize Assistant</span>
            </button>
            <button type="button" class="workspace-launcher__module workspace-launcher__module--save" data-workspace-save data-label="Save Progress">
              <span class="workspace-launcher__module-icon" aria-hidden="true">
                <span class="workspace-launcher__save-dots" aria-hidden="true">
                  <span class="workspace-launcher__save-dot"></span>
                  <span class="workspace-launcher__save-dot"></span>
                  <span class="workspace-launcher__save-dot"></span>
                </span>
                <span class="workspace-launcher__save-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                </span>
                <span class="workspace-launcher__save-status workspace-launcher__save-status--success" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="5 13 9 17 19 7"></polyline>
                  </svg>
                </span>
                <span class="workspace-launcher__save-status workspace-launcher__save-status--error" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="7" y1="7" x2="17" y2="17"></line>
                    <line x1="17" y1="7" x2="7" y2="17"></line>
                  </svg>
                </span>
              </span>
              <span class="workspace-launcher__module-label">SAVE</span>
              <span class="sr-only">Save Progress</span>
            </button>
            <button type="button" class="workspace-launcher__module workspace-launcher__module--story" data-workspace-script data-label="New Story">
              <span class="workspace-launcher__module-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </span>
              <span class="workspace-launcher__module-label">NEW</span>
              <span class="sr-only">New Story</span>
            </button>
          </div>
        </div>
        <div class="workspace-launcher__module-stack">
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

function initWorkspaceLauncher({ fromObserver = false } = {}){
  if (!fromObserver){
    observeWorkspaceLaunchers();
  }

  const launchers = Array.from(document.querySelectorAll('[data-workspace-launcher]'));
  if (!launchers.length){
    if (!fromObserver){
      injectGlobalWorkspaceLauncher();
      initWorkspaceLauncher({ fromObserver: true });
    }
    return;
  }

  const globalLaunchers = launchers.filter(launcher => launcher.hasAttribute('data-global-workspace-launcher'));
  const customLaunchers = launchers.filter(launcher => !launcher.hasAttribute('data-global-workspace-launcher'));
  if (customLaunchers.length && globalLaunchers.length){
    globalLaunchers.forEach(launcher => {
      if (launcher instanceof HTMLElement){
        launcher.remove();
      }
    });
    initWorkspaceLauncher({ fromObserver: true });
    return;
  }

  const OPEN_CLASS = 'workspace-launcher--open';
  const CHAT_VISIBLE_CLASS = 'workspace-launcher__chat--visible';
  const CLOSE_TIMEOUT = 280;
  const CHAT_TIMEOUT = 260;

  const getChatBubble = launcher => {
    return launcher.querySelector('[data-workspace-chat]');
  };

  const dockChatBubble = launcher => {
    const chat = getChatBubble(launcher);
    if (!(chat instanceof HTMLElement)) return;
    const panel = launcher.querySelector('[data-workspace-panel]');
    if (!(panel instanceof HTMLElement)) return;
    const quickActions = panel.querySelector('.workspace-launcher__quick-actions');
    if (!(quickActions instanceof HTMLElement)) return;

    const label = quickActions.querySelector('.workspace-launcher__quick-actions-label');
    if (chat.parentElement !== quickActions){
      if (label instanceof HTMLElement){
        quickActions.insertBefore(chat, label);
      } else {
        quickActions.prepend(chat);
      }
    }

    chat.classList.add('workspace-launcher__chat--docked');
  };

  const getChatInput = launcher => {
    return launcher.querySelector('[data-workspace-chat-input]');
  };

  const getAssistantToggle = launcher => {
    return launcher.querySelector('[data-workspace-assistant-toggle]');
  };

  const getAssistant = launcher => {
    return launcher.querySelector('.workspace-launcher__assistant');
  };

  const updateAssistantToggleState = launcher => {
    const assistantToggle = getAssistantToggle(launcher);
    if (!(assistantToggle instanceof HTMLElement)) return;
    const assistant = getAssistant(launcher);
    const chat = getChatBubble(launcher);
    const assistantVisible = assistant instanceof HTMLElement && !assistant.hidden;
    const chatVisible = chat instanceof HTMLElement && !chat.hidden && chat.classList.contains(CHAT_VISIBLE_CLASS);
    const isVisible = assistantVisible || chatVisible;
    assistantToggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
    assistantToggle.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
    assistantToggle.setAttribute('aria-label', isVisible ? 'Close StudioOrganize Assistant' : 'Open StudioOrganize Assistant');
  };

  const showChatBubble = (launcher, { focusInput = true } = {}) => {
    dockChatBubble(launcher);
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
    updateAssistantToggleState(launcher);

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
    updateAssistantToggleState(launcher);
  };

  const showAssistant = (launcher, { revealChat = true, focusInput = true } = {}) => {
    const assistant = getAssistant(launcher);
    if (!(assistant instanceof HTMLElement)){
      if (revealChat){
        showChatBubble(launcher, { focusInput });
      } else {
        updateAssistantToggleState(launcher);
      }
      return;
    }

    if (assistant.hidden){
      assistant.hidden = false;
    }
    assistant.setAttribute('aria-hidden', 'false');

    if (revealChat){
      showChatBubble(launcher, { focusInput });
    } else {
      updateAssistantToggleState(launcher);
    }
  };

  const hideAssistant = launcher => {
    const assistant = getAssistant(launcher);
    if (!(assistant instanceof HTMLElement)){
      hideChatBubble(launcher);
      updateAssistantToggleState(launcher);
      return;
    }

    hideChatBubble(launcher);

    if (!assistant.hidden){
      assistant.hidden = true;
    }
    assistant.setAttribute('aria-hidden', 'true');
    updateAssistantToggleState(launcher);
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
    hideAssistant(launcher);

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
      showAssistant(launcher);
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
        openLauncher(launcher, { focusPanel: shouldFocusPanel, revealChat: false });
      }
    });

    const assistantToggle = getAssistantToggle(launcher);
    if (assistantToggle instanceof HTMLElement && assistantToggle.dataset.workspaceAssistantBound !== 'true'){
      assistantToggle.dataset.workspaceAssistantBound = 'true';
      assistantToggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const assistant = getAssistant(launcher);
        const chat = getChatBubble(launcher);
        const assistantVisible = assistant instanceof HTMLElement && !assistant.hidden;
        const chatVisible = chat instanceof HTMLElement && !chat.hidden && chat.classList.contains(CHAT_VISIBLE_CLASS);
        const isVisible = assistantVisible || chatVisible;

        if (!launcher.classList.contains(OPEN_CLASS)){
          closeAll(launcher);
          openLauncher(launcher, { focusPanel: false, revealChat: false });
        }

        if (!isVisible){
          showAssistant(launcher, { revealChat: true, focusInput: false });
          return;
        }

        if (!chatVisible){
          showChatBubble(launcher, { focusInput: false });
          return;
        }

        hideAssistant(launcher);
      });
    }

    updateAssistantToggleState(launcher);

    // Auth/Theme button handler
    const authThemeButton = panel.querySelector('[data-auth-theme-toggle]');
    if (authThemeButton instanceof HTMLElement && authThemeButton.dataset.authThemeBound !== 'true'){
      authThemeButton.dataset.authThemeBound = 'true';
      
      // Helper function to check if user is signed in
      const isUserSignedIn = () => {
        const accountMenu = document.querySelector('[data-account-menu]');
        return accountMenu && !accountMenu.hidden;
      };
      
      // Update button based on auth state
      const updateAuthThemeButton = () => {
        const isSignedIn = isUserSignedIn();
        
        if (isSignedIn){
          // Show theme toggle when signed in
          const currentTheme = document.documentElement.dataset.theme || 'dark';
          const themeIcon = currentTheme === 'dark' 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
          authThemeButton.innerHTML = `
            <span class="workspace-launcher__auth-theme-icon" aria-hidden="true">
              ${themeIcon}
            </span>
            <span class="workspace-launcher__auth-theme-label">THEME</span>
            <span class="sr-only">Toggle theme</span>
          `;
        } else {
          // Show sign in when not signed in
          authThemeButton.innerHTML = `
            <span class="workspace-launcher__auth-theme-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <span class="workspace-launcher__auth-theme-label">SIGN IN</span>
            <span class="sr-only">Sign In</span>
          `;
        }
      };
      
      updateAuthThemeButton();
      
      // Listen for auth state changes
      document.addEventListener('studioorganize:auth-state-changed', updateAuthThemeButton);
      
      authThemeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        
        const isSignedIn = isUserSignedIn();
        
        if (isSignedIn){
          // Toggle theme when signed in
          const currentTheme = document.documentElement.dataset.theme || 'dark';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          if (typeof window.setSiteTheme === 'function'){
            window.setSiteTheme(newTheme);
          }
          updateAuthThemeButton();
        } else {
          // Open sign in when not signed in
          const authLink = document.querySelector('[data-auth-link]');
          if (authLink instanceof HTMLElement){
            authLink.click();
          }
        }
      });
    }

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
      if (event.target.closest('[data-workspace-save]')) return;
      event.stopPropagation();
    });

    const scriptButton = panel.querySelector('[data-workspace-script]');
    if (scriptButton instanceof HTMLElement && scriptButton.dataset.workspaceScriptBound !== 'true'){
      scriptButton.dataset.workspaceScriptBound = 'true';
      scriptButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        console.log('[Workspace] STORY button clicked');
        closeAll();

        const dialog = document.getElementById('scriptDialog');
        const overlayOpen = document.documentElement.classList.contains('script-dialog-overlay-open');
        const hasInlineDialog = dialog instanceof HTMLElement;
        const inlineOpen = hasInlineDialog && dialog.classList.contains('open');

        console.log('[Workspace] Script dialog state:', {
          hasOpenFunction: typeof window.openScriptDialog === 'function',
          hasInlineDialog,
          inlineOpen,
          overlayOpen
        });

        if (typeof window.openScriptDialog === 'function'){
          if (hasInlineDialog){
            console.log('[Workspace] Using inline dialog');
            if (inlineOpen && typeof window.closeScriptDialog === 'function'){
              console.log('[Workspace] Closing inline dialog');
              window.closeScriptDialog();
              return;
            }
            console.log('[Workspace] Opening inline dialog');
            window.openScriptDialog();
            return;
          }
          if (!overlayOpen){
            console.log('[Workspace] Opening overlay dialog');
            window.openScriptDialog();
          } else {
            console.log('[Workspace] Overlay already open');
          }
        } else {
          console.log('[Workspace] No openScriptDialog function, redirecting to screenplay-writing.html');
          window.location.href = '/use-cases/screenplay-writing.html';
        }
      });
    }

    const saveButton = panel.querySelector('[data-workspace-save]');
    if (saveButton instanceof HTMLElement && saveButton.dataset.workspaceSaveBound !== 'true'){
      saveButton.dataset.workspaceSaveBound = 'true';
      saveButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (saveButton.dataset.workspaceSaveState === 'saving') return;

        setSaveButtonState(saveButton, 'saving');

        try {
          const result = await requestWorkspaceSave({
            source: 'workspace-launcher',
            action: 'save',
            context: { launcherId: launcher.id || null }
          });

          if (!result.handled){
            alert('Open a workspace to save your progress.');
            setSaveButtonState(saveButton, 'idle');
            return;
          }

          const evaluation = await evaluateSaveResponse(result);
          if (!evaluation.success){
            console.warn('Workspace save request completed without a success response.', result);
            setSaveButtonState(saveButton, 'error');
            scheduleSaveButtonReset(saveButton, SAVE_BUTTON_RESET_DELAYS.error);
            return;
          }

          if (!evaluation.verified){
            if (evaluation.requiresVerification){
              if (evaluation.verificationErrors.length){
                evaluation.verificationErrors.forEach(error => console.error('Workspace save verification error', error));
              }
              console.error('Workspace save verification failed.', result);
              alert('We couldn’t confirm your save reached the cloud. Please try again.');
              setSaveButtonState(saveButton, 'error');
              scheduleSaveButtonReset(saveButton, SAVE_BUTTON_RESET_DELAYS.error);
              return;
            }
          }

          setSaveButtonState(saveButton, 'success');
          scheduleSaveButtonReset(saveButton, SAVE_BUTTON_RESET_DELAYS.success);
        } catch (error){
          console.error('Workspace save request failed', error);
          alert('Saving your workspace failed. Please try again.');
          setSaveButtonState(saveButton, 'error');
          scheduleSaveButtonReset(saveButton, SAVE_BUTTON_RESET_DELAYS.error);
        }
      });
    }

    const videoLessonsButton = panel.querySelector('[data-video-lessons-open]');
    if (videoLessonsButton instanceof HTMLElement && videoLessonsButton.dataset.videoLessonsBound !== 'true'){
      videoLessonsButton.dataset.videoLessonsBound = 'true';
      videoLessonsButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        closeAll();

        if (typeof window.openVideoLessonDialog === 'function'){
          window.openVideoLessonDialog();
        }
      });
    }

    const musicButton = panel.querySelector('[data-music-library-open]');
    if (musicButton instanceof HTMLElement && musicButton.dataset.musicLibraryBound !== 'true'){
      musicButton.dataset.musicLibraryBound = 'true';
      musicButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeAll();
        if (typeof window.openMusicMoodOverlay === 'function'){
          window.openMusicMoodOverlay();
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

// Stuff Menu - Mobile only circular menu
const STUFF_MENU_PAGE_ITEMS = [
  {
    match: 'screenplay-writing.html',
    items: [
      { label: 'Timelines', action: () => console.log('Timelines clicked') },
      { label: 'Scene', action: () => console.log('Scene clicked') },
      { label: 'Visual', action: () => console.log('Visual clicked') },
      { label: 'Cast', action: () => console.log('Cast clicked') },
      { label: 'Set', action: () => console.log('Set clicked') },
      { label: 'Sound', action: () => console.log('Sound clicked') },
      { label: 'Notes', action: () => console.log('Notes clicked') },
      { label: 'Ai', action: () => console.log('Ai clicked') },
    ]
  },
  {
    match: 'CharacterStudio.html',
    items: [
      { label: 'FinishThatStory', action: () => console.log('FinishThatStory clicked') },
      { label: 'QuickStart Dialog', action: () => console.log('QuickStart Dialog clicked') },
    ]
  },
  {
    match: 'StoryboardPro.html',
    items: [
      { label: 'Timeline', action: () => console.log('Timeline clicked') },
      { label: 'Placeholder', action: () => console.log('Placeholder clicked') },
      { label: 'Ai Settings', action: () => console.log('Ai Settings clicked') },
    ]
  },
  {
    match: 'VideoEditing.html',
    items: [
      { label: 'Video Ai Settings', action: () => console.log('Video Ai Settings clicked') },
      { label: 'Placeholder', action: () => console.log('Placeholder clicked') },
    ]
  }
];

function resolveStuffMenuItems(pathname){
  for (const entry of STUFF_MENU_PAGE_ITEMS){
    if (pathname.includes(entry.match)){
      return entry.items;
    }
  }
  return null;
}

function syncStuffMenuIcon(toggle){
  if (!toggle) return;

  const activeModuleIcon = document.querySelector('.workspace-launcher__module--active .workspace-launcher__module-icon');

  if (activeModuleIcon){
    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'stuff-menu__toggle-icon';
    iconWrapper.innerHTML = activeModuleIcon.innerHTML;

    toggle.innerHTML = '';
    toggle.appendChild(iconWrapper);
    toggle.classList.add('stuff-menu__toggle--with-image');
    return;
  }

  toggle.textContent = '⚡';
  toggle.classList.remove('stuff-menu__toggle--with-image');
}

function createStuffMenu(menuItems){
  const container = document.createElement('div');
  container.className = 'stuff-menu';
  container.setAttribute('data-stuff-menu', '');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'stuff-menu__toggle';
  toggle.setAttribute('aria-label', 'Stuff menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '⚡';

  const panel = document.createElement('div');
  panel.className = 'stuff-menu__panel';
  panel.setAttribute('hidden', '');
  panel.setAttribute('aria-hidden', 'true');

  const items = document.createElement('div');
  items.className = 'stuff-menu__items';

  menuItems.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stuff-menu__item';
    button.setAttribute('aria-label', item.label);
    button.setAttribute('data-stuff-menu-index', String(index));
    button.textContent = item.label;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (typeof item.action === 'function'){
        item.action();
      }
    });
    items.appendChild(button);
  });

  panel.appendChild(items);
  container.appendChild(toggle);
  container.appendChild(panel);

  syncStuffMenuIcon(toggle);

  const workspaceLauncher = document.querySelector('[data-workspace-launcher]');
  if (workspaceLauncher && typeof MutationObserver !== 'undefined'){
    const observer = new MutationObserver(() => syncStuffMenuIcon(toggle));
    observer.observe(workspaceLauncher, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  let isOpen = false;

  const openMenu = () => {
    if (isOpen) return;
    isOpen = true;
    container.classList.add('stuff-menu--open');
    toggle.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
  };

  const closeMenu = () => {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('stuff-menu--open');
    toggle.setAttribute('aria-expanded', 'false');
    panel.setAttribute('hidden', '');
    panel.setAttribute('aria-hidden', 'true');
  };

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', event => {
    if (isOpen && !container.contains(event.target)){
      closeMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen){
      closeMenu();
    }
  });

  return container;
}

function initStuffMenu(){
  const currentPath = window.location.pathname;
  const pageItems = resolveStuffMenuItems(currentPath);

  if (!pageItems || pageItems.length === 0) return;

  // Check if stuff menu already exists
  if (document.querySelector('[data-stuff-menu]')) return;

  // Create and append stuff menu
  const stuffMenu = createStuffMenu(pageItems);
  document.body.appendChild(stuffMenu);
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
    const alreadyBound = continueLink.dataset.constructionOverlayBound === 'true';
    if (!alreadyBound){
      continueLink.dataset.constructionOverlayBound = 'true';
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
  }

  if (overlay.dataset.constructionOverlayKeydownBound !== 'true'){
    overlay.dataset.constructionOverlayKeydownBound = 'true';
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape'){
        markConstructionDismissed();
        hideOverlay();
      }
    });
  }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => {
    initWorkspaceLauncher();
    initStuffMenu();
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
  initStuffMenu();
  initDropdownMenus();
  initNotificationCenter();
  initMobileAppExperience();
  initQuestionnaireModal();
  initGoalPlanner();
  initFinishStoryModal();
  initConstructionOverlay();
}

// Global fallback handler for save requests on pages without specific workspace handlers
// This ensures the save button always provides feedback even if no workspace handles the event
let workspaceSaveFallbackTimeout = null;
document.addEventListener('studioorganize:save-requested', event => {
  const detail = event?.detail;
  if (!detail) return;
  
  // Wait a bit to see if any workspace handler claims this save request
  if (workspaceSaveFallbackTimeout){
    clearTimeout(workspaceSaveFallbackTimeout);
  }
  
  workspaceSaveFallbackTimeout = setTimeout(() => {
    // If no workspace has handled the save request, provide fallback feedback
    if (!detail.handled){
      console.log('No workspace handler responded to save request. Showing fallback message.');
      
      // Try to show user feedback if possible
      const notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#333;color:#fff;padding:12px 20px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      notification.textContent = 'Nothing to save on this page. Open a workspace to create content.';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
  }, 100);
});
