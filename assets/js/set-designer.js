const STORAGE_KEY = 'so-set-designer';

class SetDesignerApp {
  constructor(root) {
    this.root = root;
    if (!this.root) return;

    this.variationPresets = [
      {
        label: 'Wide master board',
        addon: '| wide cinematic master establishing shot, production design render, ultra-detailed, volumetric lighting'
      },
      {
        label: 'Elevation & layout',
        addon: '| orthographic elevation, set blueprint overlay, architectural detailing, production drafting style'
      },
      {
        label: 'Prop dressing detail',
        addon: '| hero prop styling board on worktable, materials and texture close-up, cinematic macro photography'
      },
      {
        label: 'Lighting & mood study',
        addon: '| dramatic lighting study, colored gels, atmosphere haze, cinematic film still'
      },
      {
        label: 'Alternate beat exploration',
        addon: '| alternate camera angle, dynamic action beat, storyboard ready, high energy composition'
      }
    ];

    this.sceneForm = this.root.querySelector('[data-scene-form]');
    this.sceneList = this.root.querySelector('[data-scene-list]');
    this.resetButton = this.root.querySelector('[data-reset-designer]');
    this.builderEmptyState = this.root.querySelector('[data-builder-empty]');
    this.builderContent = this.root.querySelector('[data-builder-content]');
    this.activeSceneName = this.root.querySelector('[data-active-scene-name]');
    this.setForm = this.root.querySelector('[data-set-form]');
    this.libraryEmptyState = this.root.querySelector('[data-library-empty]');
    this.setList = this.root.querySelector('[data-set-list]');
    this.exportBlock = this.root.querySelector('[data-export-block]');
    this.exportButton = this.root.querySelector('[data-export-json]');
    this.copyButton = this.root.querySelector('[data-copy-export]');
    this.downloadButton = this.root.querySelector('[data-download-export]');
    this.exportOutput = this.root.querySelector('[data-export-output]');

    const stored = this.loadState();
    this.state = stored.state || { scenes: [] };
    this.activeSceneId = stored.activeSceneId ?? (this.state.scenes[0]?.id ?? null);

    this.bindEvents();
    this.renderScenes();
    this.renderActiveScene();
  }

  bindEvents() {
    if (this.sceneForm) {
      this.sceneForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(this.sceneForm);
        const title = (data.get('title') || '').trim();
        if (!title) {
          this.sceneForm.querySelector('input[name="title"]').focus();
          return;
        }
        const scene = {
          id: this.uuid(),
          title,
          storyboard: (data.get('storyboard') || '').trim(),
          brief: (data.get('brief') || '').trim(),
          createdAt: new Date().toISOString(),
          sets: []
        };
        this.state.scenes.unshift(scene);
        this.activeSceneId = scene.id;
        this.sceneForm.reset();
        this.persistState();
        this.renderScenes();
        this.renderActiveScene();
      });
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        if (!this.state.scenes.length) return;
        const confirmation = window.confirm('Clear all scenes, sets, and generated references?');
        if (!confirmation) return;
        this.state = { scenes: [] };
        this.activeSceneId = null;
        this.persistState();
        this.renderScenes();
        this.renderActiveScene();
      });
    }

    if (this.sceneList) {
      this.sceneList.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('[data-scene-delete]');
        if (deleteButton) {
          const id = deleteButton.getAttribute('data-scene-delete');
          this.removeScene(id);
          return;
        }
        const selectButton = event.target.closest('[data-scene-select]');
        if (selectButton) {
          const id = selectButton.getAttribute('data-scene-select');
          if (id === this.activeSceneId) return;
          this.activeSceneId = id;
          this.persistState();
          this.renderScenes();
          this.renderActiveScene();
        }
      });
    }

    if (this.setForm) {
      this.setForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const activeScene = this.getActiveScene();
        if (!activeScene) return;
        const form = new FormData(this.setForm);
        const setName = (form.get('setName') || '').trim();
        const intent = (form.get('intent') || '').trim();
        if (!setName || !intent) {
          return;
        }
        const baseSet = {
          id: this.uuid(),
          name: setName,
          intent,
          environment: (form.get('environment') || '').trim(),
          style: (form.get('style') || '').trim(),
          lighting: (form.get('lighting') || '').trim(),
          palette: (form.get('palette') || '').trim(),
          details: (form.get('details') || '').trim(),
          camera: (form.get('camera') || '').trim(),
          beats: (form.get('beats') || '').trim(),
          propFocus: (form.get('propFocus') || '').trim(),
          conceptPrompts: [],
          basePrompt: '',
          images: [],
          props: [],
          updatedAt: new Date().toISOString()
        };

        const frameCount = Number.parseInt(form.get('frameCount'), 10) || 3;
        const prompts = this.buildPrompts(baseSet, activeScene, frameCount);
        baseSet.basePrompt = prompts.basePrompt;
        baseSet.conceptPrompts = prompts.promptList;
        baseSet.images = this.createImageSet(baseSet.conceptPrompts, prompts.labels, baseSet.propFocus);

        activeScene.sets.unshift(baseSet);
        this.setForm.reset();
        this.persistState();
        this.renderActiveScene();
      });
    }

    if (this.setList) {
      this.setList.addEventListener('click', (event) => {
        const regenerateButton = event.target.closest('[data-regenerate-set]');
        if (regenerateButton) {
          const setId = regenerateButton.getAttribute('data-regenerate-set');
          this.regenerateSet(setId);
          return;
        }
        const deleteButton = event.target.closest('[data-delete-set]');
        if (deleteButton) {
          const setId = deleteButton.getAttribute('data-delete-set');
          this.removeSet(setId);
          return;
        }
        const removePropButton = event.target.closest('[data-remove-prop]');
        if (removePropButton) {
          const { set: setId, prop } = removePropButton.dataset;
          if (!setId || !prop) return;
          this.removeProp(setId, prop);
          return;
        }
      });

      this.setList.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-prop-form]');
        if (!form) return;
        event.preventDefault();
        const setId = form.getAttribute('data-prop-form');
        const scene = this.getActiveScene();
        if (!scene) return;
        const targetSet = scene.sets.find((item) => item.id === setId);
        if (!targetSet) return;
        const data = new FormData(form);
        const name = (data.get('propName') || '').trim();
        if (!name) return;
        const prop = {
          id: this.uuid(),
          name,
          role: (data.get('propRole') || '').trim(),
          materials: (data.get('propMaterials') || '').trim(),
          notes: (data.get('propNotes') || '').trim(),
          prompt: (data.get('propPrompt') || '').trim(),
          imageUrl: ''
        };
        if (prop.prompt) {
          const combinedPrompt = `${targetSet.basePrompt} | prop focus: ${prop.prompt}`;
          prop.imageUrl = this.createImageUrl(combinedPrompt, Math.random());
        }
        targetSet.props.push(prop);
        form.reset();
        this.persistState();
        this.renderActiveScene();
      });
    }

    if (this.exportButton) {
      this.exportButton.addEventListener('click', () => {
        const scene = this.getActiveScene();
        if (!scene || !scene.sets.length) return;
        const payload = this.buildExport(scene);
        const json = JSON.stringify(payload, null, 2);
        if (this.exportOutput) {
          this.exportOutput.hidden = false;
          this.exportOutput.value = json;
        }
        if (this.copyButton) {
          this.copyButton.hidden = false;
          this.copyButton.textContent = 'Copy JSON';
        }
        if (this.downloadButton) {
          this.downloadButton.hidden = false;
        }
        this.exportBlock?.setAttribute('data-state', 'ready');
      });
    }

    if (this.copyButton) {
      this.copyButton.addEventListener('click', async () => {
        if (!this.exportOutput || this.exportOutput.hidden || !this.exportOutput.value) return;
        try {
          await navigator.clipboard.writeText(this.exportOutput.value);
          this.copyButton.textContent = 'Copied!';
          window.setTimeout(() => {
            this.copyButton.textContent = 'Copy JSON';
          }, 1800);
        } catch (error) {
          console.error('Clipboard error', error);
        }
      });
    }

    if (this.downloadButton) {
      this.downloadButton.addEventListener('click', () => {
        if (!this.exportOutput || this.exportOutput.hidden || !this.exportOutput.value) return;
        const blob = new Blob([this.exportOutput.value], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const scene = this.getActiveScene();
        const name = scene ? scene.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() : 'set-designer';
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name || 'scene'}-storyboard-packet.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    }
  }

  loadState() {
    if (typeof window === 'undefined') {
      return { state: { scenes: [] }, activeSceneId: null };
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          state: parsed.state || { scenes: [] },
          activeSceneId: parsed.activeSceneId || (parsed.state?.scenes?.[0]?.id ?? null)
        };
      }
    } catch (error) {
      console.warn('Unable to load saved sets', error);
    }
    return { state: { scenes: [] }, activeSceneId: null };
  }

  persistState() {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({ state: this.state, activeSceneId: this.activeSceneId });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      console.warn('Unable to persist set designer state', error);
    }
  }

  renderScenes() {
    if (!this.sceneList) return;
    this.sceneList.innerHTML = '';
    if (!this.state.scenes.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No scenes yet. Add a scene to begin building your set library.';
      this.sceneList.appendChild(empty);
      return;
    }

    this.state.scenes.forEach((scene) => {
      const article = document.createElement('article');
      article.className = `sd-scene${scene.id === this.activeSceneId ? ' is-active' : ''}`;
      article.innerHTML = `
        <button type="button" class="sd-scene__select" data-scene-select="${scene.id}">
          <span class="sd-scene__title">${this.escapeHtml(scene.title)}</span>
          <span class="sd-scene__meta">${scene.storyboard ? this.escapeHtml(scene.storyboard) : 'Unlinked storyboard'}</span>
          <span class="sd-scene__counts">${scene.sets.length} set${scene.sets.length === 1 ? '' : 's'}</span>
        </button>
        <div class="sd-scene__actions">
          <button type="button" class="sd-icon-btn" data-scene-delete="${scene.id}" aria-label="Delete scene">✕</button>
        </div>
      `;
      this.sceneList.appendChild(article);
    });
  }

  renderActiveScene() {
    const scene = this.getActiveScene();
    if (!scene) {
      if (this.builderEmptyState) this.builderEmptyState.hidden = false;
      if (this.builderContent) this.builderContent.hidden = true;
      if (this.libraryEmptyState) this.libraryEmptyState.hidden = false;
      if (this.setList) this.setList.innerHTML = '';
      if (this.exportBlock) this.exportBlock.hidden = true;
      return;
    }

    if (this.builderEmptyState) this.builderEmptyState.hidden = true;
    if (this.builderContent) this.builderContent.hidden = false;
    if (this.activeSceneName) this.activeSceneName.textContent = scene.title;

    if (this.libraryEmptyState) {
      this.libraryEmptyState.hidden = scene.sets.length > 0;
    }

    if (this.setList) {
      this.setList.innerHTML = '';
      scene.sets.forEach((set) => {
        this.setList.appendChild(this.renderSetCard(scene, set));
      });
    }

    if (this.exportBlock) {
      this.exportBlock.hidden = scene.sets.length === 0;
      if (scene.sets.length === 0) {
        if (this.exportOutput) {
          this.exportOutput.value = '';
          this.exportOutput.hidden = true;
        }
        if (this.copyButton) this.copyButton.hidden = true;
        if (this.downloadButton) this.downloadButton.hidden = true;
      }
    }
  }

  renderSetCard(scene, set) {
    const card = document.createElement('article');
    card.className = 'sd-set';
    card.innerHTML = `
      <header class="sd-set__header">
        <div>
          <h3>${this.escapeHtml(set.name)}</h3>
          <p class="sd-set__meta">${this.escapeHtml(set.intent)}</p>
          <p class="sd-set__scene">Scene: ${this.escapeHtml(scene.title)}${scene.storyboard ? ` · Storyboard ${this.escapeHtml(scene.storyboard)}` : ''}</p>
        </div>
        <div class="sd-set__actions">
          <button type="button" class="btn btn-ghost" data-regenerate-set="${set.id}">Regenerate</button>
          <button type="button" class="sd-icon-btn" data-delete-set="${set.id}" aria-label="Delete set">✕</button>
        </div>
      </header>
      <section class="sd-set__insight">
        <div>
          <h4>Production notes</h4>
          <ul class="sd-set__notes">
            ${this.renderNoteItem('Environment', set.environment)}
            ${this.renderNoteItem('Visual style', set.style)}
            ${this.renderNoteItem('Lighting', set.lighting)}
            ${this.renderNoteItem('Palette', set.palette)}
            ${this.renderNoteItem('Camera & blocking', set.camera)}
            ${this.renderNoteItem('Prop spotlight', set.propFocus)}
            ${this.renderNoteItem('Storyboard beats & character tie-ins', set.beats)}
          </ul>
        </div>
        <div class="sd-set__prompts">
          <h4>Concept prompts</h4>
          <ol>
            ${set.conceptPrompts.map((prompt) => `<li>${this.escapeHtml(prompt)}</li>`).join('')}
          </ol>
        </div>
      </section>
      <section class="sd-set__gallery">
        ${set.images.map((image) => `
          <figure>
            <img src="${image.url}" alt="${this.escapeHtml(set.name)} — ${this.escapeHtml(image.variation)}" loading="lazy" />
            <figcaption>${this.escapeHtml(image.variation)}</figcaption>
          </figure>
        `).join('')}
      </section>
      <section class="sd-props">
        <header class="sd-props__header">
          <h4>Prop &amp; dressing library</h4>
          <span>${set.props.length} item${set.props.length === 1 ? '' : 's'}</span>
        </header>
        <ul class="sd-props__list">
          ${set.props.map((prop) => this.renderProp(prop, set.id)).join('')}
        </ul>
        <form class="sd-form sd-form--inline" data-prop-form="${set.id}">
          <div class="sd-form__row">
            <label>
              <span>Prop name</span>
              <input type="text" name="propName" placeholder="Hero prop or dressing" required />
            </label>
            <label>
              <span>Role</span>
              <input type="text" name="propRole" placeholder="Story or blocking purpose" />
            </label>
          </div>
          <div class="sd-form__row">
            <label>
              <span>Materials</span>
              <input type="text" name="propMaterials" placeholder="Build notes, finishes" />
            </label>
            <label>
              <span>Visual prompt</span>
              <input type="text" name="propPrompt" placeholder="Describe the prop for AI render" />
            </label>
          </div>
          <label>
            <span>Additional notes</span>
            <textarea name="propNotes" rows="2" placeholder="Sourcing, continuity, reset instructions"></textarea>
          </label>
          <button class="btn btn-primary" type="submit">Add prop reference</button>
        </form>
      </section>
    `;
    return card;
  }

  renderProp(prop, setId) {
    return `
      <li class="sd-prop" data-prop-id="${prop.id}">
        <div class="sd-prop__content">
          <h5>${this.escapeHtml(prop.name)}</h5>
          ${prop.role ? `<p>${this.escapeHtml(prop.role)}</p>` : ''}
          ${prop.materials ? `<p class="muted">Materials: ${this.escapeHtml(prop.materials)}</p>` : ''}
          ${prop.notes ? `<p class="muted">Notes: ${this.escapeHtml(prop.notes)}</p>` : ''}
          ${prop.prompt ? `<p class="sd-prop__prompt">Prompt: ${this.escapeHtml(prop.prompt)}</p>` : ''}
        </div>
        <div class="sd-prop__media">
          ${prop.imageUrl ? `<img src="${prop.imageUrl}" alt="${this.escapeHtml(prop.name)} concept render" loading="lazy" />` : ''}
          <button type="button" class="sd-icon-btn" data-remove-prop data-set="${this.escapeHtmlAttr(setId)}" data-prop="${prop.id}" aria-label="Remove prop">✕</button>
        </div>
      </li>
    `;
  }

  buildPrompts(set, scene, count) {
    const fragments = [
      set.name,
      set.intent,
      set.environment ? `environment: ${set.environment}` : '',
      set.details,
      set.camera ? `camera: ${set.camera}` : '',
      set.beats ? `story beats: ${set.beats}` : '',
      scene.brief ? `scene context: ${scene.brief}` : ''
    ].filter(Boolean);
    const styleFragment = set.style && set.style !== 'custom' ? `visual style ${set.style}` : '';
    const paletteFragment = set.palette ? `color palette ${set.palette}` : '';
    const lightingFragment = set.lighting ? `lighting ${set.lighting}` : '';
    const basePrompt = `${fragments.join(', ')} ${styleFragment} ${paletteFragment} ${lightingFragment}`.replace(/\s+/g, ' ').trim();
    const variations = this.variationPresets.slice(0, Math.min(count, this.variationPresets.length));
    while (variations.length < count) {
      variations.push({
        label: `Additional exploration ${variations.length + 1}`,
        addon: '| cinematic exploration, production design study'
      });
    }
    const promptList = variations.map((variation, index) => {
      const propFocus = index === 2 && set.propFocus ? `| prop focus: ${set.propFocus}` : '';
      return `${basePrompt} ${variation.addon} ${propFocus}`.replace(/\s+/g, ' ').trim();
    });
    const labels = variations.map((variation, index) => variation.label || `Exploration ${index + 1}`);
    return { basePrompt, promptList, labels };
  }

  createImageSet(prompts, labels = [], propFocus) {
    return prompts.map((prompt, index) => {
      const variation = labels[index] || this.variationPresets[index]?.label || `Exploration ${index + 1}`;
      const url = this.createImageUrl(prompt, index + 1, propFocus && index === 2);
      return {
        id: this.uuid(),
        prompt,
        variation,
        url
      };
    });
  }

  createImageUrl(prompt, seed = Math.random(), includeFocus = false) {
    const encoded = encodeURIComponent(prompt);
    const timestamp = Date.now();
    const base = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&seed=${Math.floor(seed * 1_000_000)}`;
    if (!includeFocus) return `${base}&timestamp=${timestamp}`;
    return `${base}&n=1&timestamp=${timestamp}`;
  }

  regenerateSet(setId) {
    const scene = this.getActiveScene();
    if (!scene) return;
    const target = scene.sets.find((item) => item.id === setId);
    if (!target) return;
    const count = target.conceptPrompts.length || 3;
    const prompts = this.buildPrompts(target, scene, count);
    target.basePrompt = prompts.basePrompt;
    target.conceptPrompts = prompts.promptList;
    target.images = this.createImageSet(target.conceptPrompts, prompts.labels, target.propFocus);
    target.updatedAt = new Date().toISOString();
    this.persistState();
    this.renderActiveScene();
  }

  removeScene(sceneId) {
    const index = this.state.scenes.findIndex((scene) => scene.id === sceneId);
    if (index === -1) return;
    this.state.scenes.splice(index, 1);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = this.state.scenes[0]?.id ?? null;
    }
    this.persistState();
    this.renderScenes();
    this.renderActiveScene();
  }

  removeSet(setId) {
    const scene = this.getActiveScene();
    if (!scene) return;
    const index = scene.sets.findIndex((item) => item.id === setId);
    if (index === -1) return;
    scene.sets.splice(index, 1);
    this.persistState();
    this.renderActiveScene();
  }

  removeProp(setId, propId) {
    const scene = this.getActiveScene();
    if (!scene) return;
    const set = scene.sets.find((item) => item.id === setId);
    if (!set) return;
    const index = set.props.findIndex((prop) => prop.id === propId);
    if (index === -1) return;
    set.props.splice(index, 1);
    this.persistState();
    this.renderActiveScene();
  }

  buildExport(scene) {
    return {
      generatedAt: new Date().toISOString(),
      scene: {
        id: scene.id,
        title: scene.title,
        storyboardReference: scene.storyboard,
        brief: scene.brief,
        sets: scene.sets.map((set) => ({
          id: set.id,
          name: set.name,
          narrativeIntent: set.intent,
          environment: set.environment,
          visualStyle: set.style,
          lighting: set.lighting,
          palette: set.palette,
          camera: set.camera,
          beats: set.beats,
          propFocus: set.propFocus,
          basePrompt: set.basePrompt,
          conceptPrompts: set.conceptPrompts,
          images: set.images.map((image) => ({
            variation: image.variation,
            prompt: image.prompt,
            url: image.url
          })),
          props: set.props.map((prop) => ({
            id: prop.id,
            name: prop.name,
            role: prop.role,
            materials: prop.materials,
            notes: prop.notes,
            prompt: prop.prompt,
            imageUrl: prop.imageUrl
          }))
        }))
      }
    };
  }

  renderNoteItem(label, value) {
    if (!value) return '';
    return `<li><strong>${this.escapeHtml(label)}:</strong> ${this.escapeHtml(value)}</li>`;
  }

  getActiveScene() {
    if (!this.activeSceneId) return null;
    return this.state.scenes.find((scene) => scene.id === this.activeSceneId) || null;
  }

  uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `sd-${Math.random().toString(36).slice(2, 11)}`;
  }

  escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeHtmlAttr(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-set-designer-app]');
  if (!root) return;
  new SetDesignerApp(root);
});
