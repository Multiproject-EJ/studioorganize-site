const STORAGE_KEY = 'so-set-designer';
const LOCAL_PROJECT_ID = 'local';
const MAX_PROJECT_RESULTS = 200;

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

    this.supabase = window.supabaseClient || null;
    this.session = null;
    this.ownerId = null;
    this.projects = [];
    this.projectLabels = new Map();
    this.loadingProjects = false;
    this.loadingRemote = false;
    this.syncMessageTimer = null;
    this.syncMessageActive = false;

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

    this.projectSelect = this.root.querySelector('[data-project-select]');
    this.projectHint = this.root.querySelector('[data-project-hint]');
    this.syncBanner = this.root.querySelector('[data-sync-banner]');
    this.syncStatus = this.root.querySelector('[data-sync-status]');
    this.syncDetail = this.root.querySelector('[data-sync-detail]');
    this.syncSaveButton = this.root.querySelector('[data-sync-save]');
    this.syncRefreshButton = this.root.querySelector('[data-sync-refresh]');
    this.syncSigninButton = this.root.querySelector('[data-sync-signin]');

    const stored = this.loadState();
    this.state = stored.state;
    this.activeProjectId = stored.activeProjectId;
    this.ensureWorkspace(this.activeProjectId);
    const workspace = this.getWorkspace(this.activeProjectId);
    this.activeSceneId = workspace.activeSceneId ?? (workspace.scenes[0]?.id ?? null);

    this.bindEvents();
    this.renderProjectSelect();
    this.updateProjectHint();
    this.updateSyncBanner();
    this.renderScenes();
    this.renderActiveScene();
    this.initSupabase();
  }

  bindEvents() {
    if (this.projectSelect) {
      this.projectSelect.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value !== LOCAL_PROJECT_ID && (!this.session || !this.projectLabels.has(value))) {
          this.setSyncDetail('Sign in to access Supabase scripts.', 'warning');
          this.renderProjectSelect();
          return;
        }
        this.setActiveProject(value);
      });
    }

    if (this.syncSaveButton) {
      this.syncSaveButton.addEventListener('click', () => {
        this.saveWorkspaceToSupabase();
      });
    }

    if (this.syncRefreshButton) {
      this.syncRefreshButton.addEventListener('click', () => {
        if (!this.session || !this.supabase) return;
        this.fetchProjects(true);
        if (this.activeProjectId !== LOCAL_PROJECT_ID) {
          this.loadRemoteWorkspace(this.activeProjectId);
        }
      });
    }

    if (this.syncSigninButton) {
      this.syncSigninButton.addEventListener('click', () => {
        this.triggerSignIn();
      });
    }

    if (this.sceneForm) {
      this.sceneForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(this.sceneForm);
        const title = (data.get('title') || '').trim();
        if (!title) {
          this.sceneForm.querySelector('input[name="title"]').focus();
          return;
        }
        const now = new Date().toISOString();
        const scene = {
          id: this.uuid(),
          projectId: this.activeProjectId,
          title,
          storyboard: (data.get('storyboard') || '').trim(),
          brief: (data.get('brief') || '').trim(),
          createdAt: now,
          updatedAt: now,
          metadata: {},
          sets: []
        };
        const workspace = this.getWorkspace();
        workspace.scenes.unshift(scene);
        workspace.activeSceneId = scene.id;
        this.activeSceneId = scene.id;
        this.sceneForm.reset();
        this.renderScenes();
        this.renderActiveScene();
        this.markDirty();
      });
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        const workspace = this.getWorkspace();
        if (!workspace.scenes.length) return;
        const confirmation = window.confirm('Clear all scenes, sets, and generated references for this workspace?');
        if (!confirmation) return;
        workspace.scenes = [];
        workspace.activeSceneId = null;
        workspace.lastSyncedAt = null;
        this.activeSceneId = null;
        this.renderScenes();
        this.renderActiveScene();
        this.markDirty();
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
          if (!id || id === this.activeSceneId) return;
          const workspace = this.getWorkspace();
          workspace.activeSceneId = id;
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
        const timestamp = new Date().toISOString();
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
          createdAt: timestamp,
          updatedAt: timestamp
        };

        const frameCount = Number.parseInt(form.get('frameCount'), 10) || 3;
        const prompts = this.buildPrompts(baseSet, activeScene, frameCount);
        baseSet.basePrompt = prompts.basePrompt;
        baseSet.conceptPrompts = prompts.promptList;
        baseSet.images = this.createImageSet(baseSet.conceptPrompts, prompts.labels, baseSet.propFocus);

        activeScene.sets.unshift(baseSet);
        activeScene.updatedAt = timestamp;
        this.setForm.reset();
        this.renderActiveScene();
        this.markDirty();
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
        const now = new Date().toISOString();
        const prop = {
          id: this.uuid(),
          name,
          role: (data.get('propRole') || '').trim(),
          materials: (data.get('propMaterials') || '').trim(),
          notes: (data.get('propNotes') || '').trim(),
          prompt: (data.get('propPrompt') || '').trim(),
          imageUrl: '',
          createdAt: now,
          updatedAt: now
        };
        if (prop.prompt) {
          const combinedPrompt = `${targetSet.basePrompt} | prop focus: ${prop.prompt}`;
          prop.imageUrl = this.createImageUrl(combinedPrompt, Math.random());
        }
        targetSet.props.push(prop);
        targetSet.updatedAt = now;
        const workspace = this.getWorkspace();
        const activeScene = workspace.scenes.find((item) => item.id === scene.id);
        if (activeScene) activeScene.updatedAt = now;
        form.reset();
        this.renderActiveScene();
        this.markDirty();
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

  createWorkspace(initial = {}) {
    const scenes = Array.isArray(initial.scenes) ? initial.scenes : [];
    const workspace = {
      scenes,
      activeSceneId: initial.activeSceneId ?? null,
      dirty: Boolean(initial.dirty),
      lastSyncedAt: initial.lastSyncedAt ?? null
    };
    if (!workspace.activeSceneId && scenes.length) {
      workspace.activeSceneId = scenes[0]?.id ?? null;
    }
    return workspace;
  }

  migrateState(rawState) {
    const projects = {};
    if (!rawState || typeof rawState !== 'object') {
      projects[LOCAL_PROJECT_ID] = this.createWorkspace();
      return { projects };
    }
    if (Array.isArray(rawState.scenes)) {
      projects[LOCAL_PROJECT_ID] = this.createWorkspace({
        scenes: rawState.scenes,
        activeSceneId: rawState.activeSceneId,
        lastSyncedAt: rawState.lastSyncedAt
      });
      return { projects };
    }
    if (rawState.projects && typeof rawState.projects === 'object') {
      Object.entries(rawState.projects).forEach(([projectId, workspace]) => {
        projects[projectId] = this.createWorkspace(workspace || {});
      });
      if (!projects[LOCAL_PROJECT_ID]) {
        projects[LOCAL_PROJECT_ID] = this.createWorkspace();
      }
      return { projects };
    }
    projects[LOCAL_PROJECT_ID] = this.createWorkspace();
    return { projects };
  }

  ensureWorkspace(projectId) {
    const id = projectId || LOCAL_PROJECT_ID;
    if (!this.state.projects[id]) {
      this.state.projects[id] = this.createWorkspace();
    }
    return this.state.projects[id];
  }

  getWorkspace(projectId = this.activeProjectId) {
    return this.ensureWorkspace(projectId || LOCAL_PROJECT_ID);
  }

  loadState() {
    const fallback = {
      state: { projects: { [LOCAL_PROJECT_ID]: this.createWorkspace() } },
      activeProjectId: LOCAL_PROJECT_ID
    };
    if (typeof window === 'undefined') {
      return fallback;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const migrated = this.migrateState(parsed?.state);
        const activeId = parsed?.activeProjectId;
        const activeProjectId = activeId && migrated.projects[activeId]
          ? activeId
          : LOCAL_PROJECT_ID;
        return { state: migrated, activeProjectId };
      }
    } catch (error) {
      console.warn('Unable to load saved sets', error);
    }
    return fallback;
  }

  persistState() {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        state: this.state,
        activeProjectId: this.activeProjectId
      });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      console.warn('Unable to persist set designer state', error);
    }
  }

  setActiveProject(projectId, { persist = true, skipRemoteLoad = false } = {}) {
    if (this.syncMessageTimer) {
      window.clearTimeout(this.syncMessageTimer);
      this.syncMessageTimer = null;
    }
    this.syncMessageActive = false;
    const nextId = projectId || LOCAL_PROJECT_ID;
    this.ensureWorkspace(nextId);
    this.activeProjectId = nextId;
    const workspace = this.getWorkspace(nextId);
    const nextActiveScene = workspace.activeSceneId && workspace.scenes.some((scene) => scene.id === workspace.activeSceneId)
      ? workspace.activeSceneId
      : workspace.scenes[0]?.id ?? null;
    workspace.activeSceneId = nextActiveScene;
    this.activeSceneId = nextActiveScene;
    if (persist) {
      this.persistState();
    }
    this.renderProjectSelect();
    this.updateProjectHint();
    this.updateSyncBanner();
    this.renderScenes();
    this.renderActiveScene();
    if (
      nextId !== LOCAL_PROJECT_ID &&
      this.supabase &&
      this.session &&
      !skipRemoteLoad
    ) {
      this.loadRemoteWorkspace(nextId);
    }
  }

  renderProjectSelect() {
    if (!this.projectSelect) return;
    const options = [
      `<option value="${LOCAL_PROJECT_ID}">Offline workspace</option>`
    ];
    this.projects.forEach((project) => {
      const selected = project.id === this.activeProjectId ? ' selected' : '';
      options.push(
        `<option value="${this.escapeHtmlAttr(project.id)}"${selected}>${this.escapeHtml(project.label)}</option>`
      );
    });
    this.projectSelect.innerHTML = options.join('');
    this.projectSelect.value = this.activeProjectId;
  }

  updateProjectHint() {
    if (!this.projectHint) return;
    if (!this.supabase) {
      this.projectHint.textContent = 'Supabase client unavailable. Using offline workspace.';
      return;
    }
    if (!this.session) {
      this.projectHint.textContent = 'Sign in to choose from your Storyboard Writer scripts.';
      return;
    }
    if (!this.projects.length) {
      this.projectHint.textContent = 'No scripts found yet. Create a script to sync set designs.';
      return;
    }
    if (this.activeProjectId === LOCAL_PROJECT_ID) {
      this.projectHint.textContent = 'Offline workspace. Select a script to sync with Supabase.';
      return;
    }
    const label = this.projectLabels.get(this.activeProjectId) || 'Selected script';
    this.projectHint.textContent = `Connected to ${label}.`;
  }

  setSyncDetail(message, state = '') {
    if (this.syncDetail) {
      this.syncDetail.textContent = message || '';
    }
    if (!this.syncBanner) return;
    if (state) {
      this.syncBanner.dataset.state = state;
    } else {
      this.syncBanner.removeAttribute('data-state');
    }
  }

  updateSyncBanner() {
    if (!this.syncStatus) return;
    const workspace = this.getWorkspace();
    if (!this.supabase) {
      if (this.syncMessageTimer) {
        window.clearTimeout(this.syncMessageTimer);
        this.syncMessageTimer = null;
      }
      this.syncMessageActive = false;
      this.syncStatus.textContent = 'Offline workspace';
      this.setSyncDetail('Supabase client unavailable. Sets stay on this device.', 'warning');
      if (this.syncSaveButton) this.syncSaveButton.hidden = true;
      if (this.syncRefreshButton) this.syncRefreshButton.hidden = true;
      if (this.syncSigninButton) this.syncSigninButton.hidden = true;
      return;
    }

    if (!this.session) {
      if (this.syncMessageTimer) {
        window.clearTimeout(this.syncMessageTimer);
        this.syncMessageTimer = null;
      }
      this.syncMessageActive = false;
      this.syncStatus.textContent = 'Local mode';
      this.setSyncDetail('Sign in to sync sets with your scripts.', 'warning');
      if (this.syncSaveButton) this.syncSaveButton.hidden = true;
      if (this.syncRefreshButton) this.syncRefreshButton.hidden = true;
      if (this.syncSigninButton) {
        this.syncSigninButton.hidden = false;
        this.syncSigninButton.disabled = false;
      }
      this.updateProjectHint();
      return;
    }

    if (this.syncSigninButton) this.syncSigninButton.hidden = true;

    if (this.activeProjectId === LOCAL_PROJECT_ID) {
      if (this.syncMessageTimer) {
        window.clearTimeout(this.syncMessageTimer);
        this.syncMessageTimer = null;
      }
      this.syncMessageActive = false;
      this.syncStatus.textContent = 'Offline workspace';
      const detail = this.projects.length
        ? 'Choose a script to sync with Supabase.'
        : 'Create a script in Storyboard Writer to start syncing.';
      this.setSyncDetail(detail, '');
      if (this.syncSaveButton) this.syncSaveButton.hidden = true;
      if (this.syncRefreshButton) {
        this.syncRefreshButton.hidden = false;
        this.syncRefreshButton.disabled = this.loadingProjects;
      }
      this.updateProjectHint();
      return;
    }

    if (this.loadingRemote) {
      if (this.syncMessageTimer) {
        window.clearTimeout(this.syncMessageTimer);
        this.syncMessageTimer = null;
      }
      this.syncMessageActive = false;
      this.syncStatus.textContent = 'Loading scene library…';
      this.setSyncDetail('Fetching Supabase data…', 'loading');
      if (this.syncSaveButton) {
        this.syncSaveButton.hidden = false;
        this.syncSaveButton.disabled = true;
      }
      if (this.syncRefreshButton) {
        this.syncRefreshButton.hidden = false;
        this.syncRefreshButton.disabled = true;
      }
      this.updateProjectHint();
      return;
    }

    const label = this.projectLabels.get(this.activeProjectId) || 'Selected script';
    if (workspace.dirty) {
      if (!this.syncMessageActive) {
        this.syncStatus.textContent = 'Unsynced changes';
        this.setSyncDetail(`Changes for “${label}” are stored locally. Sync to push them to Supabase.`, 'warning');
      }
    } else {
      const lastSynced = workspace.lastSyncedAt ? new Date(workspace.lastSyncedAt) : null;
      const detail = lastSynced ? `Synced ${lastSynced.toLocaleString()}` : `Connected to “${label}”`;
      if (!this.syncMessageActive) {
        this.syncStatus.textContent = 'Supabase synced';
        this.setSyncDetail(detail, 'success');
      }
    }
    if (this.syncSaveButton) {
      this.syncSaveButton.hidden = false;
      this.syncSaveButton.disabled = !workspace.dirty;
    }
    if (this.syncRefreshButton) {
      this.syncRefreshButton.hidden = false;
      this.syncRefreshButton.disabled = this.loadingProjects;
    }
    this.updateProjectHint();
  }

  markDirty({ persist = true } = {}) {
    if (this.syncMessageTimer) {
      window.clearTimeout(this.syncMessageTimer);
      this.syncMessageTimer = null;
    }
    this.syncMessageActive = false;
    const workspace = this.getWorkspace();
    if (!workspace) return;
    if (this.activeProjectId !== LOCAL_PROJECT_ID) {
      workspace.dirty = true;
    }
    if (persist) {
      this.persistState();
    }
    this.updateSyncBanner();
  }

  async initSupabase() {
    this.supabase = window.supabaseClient || this.supabase || null;
    if (!this.supabase || !this.supabase.auth) {
      this.updateSyncBanner();
      return;
    }
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      this.handleSession(data?.session ?? null);
    } catch (error) {
      console.warn('Set designer failed to read Supabase session', error);
      this.handleSession(null);
    }
    if (this.supabase?.auth) {
      this.supabase.auth.onAuthStateChange((_event, session) => {
        this.handleSession(session);
      });
    }
  }

  handleSession(session) {
    this.session = session;
    this.ownerId = session?.user?.id ?? null;
    if (!this.session) {
      this.projects = [];
      this.projectLabels.clear();
      if (this.activeProjectId !== LOCAL_PROJECT_ID) {
        this.setActiveProject(LOCAL_PROJECT_ID, { persist: true, skipRemoteLoad: true });
      } else {
        this.updateSyncBanner();
      }
      return;
    }
    this.fetchProjects(true);
  }

  async fetchProjects(force = false) {
    if (!this.supabase || !this.session || !this.ownerId) return;
    if (this.loadingProjects && !force) return;
    this.loadingProjects = true;
    this.setSyncDetail('Loading script library…', 'loading');
    try {
      const { data, error } = await this.supabase
        .from('project_data')
        .select('project_id, script_name, title, name, updated_at')
        .eq('owner_id', this.ownerId)
        .not('project_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(MAX_PROJECT_RESULTS);
      if (error) throw error;
      const projects = Array.isArray(data)
        ? data
            .filter((row) => row?.project_id)
            .map((row) => ({
              id: row.project_id,
              label: row.script_name || row.title || row.name || 'Untitled script'
            }))
        : [];
      this.projects = projects;
      this.projectLabels = new Map(projects.map((project) => [project.id, project.label]));
      this.renderProjectSelect();
      this.updateProjectHint();
      if (this.activeProjectId !== LOCAL_PROJECT_ID && !this.projectLabels.has(this.activeProjectId)) {
        this.setActiveProject(LOCAL_PROJECT_ID, { persist: true, skipRemoteLoad: true });
      }
      if (this.activeProjectId !== LOCAL_PROJECT_ID && !this.getWorkspace().scenes.length) {
        await this.loadRemoteWorkspace(this.activeProjectId);
      } else {
        this.updateSyncBanner();
      }
      if (!projects.length) {
        this.setSyncDetail('No scripts found yet. Create one to sync your sets.', 'warning');
      }
    } catch (error) {
      console.warn('Set designer failed to load projects', error);
      this.setSyncDetail('Unable to load Supabase projects. Try refreshing.', 'warning');
    } finally {
      this.loadingProjects = false;
      this.updateSyncBanner();
    }
  }

  async loadRemoteWorkspace(projectId) {
    if (!this.supabase || !this.session || !this.ownerId || !projectId) return;
    this.loadingRemote = true;
    this.setSyncDetail('Loading Supabase scenes…', 'loading');
    this.updateSyncBanner();
    try {
      const { data: sceneRows, error: sceneError } = await this.supabase
        .from('set_designer_scenes')
        .select('id, title, storyboard_reference, brief, metadata, created_at, updated_at')
        .eq('owner_id', this.ownerId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (sceneError) throw sceneError;
      const scenes = Array.isArray(sceneRows) ? sceneRows : [];
      const sceneIds = scenes.map((row) => row.id).filter(Boolean);
      let setRows = [];
      if (sceneIds.length) {
        const { data, error } = await this.supabase
          .from('set_designer_sets')
          .select('id, scene_id, name, narrative_intent, environment, visual_style, lighting, palette, details, camera, beats, prop_focus, base_prompt, concept_prompts, images, props, created_at, updated_at')
          .eq('owner_id', this.ownerId)
          .in('scene_id', sceneIds);
        if (error) throw error;
        setRows = Array.isArray(data) ? data : [];
      }
      const setsByScene = new Map();
      setRows.forEach((row) => {
        const list = setsByScene.get(row.scene_id) || [];
        list.push(this.normalizeSetRow(row));
        setsByScene.set(row.scene_id, list);
      });
      const workspace = this.getWorkspace(projectId);
      const previousActive = workspace.activeSceneId;
      workspace.scenes = scenes.map((row) => {
        const mappedSets = setsByScene.get(row.id) || [];
        mappedSets.sort((a, b) => {
          const aTime = a.updatedAt || a.createdAt || '';
          const bTime = b.updatedAt || b.createdAt || '';
          return bTime.localeCompare(aTime);
        });
        return {
          id: row.id,
          projectId,
          title: row.title || 'Untitled scene',
          storyboard: row.storyboard_reference || '',
          brief: row.brief || '',
          metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
          createdAt: row.created_at || null,
          updatedAt: row.updated_at || null,
          sets: mappedSets
        };
      });
      const nextActiveScene = previousActive && workspace.scenes.some((scene) => scene.id === previousActive)
        ? previousActive
        : workspace.scenes[0]?.id ?? null;
      workspace.activeSceneId = nextActiveScene;
      this.activeSceneId = nextActiveScene;
      workspace.dirty = false;
      workspace.lastSyncedAt = new Date().toISOString();
      this.persistState();
      if (projectId === this.activeProjectId) {
        this.renderScenes();
        this.renderActiveScene();
      }
      this.updateSyncBanner();
    } catch (error) {
      console.warn('Set designer failed to load scenes', error);
      this.setSyncDetail('Unable to load Supabase scenes. Your local data is still available.', 'warning');
    } finally {
      this.loadingRemote = false;
      this.updateSyncBanner();
    }
  }

  normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.values(value);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    }
    return [];
  }

  normalizeSetRow(row) {
    const images = this.normalizeArray(row.images).map((image) => ({
      id: image?.id || this.uuid(),
      prompt: image?.prompt || '',
      variation: image?.variation || '',
      url: image?.url || ''
    }));
    const props = this.normalizeArray(row.props).map((prop) => ({
      id: prop?.id || this.uuid(),
      name: prop?.name || '',
      role: prop?.role || '',
      materials: prop?.materials || '',
      notes: prop?.notes || '',
      prompt: prop?.prompt || '',
      imageUrl: prop?.imageUrl || '',
      createdAt: prop?.createdAt || null,
      updatedAt: prop?.updatedAt || null
    }));
    return {
      id: row.id,
      name: row.name || 'Untitled set',
      intent: row.narrative_intent || '',
      environment: row.environment || '',
      style: row.visual_style || '',
      lighting: row.lighting || '',
      palette: row.palette || '',
      details: row.details || '',
      camera: row.camera || '',
      beats: row.beats || '',
      propFocus: row.prop_focus || '',
      basePrompt: row.base_prompt || '',
      conceptPrompts: this.normalizeArray(row.concept_prompts),
      images,
      props,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  showSyncMessage(message, state = 'success') {
    this.syncMessageActive = true;
    if (this.syncStatus) {
      this.syncStatus.textContent = 'Supabase synced';
    }
    this.setSyncDetail(message, state);
    if (this.syncMessageTimer) {
      window.clearTimeout(this.syncMessageTimer);
    }
    this.syncMessageTimer = window.setTimeout(() => {
      this.syncMessageTimer = null;
      this.syncMessageActive = false;
      this.updateSyncBanner();
    }, 2400);
  }

  async saveWorkspaceToSupabase() {
    if (!this.supabase || !this.session || !this.ownerId || this.activeProjectId === LOCAL_PROJECT_ID) return;
    const workspace = this.getWorkspace();
    this.setSyncDetail('Syncing to Supabase…', 'loading');
    if (this.syncSaveButton) this.syncSaveButton.disabled = true;
    if (this.syncRefreshButton) this.syncRefreshButton.disabled = true;
    try {
      const { data: remoteSceneRows, error: remoteSceneError } = await this.supabase
        .from('set_designer_scenes')
        .select('id')
        .eq('owner_id', this.ownerId)
        .eq('project_id', this.activeProjectId);
      if (remoteSceneError) throw remoteSceneError;
      const remoteSceneIds = new Set((remoteSceneRows || []).map((row) => row.id));
      const localSceneIds = new Set(workspace.scenes.map((scene) => scene.id));
      const scenesToDelete = [...remoteSceneIds].filter((id) => !localSceneIds.has(id));
      if (scenesToDelete.length) {
        await this.supabase
          .from('set_designer_scenes')
          .delete()
          .in('id', scenesToDelete);
      }

      const now = new Date().toISOString();
      const scenePayload = workspace.scenes.map((scene) => ({
        id: scene.id,
        owner_id: this.ownerId,
        project_id: this.activeProjectId,
        title: scene.title,
        storyboard_reference: scene.storyboard,
        brief: scene.brief,
        metadata: scene.metadata || {},
        created_at: scene.createdAt || now,
        updated_at: now
      }));
      if (scenePayload.length) {
        const { error } = await this.supabase
          .from('set_designer_scenes')
          .upsert(scenePayload, { onConflict: 'id' });
        if (error) throw error;
      }

      let remoteSetIds = new Set();
      if (remoteSceneIds.size || localSceneIds.size) {
        const sceneIdsForSets = [...new Set([...remoteSceneIds, ...localSceneIds])];
        if (sceneIdsForSets.length) {
          const { data: remoteSets, error: remoteSetsError } = await this.supabase
            .from('set_designer_sets')
            .select('id')
            .eq('owner_id', this.ownerId)
            .in('scene_id', sceneIdsForSets);
          if (remoteSetsError) throw remoteSetsError;
          remoteSetIds = new Set((remoteSets || []).map((row) => row.id));
        }
      }

      const setPayload = [];
      workspace.scenes.forEach((scene) => {
        scene.sets.forEach((set) => {
          setPayload.push({
            id: set.id,
            owner_id: this.ownerId,
            scene_id: scene.id,
            name: set.name,
            narrative_intent: set.intent,
            environment: set.environment,
            visual_style: set.style,
            lighting: set.lighting,
            palette: set.palette,
            details: set.details,
            camera: set.camera,
            beats: set.beats,
            prop_focus: set.propFocus,
            base_prompt: set.basePrompt,
            concept_prompts: set.conceptPrompts || [],
            images: set.images || [],
            props: set.props || [],
            created_at: set.createdAt || now,
            updated_at: now
          });
        });
      });
      const localSetIds = new Set(setPayload.map((row) => row.id));
      const setsToDelete = [...remoteSetIds].filter((id) => !localSetIds.has(id));
      if (setsToDelete.length) {
        await this.supabase
          .from('set_designer_sets')
          .delete()
          .in('id', setsToDelete);
      }
      if (setPayload.length) {
        const { error } = await this.supabase
          .from('set_designer_sets')
          .upsert(setPayload, { onConflict: 'id' });
        if (error) throw error;
      }

      workspace.dirty = false;
      workspace.lastSyncedAt = now;
      workspace.scenes.forEach((scene) => {
        scene.updatedAt = now;
        scene.sets.forEach((set) => {
          set.updatedAt = now;
        });
      });
      this.persistState();
      this.showSyncMessage('Sync complete', 'success');
      if (this.syncSaveButton) this.syncSaveButton.disabled = true;
      if (this.syncRefreshButton) this.syncRefreshButton.disabled = false;
    } catch (error) {
      console.error('Set designer sync failed', error);
      this.setSyncDetail('Sync failed. Please try again.', 'warning');
      if (this.syncSaveButton) this.syncSaveButton.disabled = false;
      if (this.syncRefreshButton) this.syncRefreshButton.disabled = false;
    } finally {
      if (!this.syncMessageTimer) {
        this.updateSyncBanner();
      }
    }
  }

  triggerSignIn() {
    const link = document.querySelector('[data-auth-link][data-auth-intent="signin"]');
    if (link) {
      link.click();
    } else {
      window.location.href = 'https://studioorganize.com/supabase-test.html';
    }
  }

  renderScenes() {
    if (!this.sceneList) return;
    this.sceneList.innerHTML = '';
    const workspace = this.getWorkspace();
    const scenes = workspace.scenes;
    if (!scenes.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No scenes yet. Add a scene to begin building your set library.';
      this.sceneList.appendChild(empty);
      return;
    }

    scenes.forEach((scene) => {
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
    const now = new Date().toISOString();
    target.updatedAt = now;
    scene.updatedAt = now;
    this.renderActiveScene();
    this.markDirty();
  }

  removeScene(sceneId) {
    const workspace = this.getWorkspace();
    const index = workspace.scenes.findIndex((scene) => scene.id === sceneId);
    if (index === -1) return;
    workspace.scenes.splice(index, 1);
    if (workspace.activeSceneId === sceneId) {
      workspace.activeSceneId = workspace.scenes[0]?.id ?? null;
    }
    this.activeSceneId = workspace.activeSceneId;
    this.renderScenes();
    this.renderActiveScene();
    this.markDirty();
  }

  removeSet(setId) {
    const scene = this.getActiveScene();
    if (!scene) return;
    const index = scene.sets.findIndex((item) => item.id === setId);
    if (index === -1) return;
    scene.sets.splice(index, 1);
    scene.updatedAt = new Date().toISOString();
    this.renderActiveScene();
    this.markDirty();
  }

  removeProp(setId, propId) {
    const scene = this.getActiveScene();
    if (!scene) return;
    const set = scene.sets.find((item) => item.id === setId);
    if (!set) return;
    const index = set.props.findIndex((prop) => prop.id === propId);
    if (index === -1) return;
    set.props.splice(index, 1);
    const now = new Date().toISOString();
    set.updatedAt = now;
    scene.updatedAt = now;
    this.renderActiveScene();
    this.markDirty();
  }

  buildExport(scene) {
    return {
      generatedAt: new Date().toISOString(),
      project: {
        id: this.activeProjectId === LOCAL_PROJECT_ID ? null : this.activeProjectId,
        name:
          this.activeProjectId === LOCAL_PROJECT_ID
            ? 'Offline workspace'
            : this.projectLabels.get(this.activeProjectId) || 'Selected script'
      },
      scene: {
        id: scene.id,
        projectId: this.activeProjectId === LOCAL_PROJECT_ID ? null : this.activeProjectId,
        title: scene.title,
        storyboardReference: scene.storyboard,
        brief: scene.brief,
        metadata: scene.metadata || {},
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
    const workspace = this.getWorkspace();
    return workspace.scenes.find((scene) => scene.id === this.activeSceneId) || null;
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
