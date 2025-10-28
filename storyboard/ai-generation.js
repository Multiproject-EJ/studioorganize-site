const REF_BUCKET = 'story-refs';
const RENDER_BUCKET = 'story-renders';
const SEED_STORAGE_PREFIX = 'SO_STORYBOARD_SEED:';
const modal = document.querySelector('[data-storyboard-ai-modal]');
if (!modal) {
  console.warn('Storyboard AI modal not found');
}

const supabase = window.supabaseClient || null;

const elements = modal
  ? {
      modal,
      form: modal.querySelector('[data-storyboard-ai-form]'),
      status: modal.querySelector('[data-storyboard-ai-status]'),
      prompt: modal.querySelector('[data-storyboard-ai-prompt]'),
      negative: modal.querySelector('[data-storyboard-ai-negative]'),
      width: modal.querySelector('[data-storyboard-ai-width]'),
      height: modal.querySelector('[data-storyboard-ai-height]'),
      steps: modal.querySelector('[data-storyboard-ai-steps]'),
      guidance: modal.querySelector('[data-storyboard-ai-guidance]'),
      seed: modal.querySelector('[data-storyboard-ai-seed]'),
      provider: modal.querySelector('[data-storyboard-ai-provider]'),
      sceneInput: modal.querySelector('[data-storyboard-ai-scene]'),
      referenceSelect: modal.querySelector('[data-storyboard-ai-reference]'),
      maskSelect: modal.querySelector('[data-storyboard-ai-mask]'),
      referenceUpload: modal.querySelector('[data-storyboard-ai-reference-upload]'),
      maskUpload: modal.querySelector('[data-storyboard-ai-mask-upload]'),
      submit: modal.querySelector('[data-storyboard-ai-submit]'),
      dismissButtons: modal.querySelectorAll('[data-storyboard-ai-dismiss]'),
      history: modal.querySelector('[data-storyboard-ai-history]'),
      error: modal.querySelector('[data-storyboard-ai-error]'),
    }
  : {};

const state = {
  currentSceneId: null,
  pollingByJob: new Map(),
  jobsByScene: new Map(),
  assetCache: new Map(),
  referenceCache: [],
  maskCache: [],
};

function getSceneData(sceneId) {
  const scenes = Array.isArray(window.storyboardScenes) ? window.storyboardScenes : [];
  return scenes.find(scene => scene.id === sceneId) || null;
}

function setStatus(text, status = 'idle') {
  if (!elements.status) return;
  elements.status.textContent = text;
  elements.status.dataset.state = status;
}

function showError(message) {
  if (!elements.error) return;
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function clearError() {
  showError('');
}

function toggleModal(open) {
  if (!modal) return;
  if (open) {
    modal.dataset.open = 'true';
    modal.hidden = false;
  } else {
    modal.dataset.open = 'false';
    modal.hidden = true;
  }
}

function persistSeed(sceneId, seed) {
  if (!sceneId) return;
  try {
    const key = `${SEED_STORAGE_PREFIX}${sceneId}`;
    localStorage.setItem(key, String(seed || ''));
  } catch (error) {
    console.warn('Unable to persist storyboard seed', error);
  }
}

function readSeed(sceneId) {
  if (!sceneId) return '';
  try {
    const key = `${SEED_STORAGE_PREFIX}${sceneId}`;
    return localStorage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function populateSeed(sceneId) {
  if (!elements.seed) return;
  const stored = readSeed(sceneId);
  if (stored) {
    elements.seed.value = stored;
  } else if (!elements.seed.value) {
    elements.seed.value = '0';
  }
}

function prefillPrompt(sceneId) {
  if (!elements.prompt) return;
  const scene = getSceneData(sceneId);
  if (!scene) return;
  if (!elements.prompt.value.trim()) {
    const base = [scene.description, scene.timelineMeta].filter(Boolean).join('\n');
    if (base) {
      elements.prompt.value = `${base}\nRender as a cinematic storyboard frame with consistent character likeness.`;
    }
  }
}

function updateSceneThumbnail(sceneId, signedUrl) {
  if (!sceneId) return;
  const img = document.querySelector(`img[data-scene-thumbnail="${sceneId}"]`);
  if (!img) return;
  if (signedUrl) {
    img.src = signedUrl;
    img.hidden = false;
  }
}

function updateSceneMemory(sceneId, signedUrl) {
  if (!sceneId || !signedUrl) return;
  const scenes = Array.isArray(window.storyboardScenes) ? window.storyboardScenes : [];
  const idx = scenes.findIndex(scene => scene.id === sceneId);
  if (idx >= 0) {
    scenes[idx].latestRenderUrl = signedUrl;
  }
}

function bindButtons() {
  document.querySelectorAll('[data-scene-generate]').forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.storyboardAiBound === 'true') return;
    button.dataset.storyboardAiBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const sceneId = button.dataset.sceneGenerate;
      if (sceneId) {
        openModal(sceneId);
      }
    });
  });
}

async function ensureSession() {
  if (!supabase) {
    showError('Supabase client not available.');
    return null;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    showError('Sign in to generate storyboard images.');
    return null;
  }
  return data.session;
}

async function fetchAssetUrl(asset) {
  if (!asset) return '';
  if (!supabase) return '';
  const bucket = asset?.metadata?.bucket || (asset.kind === 'render' ? RENDER_BUCKET : REF_BUCKET);
  if (!bucket || !asset.storage_path) return '';
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(asset.storage_path, 3600);
  if (error || !data?.signedUrl) {
    console.warn('Failed to resolve asset URL', error);
    return '';
  }
  return data.signedUrl;
}

async function fetchSceneAssets(sceneId) {
  if (!supabase || !sceneId) return [];
  const { data, error } = await supabase
    .from('assets')
    .select('id, scene_id, kind, storage_path, metadata, created_at')
    .eq('scene_id', sceneId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.error('Failed to load scene assets', error);
    return [];
  }
  return data || [];
}

async function fetchReferenceAssets() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assets')
    .select('id, scene_id, kind, storage_path, metadata, created_at')
    .in('kind', ['reference'])
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    console.error('Failed to load reference assets', error);
    return [];
  }
  return data || [];
}

async function fetchMaskAssets() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assets')
    .select('id, scene_id, kind, storage_path, metadata, created_at')
    .eq('kind', 'mask')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    console.error('Failed to load mask assets', error);
    return [];
  }
  return data || [];
}

async function refreshSelectOptions(sceneId) {
  const [references, masks] = await Promise.all([fetchReferenceAssets(), fetchMaskAssets()]);
  state.referenceCache = references;
  state.maskCache = masks;
  if (elements.referenceSelect) {
    const current = elements.referenceSelect.value;
    elements.referenceSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'No reference';
    elements.referenceSelect.appendChild(defaultOption);
    references.forEach(asset => {
      const option = document.createElement('option');
      option.value = asset.id;
      const labelParts = [];
      if (asset.metadata?.name) labelParts.push(asset.metadata.name);
      if (asset.scene_id && asset.scene_id !== sceneId) labelParts.push('Other scene');
      option.textContent = labelParts.join(' · ') || `Reference ${asset.id.slice(0, 6)}`;
      elements.referenceSelect.appendChild(option);
    });
    if (references.some(asset => asset.id === current)) {
      elements.referenceSelect.value = current;
    }
  }
  if (elements.maskSelect) {
    const currentMask = elements.maskSelect.value;
    elements.maskSelect.innerHTML = '';
    const defaultMask = document.createElement('option');
    defaultMask.value = '';
    defaultMask.textContent = 'No mask';
    elements.maskSelect.appendChild(defaultMask);
    masks.forEach(asset => {
      const option = document.createElement('option');
      option.value = asset.id;
      const labelParts = [];
      if (asset.metadata?.name) labelParts.push(asset.metadata.name);
      option.textContent = labelParts.join(' · ') || `Mask ${asset.id.slice(0, 6)}`;
      elements.maskSelect.appendChild(option);
    });
    if (masks.some(asset => asset.id === currentMask)) {
      elements.maskSelect.value = currentMask;
    }
  }
}

async function renderHistory(sceneId, assets) {
  if (!elements.history) return;
  elements.history.innerHTML = '';
  const renders = Array.isArray(assets)
    ? assets.filter(asset => asset.kind === 'render').slice(0, 3)
    : [];
  if (!renders.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'muted';
    placeholder.textContent = 'No renders yet. Generate an image to see history.';
    elements.history.appendChild(placeholder);
    return;
  }
  const urlPromises = renders.map(async asset => {
    const url = await fetchAssetUrl(asset);
    return { asset, url };
  });
  const withUrls = await Promise.all(urlPromises);
  withUrls.forEach(({ asset, url }) => {
    if (!url) return;
    const item = document.createElement('div');
    item.className = 'storyboard-ai-history__item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Generated storyboard frame';
    item.appendChild(img);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Use as reference';
    button.addEventListener('click', async () => {
      await handleUseAsReference(asset);
    });
    item.appendChild(button);
    elements.history.appendChild(item);
  });
  if (withUrls[0]) {
    updateSceneThumbnail(sceneId, withUrls[0].url);
    updateSceneMemory(sceneId, withUrls[0].url);
  }
}

async function refreshSceneState(sceneId) {
  if (!sceneId) return;
  setStatus('Syncing assets…', 'loading');
  const assets = await fetchSceneAssets(sceneId);
  state.assetCache.set(sceneId, assets);
  await renderHistory(sceneId, assets);
  await refreshSelectOptions(sceneId);
  if (!state.jobsByScene.has(sceneId)) {
    setStatus('Ready to generate', 'idle');
  }
}

function resetForm() {
  if (!elements.form) return;
  elements.form.reset();
  if (elements.referenceSelect) {
    elements.referenceSelect.value = '';
  }
  if (elements.maskSelect) {
    elements.maskSelect.value = '';
  }
  if (elements.prompt) {
    elements.prompt.value = '';
  }
  if (elements.negative) {
    elements.negative.value = '';
  }
  if (elements.width) elements.width.value = '1024';
  if (elements.height) elements.height.value = '576';
  if (elements.steps) elements.steps.value = '30';
  if (elements.guidance) elements.guidance.value = '7';
  if (elements.seed) elements.seed.value = '0';
  if (elements.provider) elements.provider.value = 'auto';
  clearError();
}

async function openModal(sceneId) {
  if (!modal) return;
  state.currentSceneId = sceneId;
  if (elements.sceneInput) {
    elements.sceneInput.value = sceneId;
  }
  resetForm();
  populateSeed(sceneId);
  prefillPrompt(sceneId);
  setStatus('Loading assets…', 'loading');
  toggleModal(true);
  await refreshSceneState(sceneId);
}

function closeModal() {
  toggleModal(false);
}

function gatherFormData() {
  if (!state.currentSceneId) {
    showError('Select a scene first.');
    return null;
  }
  const prompt = elements.prompt ? elements.prompt.value.trim() : '';
  if (!prompt) {
    showError('Add a prompt to describe the frame.');
    return null;
  }
  const payload = {
    scene_id: state.currentSceneId,
    prompt,
    negative_prompt: elements.negative ? elements.negative.value.trim() : '',
    width: Number(elements.width?.value || 1024),
    height: Number(elements.height?.value || 576),
    steps: Number(elements.steps?.value || 30),
    guidance: Number(elements.guidance?.value || 7),
    seed: Number(elements.seed?.value || 0),
    provider: elements.provider?.value || 'auto',
    reference_asset_id: elements.referenceSelect?.value || '',
    mask_asset_id: elements.maskSelect?.value || '',
  };
  return payload;
}

function disableForm(disabled) {
  if (!elements.form) return;
  const fields = elements.form.querySelectorAll('textarea, input, select, button');
  fields.forEach(field => {
    field.disabled = disabled;
  });
}

async function startGeneration(event) {
  event.preventDefault();
  clearError();
  const session = await ensureSession();
  if (!session) return;
  const payload = gatherFormData();
  if (!payload) return;
  setStatus('Starting generation…', 'loading');
  disableForm(true);
  try {
    persistSeed(payload.scene_id, payload.seed);
    const { data, error } = await supabase.functions.invoke('generate', {
      body: payload,
    });
    if (error) {
      throw new Error(error.message || 'Generation failed');
    }
    if (!data?.job_id) {
      throw new Error('Invalid response from generation function');
    }
    state.jobsByScene.set(payload.scene_id, { jobId: data.job_id, status: data.status || 'processing' });
    setStatus('Generation in progress…', 'loading');
    pollJob(payload.scene_id, data.job_id, true);
  } catch (err) {
    console.error('Generation error', err);
    showError(err.message || 'Generation failed');
    setStatus('Generation failed', 'idle');
    disableForm(false);
  }
}

async function pollJob(sceneId, jobId, immediate = false) {
  if (!sceneId || !jobId) return;
  if (!supabase) return;
  const invoke = async () => {
    const { data, error } = await supabase.functions.invoke('status', {
      body: { job_id: jobId },
    });
    if (error) {
      console.error('Status error', error);
      schedulePoll(sceneId, jobId);
      return;
    }
    const status = data?.status || 'processing';
    state.jobsByScene.set(sceneId, { jobId, status });
    if (status === 'succeeded') {
      setStatus('Render complete', 'idle');
      disableForm(false);
      if (Array.isArray(data?.assets) && data.assets.length) {
        state.assetCache.set(sceneId, data.assets);
      }
      await refreshSceneState(sceneId);
      state.jobsByScene.delete(sceneId);
    } else if (status === 'failed') {
      disableForm(false);
      showError(data?.error || 'Generation failed');
      setStatus('Generation failed', 'idle');
      state.jobsByScene.delete(sceneId);
    } else {
      schedulePoll(sceneId, jobId);
    }
  };
  if (immediate) {
    await invoke();
  } else {
    await invoke();
  }
}

function schedulePoll(sceneId, jobId) {
  if (!jobId) return;
  if (state.pollingByJob.has(jobId)) {
    window.clearTimeout(state.pollingByJob.get(jobId));
  }
  const timeout = window.setTimeout(() => {
    state.pollingByJob.delete(jobId);
    pollJob(sceneId, jobId, true);
  }, 3000);
  state.pollingByJob.set(jobId, timeout);
}

async function uploadAsset(event, kind) {
  const input = event.currentTarget;
  const files = input?.files;
  if (!files || !files.length) return;
  const file = files[0];
  const session = await ensureSession();
  if (!session) return;
  const sceneId = state.currentSceneId;
  const ownerId = session.user.id;
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${ownerId}/${sceneId || 'shared'}/${Date.now()}_${safeName}`;
  setStatus('Uploading asset…', 'loading');
  try {
    const { error: uploadError } = await supabase.storage
      .from(REF_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/png',
      });
    if (uploadError) {
      throw uploadError;
    }
    const insertPayload = {
      owner_id: ownerId,
      scene_id: kind === 'reference' ? sceneId : sceneId,
      kind,
      storage_path: path,
      metadata: {
        bucket: REF_BUCKET,
        name: file.name,
        size: file.size,
        type: file.type,
        uploaded_at: new Date().toISOString(),
      },
    };
    if (kind === 'mask') {
      insertPayload.metadata.role = 'mask';
    }
    const { error: insertError } = await supabase.from('assets').insert(insertPayload);
    if (insertError) {
      throw insertError;
    }
    await refreshSceneState(sceneId);
    setStatus(kind === 'reference' ? 'Reference uploaded' : 'Mask uploaded', 'idle');
  } catch (error) {
    console.error('Upload failed', error);
    showError('Failed to upload asset.');
    setStatus('Upload failed', 'idle');
  } finally {
    if (input) {
      input.value = '';
    }
  }
}

async function handleUseAsReference(asset) {
  if (!asset || !supabase) return;
  try {
    const updates = {
      kind: 'reference',
      metadata: {
        ...(asset.metadata || {}),
        bucket: asset.metadata?.bucket || RENDER_BUCKET,
        promoted_at: new Date().toISOString(),
      },
    };
    if (!asset.scene_id && state.currentSceneId) {
      updates.scene_id = state.currentSceneId;
    }
    const { error } = await supabase
      .from('assets')
      .update(updates)
      .eq('id', asset.id);
    if (error) throw error;
    await refreshSceneState(state.currentSceneId);
    setStatus('Saved as reference', 'idle');
  } catch (error) {
    console.error('Failed to promote asset', error);
    showError('Unable to save as reference.');
  }
}

function setupEventListeners() {
  if (!modal) return;
  if (elements.dismissButtons) {
    elements.dismissButtons.forEach(button => {
      button.addEventListener('click', () => {
        closeModal();
      });
    });
  }
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeModal();
    }
  });
  if (elements.form) {
    elements.form.addEventListener('submit', startGeneration);
  }
  if (elements.referenceUpload) {
    elements.referenceUpload.addEventListener('change', event => uploadAsset(event, 'reference'));
  }
  if (elements.maskUpload) {
    elements.maskUpload.addEventListener('change', event => uploadAsset(event, 'mask'));
  }
}

function resumeActiveJobs() {
  state.jobsByScene.forEach(({ jobId }, sceneId) => {
    schedulePoll(sceneId, jobId);
  });
}

if (modal) {
  setupEventListeners();
  document.addEventListener('storyboard:scenes-rendered', () => {
    bindButtons();
  });
  document.addEventListener('storyboard:scene-activated', event => {
    const sceneId = event?.detail?.sceneId;
    if (!sceneId || sceneId === state.currentSceneId || !modal || modal.dataset.open !== 'true') return;
    if (elements.sceneInput) {
      elements.sceneInput.value = sceneId;
    }
    state.currentSceneId = sceneId;
    populateSeed(sceneId);
    prefillPrompt(sceneId);
    refreshSceneState(sceneId);
  });
  bindButtons();
  resumeActiveJobs();
}
