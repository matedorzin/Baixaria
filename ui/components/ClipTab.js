const formatTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
const formatPrecise = (value) => {
  const centiseconds = Math.max(0, Math.round((Number(value) || 0) * 100))
  return `${formatTime(Math.floor(centiseconds / 100))}.${String(centiseconds % 100).padStart(2, '0')}`
}

export class ClipTab {
  constructor({ root, api, setStatus, appInfo, settings, onSuccess }) {
    this.root = root; this.api = api; this.setStatus = setStatus; this.appInfo = appInfo
    this.onSuccess = onSuccess
    this.folder = settings?.downloadFolder || ''; this.info = null; this.url = ''; this.clips = []
    this.active = 0; this.cookiesPath = appInfo?.cookiesPath || ''; this.cookiesFromBrowser = ''; this.loading = false
    this.exportFormat = 'video'; this.dragging = ''; this.scrubTimer = null; this.lastScrubAt = 0
    this.lastFrameAt = 0; this.lastScrubPosition = 0; this.volume = 0.8; this.muted = false
    this.playhead = 0; this.exportOpen = false; this.exportName = ''; this.previewSelected = false; this.joinClips = false
    this.waveformImage = ''; this.waveformStatus = ''; this.waveformRequest = 0; this.exporting = false
    this.zoomRequest = 0; this.zoomTimer = null; this.zoomCenter = null; this.zoomStart = 0; this.zoomSpan = 8
    this.api.onClipExportProgress?.((progress) => this.showExportProgress(progress))
  }

  setDefaultFolder(folder) { this.folder = folder }
  mount() { this.render() }

  render() {
    const duration = Number(this.info?.duration) || 0
    const hasClip = this.clips.length > 0
    const current = this.clips[this.active] || { start: 0, end: Math.max(1, duration) }
    const percent = duration ? (Number(current.start) / duration) * 100 : 0
    const endPercent = duration ? (Number(current.end) / duration) * 100 : 100
    this.root.innerHTML = `
      <div class="card clip-source"><div class="clip-source-row"><label for="clip-url">Link do vídeo <small>ビデオのリンク</small></label><input id="clip-url" type="url" placeholder="Cole o link do vídeo" value="${this.escape(this.url)}"><button class="primary-btn" id="clip-load" type="button" ${this.loading ? 'disabled' : ''}>${this.loading ? 'Carregando…' : 'Carregar vídeo'}</button></div>
        ${this.info ? `<div class="clip-meta"><strong title="${this.escape(this.info.title)}">${this.escape(this.info.title)}</strong><span>${formatTime(duration)}</span></div>` : ''}
      </div>
      ${!this.info && this.loading ? `<div class="card"><div class="clip-loading-preview ratio-${this.pendingAspect || 'landscape'}"><span class="clip-loader"></span><span>Buscando vídeo na internet…</span></div></div>` : ''}
      ${this.info ? `<div class="card clip-editor">
        <div class="clip-preview-frame ratio-${this.info.aspect || 'landscape'}">${this.info.previewUrl ? `<video class="clip-preview" id="clip-preview" preload="metadata" playsinline src="${this.escape(this.info.previewUrl)}"></video>${this.info.thumbnail ? `<img class="clip-preview-cover" id="clip-preview-cover" src="${this.escape(this.info.thumbnail)}" alt="">` : ''}<div class="clip-buffering active" id="clip-buffering" role="status"><span class="clip-loader"></span><span id="clip-buffering-text">Carregando prévia pela internet…</span></div>${this.info.previewAudioUrl ? `<audio id="clip-preview-audio" preload="metadata" src="${this.escape(this.info.previewAudioUrl)}"></audio>` : ''}<div class="clip-preview-scrub" id="clip-scrub-overlay" hidden><div class="clip-scrub-card"><span>Início <b id="clip-overlay-start-time">${formatPrecise(current.start)}</b></span><video id="clip-overlay-start" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video></div><div class="clip-scrub-card"><span>Fim <b id="clip-overlay-end-time">${formatPrecise(current.end)}</b></span><video id="clip-overlay-end" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video></div></div>` : `<div class="clip-poster">${this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : ''}<span class="clip-poster-label">Prévia indisponível. Você ainda pode escolher os tempos abaixo.</span></div>`}</div>
        <div class="clip-player-controls"><button class="clip-icon-button" id="clip-play" type="button" title="Reproduzir" aria-label="Reproduzir" ${this.info.previewUrl ? '' : 'disabled'}><img class="raster-icon" src="./assets/ui/play.png" alt=""></button><span id="clip-play-time">${formatTime(this.playhead)} / ${formatTime(duration)}</span><div class="clip-volume"><button class="clip-icon-button" id="clip-mute" type="button" title="${this.muted ? 'Ativar som' : 'Silenciar'}" aria-label="${this.muted ? 'Ativar som' : 'Silenciar'}"><img class="raster-icon" src="./assets/ui/${this.muted ? 'mute' : 'volume'}.png" alt=""></button><input id="clip-volume" type="range" min="0" max="1" step="0.01" value="${this.volume}" aria-label="Volume"></div></div>
        <div class="clip-boundary-strip ${this.info.aspect === 'portrait' ? 'portrait' : ''}"><div class="clip-boundary"><div class="clip-boundary-image">${this.info.previewUrl ? `<video id="clip-thumb-start" muted preload="metadata" playsinline poster="${this.escape(this.info.thumbnail || '')}" data-src="${this.escape(this.info.previewUrl)}"></video>` : (this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : '')}</div><span>Início · <b id="clip-thumb-start-time">${formatPrecise(current.start)}</b></span></div><div class="clip-boundary"><div class="clip-boundary-image">${this.info.previewUrl ? `<video id="clip-thumb-end" muted preload="metadata" playsinline poster="${this.escape(this.info.thumbnail || '')}" data-src="${this.escape(this.info.previewUrl)}"></video>` : (this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : '')}</div><span>Fim · <b id="clip-thumb-end-time">${formatPrecise(current.end)}</b></span></div></div>
        <div class="clip-track" style="--clip-start:${percent}%;--clip-end:${endPercent}%"><div class="clip-zoom" id="clip-zoom"><div class="clip-zoom-caption"><strong id="clip-zoom-title">AMPLIANDO ÁUDIO</strong><span id="clip-zoom-time">00:00:00.00</span></div><div class="clip-zoom-wave" id="clip-zoom-wave"><span>Analisando detalhe do áudio…</span><i id="clip-zoom-cursor"></i></div><div class="clip-zoom-scale"><span id="clip-zoom-start">00:00:00.00</span><span id="clip-zoom-end">00:00:08.00</span></div></div><div class="clip-track-grid"></div><div class="clip-waveform" id="clip-waveform">${this.waveformImage ? `<img src="${this.waveformImage}" alt="Forma de onda do áudio">` : `<span>${this.escape(this.waveformStatus || 'Analisando áudio…')}</span>`}</div>${this.clips.map((clip, i) => `<span class="clip-track-region ${i === this.active ? 'active' : ''}" style="left:${clip.start / duration * 100}%;width:${Math.max(.3, (clip.end - clip.start) / duration * 100)}%" title="Trecho ${i + 1}: ${formatPrecise(clip.start)} a ${formatPrecise(clip.end)}"></span>`).join('')}<div class="clip-track-selection"></div></div>
        <div class="clip-timeline-playhead"><input id="clip-playhead" type="range" min="0" max="${duration}" step="0.01" value="${this.playhead}" aria-label="Posição de reprodução no vídeo"><span class="clip-playhead-needle" id="clip-playhead-needle" style="left:${duration ? this.playhead / duration * 100 : 0}%" aria-hidden="true"></span><output id="clip-playhead-time" style="left:${duration ? Math.min(96, Math.max(4, this.playhead / duration * 100)) : 4}%">${formatPrecise(this.playhead)}</output></div>
        <div class="clip-range-stack"><input class="clip-slider start" id="clip-start-slider" aria-label="Início do clipe" type="range" min="0" max="${duration}" value="${current.start}" step="0.01" ${hasClip ? '' : 'disabled'}><input class="clip-slider end" id="clip-end-slider" aria-label="Fim do clipe" type="range" min="0" max="${duration}" value="${current.end}" step="0.01" ${hasClip ? '' : 'disabled'}></div>
        <div class="clip-range-fields"><label>Início · segundos<input type="number" id="clip-start" min="0" max="${duration}" value="${current.start}" step="0.01" ${hasClip ? '' : 'disabled'}></label><label>Fim · segundos<input type="number" id="clip-end" min="0" max="${duration}" value="${current.end}" step="0.01" ${hasClip ? '' : 'disabled'}></label></div>
        <div class="clip-duration-row"><span>Trecho selecionado <b id="clip-selected-duration">${formatPrecise(current.end - current.start)}</b></span><span>Vídeo completo <b>${formatTime(duration)}</b></span></div>
        <div class="inline-actions" style="margin:12px 0"><button class="secondary-btn" id="clip-mark-start" type="button" ${hasClip ? '' : 'disabled'}>Marcar início no player</button><button class="secondary-btn" id="clip-mark-end" type="button" ${hasClip ? '' : 'disabled'}>Marcar fim no player</button><button class="ghost-btn" id="clip-add" type="button" ${this.clips.length >= 12 ? 'disabled' : ''}>＋ Adicionar trecho</button></div>
        <div class="clip-segment-list">${hasClip ? this.clips.map((clip, i) => `<div class="clip-segment-row ${i === this.active ? 'active' : ''}"><button class="clip-segment-select" data-select="${i}" type="button"><strong>Trecho ${i + 1} · ${formatPrecise(clip.end - clip.start)}</strong><span>${formatPrecise(clip.start)} – ${formatPrecise(clip.end)}</span></button><button class="clip-segment-remove" data-remove="${i}" type="button" title="Remover trecho" aria-label="Remover trecho ${i + 1}">×</button></div>`).join('') : '<div class="clip-empty">Nenhum trecho selecionado. Use “Adicionar trecho” para criar um novo.</div>'}</div>
        <div class="clip-editor-actions"><button class="secondary-btn" id="clip-view" type="button" ${hasClip ? '' : 'disabled'}>Ver trecho <small>プレビュー</small></button><button class="primary-btn" id="clip-open-export" type="button" ${hasClip ? '' : 'disabled'}>Exportar clipes <small>クリップを書き出す</small></button></div>
      </div>
      <div class="clip-export-layer ${this.exportOpen ? 'open' : ''}" id="clip-export-layer"><button class="clip-export-backdrop" id="clip-export-backdrop" type="button" aria-label="Fechar exportação"></button><div class="card clip-export-dialog" role="dialog" aria-modal="true" aria-labelledby="clip-export-title"><div class="clip-export-header"><div class="section-title" id="clip-export-title" data-jp="クリップを書き出す">Exportar clipes</div><button id="clip-export-close" type="button" aria-label="Fechar exportação">×</button></div><p class="clip-export-count">${this.clips.length} trecho${this.clips.length === 1 ? '' : 's'} selecionado${this.clips.length === 1 ? '' : 's'}</p><div class="clip-export-body">
        <div class="clip-export-modes"><button class="quality-choice ${this.exportFormat === 'video' ? 'active' : ''}" data-export-format="video" type="button"><strong>Vídeo</strong><span>MP4</span></button><button class="quality-choice ${this.exportFormat === 'audio' ? 'active' : ''}" data-export-format="audio" type="button"><strong>Só áudio</strong><span>MP3</span></button></div>
        ${this.exportFormat === 'video' ? `<div class="quality-grid">${[['best','Melhor'],['1080','1080p'],['720','720p']].map(([v,l])=>`<button class="quality-choice ${this.quality === v || (!this.quality && v === 'best') ? 'active' : ''}" data-quality="${v}" type="button"><strong>${l}</strong><span>MP4</span></button>`).join('')}</div>` : ''}
        <div class="compact-destination" style="margin-top:12px"><div class="destination-copy"><div class="destination-title">Salvar em</div><div class="destination-path">${this.escape(this.folder || 'Downloads')}</div></div><button class="folder-action" id="clip-pick-folder" type="button" aria-label="Escolher pasta"><img class="raster-icon" src="./assets/ui/folder.png" alt=""></button></div>
        <div class="field"><label for="clip-name">Nome dos arquivos</label><input id="clip-name" type="text" value="${this.escape(this.exportName || this.info.title || 'clipe')}" placeholder="clipe"></div>
        <details class="advanced-options" open><summary>Como exportar <small>書き出し方法</small></summary><div class="clip-join-options"><button type="button" data-join="separate" class="quality-choice ${this.joinClips ? '' : 'active'}">Arquivos separados</button><button type="button" data-join="join" class="quality-choice ${this.joinClips ? 'active' : ''}" ${this.clips.length < 2 ? 'disabled' : ''}>Juntar trechos</button></div><p class="helper-text">${this.joinClips ? 'Os trechos serão unidos na ordem da lista em um único arquivo.' : 'Cada trecho será salvo em um arquivo.'}</p></details>
        </div><div class="clip-export-progress" id="clip-export-progress" role="status" aria-live="polite" ${this.exporting ? '' : 'hidden'}><div class="clip-export-progress-heading"><span class="clip-loader"></span><strong id="clip-export-progress-label">Preparando clipes…</strong><span id="clip-export-progress-value"></span></div><div class="clip-export-progress-track"><span id="clip-export-progress-fill"></span></div></div><div class="clip-export-footer"><button class="secondary-btn" id="clip-export-cancel" type="button" ${this.exporting ? 'disabled' : ''}>Cancelar</button><button class="primary-btn" id="clip-export" type="button" ${hasClip && !this.exporting ? '' : 'disabled'}>${this.exporting ? 'Exportando…' : this.exportLabel()}</button></div>
        <div class="result-box" id="clip-result"></div>
      </div></div>` : ''}`
    this.bind()
  }

  bind() {
    this.root.querySelector('#clip-url').addEventListener('input', e => { this.url = e.target.value })
    this.root.querySelector('#clip-load').addEventListener('click', () => this.load())
    this.root.querySelector('#clip-url').addEventListener('keydown', e => { if (e.key === 'Enter') this.load() })
    if (!this.info) return
    for (const [id, prop, slider] of [['clip-start','start','clip-start-slider'],['clip-end','end','clip-end-slider']]) {
      const field = this.root.querySelector(`#${id}`); const range = this.root.querySelector(`#${slider}`)
      field.addEventListener('input', e => this.setTime(prop, e.target.value))
      range.addEventListener('pointerdown', () => this.beginScrub(prop))
      range.addEventListener('input', e => { this.setTime(prop, e.target.value); this.scrubAt(Number(e.target.value)) })
      range.addEventListener('pointerup', () => this.endScrub(prop))
      range.addEventListener('pointercancel', () => this.endScrub(prop))
      range.addEventListener('keyup', () => this.endScrub(prop))
    }
    this.initPreview()
    const playhead = this.root.querySelector('#clip-playhead')
    playhead?.addEventListener('input', e => this.seekPlayhead(Number(e.target.value)))
    playhead?.addEventListener('change', e => this.seekPlayhead(Number(e.target.value)))
    this.root.querySelector('#clip-add').addEventListener('click', () => {
      if (this.clips.length >= 12) return
      const start = Number(this.clips[this.active]?.end || 0)
      this.clips.push({ start: Math.min(start, Math.max(0, this.info.duration - 1)), end: Math.min(this.info.duration, start + 10) })
      this.active = this.clips.length - 1; this.render()
    })
    this.root.querySelectorAll('[data-select]').forEach(b => b.addEventListener('click', () => { this.active = Number(b.dataset.select); this.playhead = this.clips[this.active].start; this.render() }))
    this.root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { this.clips.splice(Number(b.dataset.remove), 1); this.active = Math.max(0, Math.min(this.active, this.clips.length - 1)); if (this.clips.length < 2) this.joinClips = false; this.render() }))
    this.root.querySelectorAll('[data-quality]').forEach(b => b.addEventListener('click', () => { this.quality = b.dataset.quality; this.render() }))
    this.root.querySelectorAll('[data-export-format]').forEach(b => b.addEventListener('click', () => { this.exportFormat = b.dataset.exportFormat; this.render() }))
    this.root.querySelector('#clip-open-export')?.addEventListener('click', () => this.toggleExport(true))
    for (const id of ['clip-export-backdrop', 'clip-export-close', 'clip-export-cancel']) this.root.querySelector(`#${id}`)?.addEventListener('click', () => this.toggleExport(false))
    this.root.querySelector('#clip-view')?.addEventListener('click', () => { this.previewSelected = true; this.root.querySelector('#clip-preview')?.pause(); this.seekPlayhead(this.clips[this.active]?.start || 0); this.root.querySelector('#clip-play')?.click() })
    this.root.querySelector('#clip-name')?.addEventListener('input', e => { this.exportName = e.target.value })
    this.root.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => { this.joinClips = b.dataset.join === 'join'; this.render() }))
    this.root.querySelector('#clip-mark-start')?.addEventListener('click', () => this.markFromPlayer('start'))
    this.root.querySelector('#clip-mark-end')?.addEventListener('click', () => this.markFromPlayer('end'))
    this.root.querySelector('#clip-pick-folder').addEventListener('click', async () => { const folder = await this.api.selectFolder(); if (folder) { this.folder = folder; this.render() } })
    this.root.querySelector('#clip-export').addEventListener('click', () => this.export())
  }

  toggleExport(open) {
    this.exportOpen = open
    this.root.querySelector('#clip-export-layer')?.classList.toggle('open', open)
  }

  seekPlayhead(time) {
    this.playhead = Math.max(0, Math.min(Number(this.info?.duration) || 0, Number(time) || 0))
    const player = this.root.querySelector('#clip-preview')
    if (player) this.seekFrame(player, this.playhead)
    const control = this.root.querySelector('#clip-playhead')
    if (control) control.value = this.playhead
    const stamp = this.root.querySelector('#clip-playhead-time')
    if (stamp) { stamp.textContent = formatPrecise(this.playhead); stamp.style.left = `${this.info?.duration ? Math.min(96, Math.max(4, this.playhead / this.info.duration * 100)) : 4}%` }
    const needle = this.root.querySelector('#clip-playhead-needle')
    if (needle) needle.style.left = `${this.info?.duration ? this.playhead / this.info.duration * 100 : 0}%`
    const label = this.root.querySelector('#clip-play-time')
    if (label) label.textContent = `${formatTime(this.playhead)} / ${formatTime(this.info?.duration)}`
  }

  setTime(prop, value) {
    const clip = this.clips[this.active]; if (!clip) return
    const n = Math.max(0, Math.min(Number(this.info.duration), Math.round((Number(value) || 0) * 100) / 100))
    clip[prop] = n
    if (clip.end <= clip.start) clip[prop === 'start' ? 'end' : 'start'] = prop === 'start' ? Math.min(this.info.duration, n + 0.01) : Math.max(0, n - 0.01)
    const start = this.root.querySelector('#clip-start'); const end = this.root.querySelector('#clip-end')
    const startRange = this.root.querySelector('#clip-start-slider'); const endRange = this.root.querySelector('#clip-end-slider')
    if (start) start.value = clip.start
    if (end) end.value = clip.end
    if (startRange) startRange.value = clip.start
    if (endRange) endRange.value = clip.end
    const track = this.root.querySelector('.clip-track')
    if (track) { track.style.setProperty('--clip-start', `${clip.start / this.info.duration * 100}%`); track.style.setProperty('--clip-end', `${clip.end / this.info.duration * 100}%`) }
    const selected = this.root.querySelector(`[data-select="${this.active}"]`)
    if (selected) selected.innerHTML = `<strong>Trecho ${this.active + 1} · ${formatPrecise(clip.end - clip.start)}</strong><span>${formatPrecise(clip.start)} – ${formatPrecise(clip.end)}</span>`
    const selectedDuration = this.root.querySelector('#clip-selected-duration')
    if (selectedDuration) selectedDuration.textContent = formatPrecise(clip.end - clip.start)
    const region = this.root.querySelectorAll('.clip-track-region')[this.active]
    if (region) { region.style.left = `${clip.start / this.info.duration * 100}%`; region.style.width = `${(clip.end - clip.start) / this.info.duration * 100}%` }
    for (const side of ['start', 'end']) {
      const stamp = formatPrecise(clip[side])
      const thumbTime = this.root.querySelector(`#clip-thumb-${side}-time`)
      const overlayTime = this.root.querySelector(`#clip-overlay-${side}-time`)
      if (thumbTime) thumbTime.textContent = stamp
      if (overlayTime) overlayTime.textContent = stamp
      if (!this.dragging) this.seekFrame(this.root.querySelector(`#clip-thumb-${side}`), clip[side])
    }
    const playTime = this.root.querySelector('#clip-play-time')
    if (playTime) playTime.textContent = `${formatTime(this.playhead)} / ${formatTime(this.info.duration)}`
  }

  exportLabel() {
    if (this.joinClips && this.clips.length > 1) return 'Exportar 1 arquivo'
    const unit = this.exportFormat === 'audio' ? 'áudio' : 'clipe'
    return `Exportar ${this.clips.length} ${unit}${this.clips.length === 1 ? '' : 's'}`
  }

  seekFrame(video, time) {
    if (!video || video.readyState < 1) return
    const extent = Number.isFinite(video.duration) ? video.duration : Number(this.info?.duration) || time + 1
    const target = Math.min(Math.max(0, time), Math.max(0, extent - 0.05))
    if (Math.abs(video.currentTime - target) > 0.12) video.currentTime = target
  }

  initPreview() {
    const player = this.root.querySelector('#clip-preview')
    if (!player) return
    const audio = this.root.querySelector('#clip-preview-audio')
    const clip = this.clips[this.active] || { start: 0, end: Number(this.info?.duration) || 1 }
    const cover = this.root.querySelector('#clip-preview-cover')
    const playButton = this.root.querySelector('#clip-play')
    const muteButton = this.root.querySelector('#clip-mute')
    const volumeControl = this.root.querySelector('#clip-volume')
    const buffering = this.root.querySelector('#clip-buffering')
    const bufferingText = this.root.querySelector('#clip-buffering-text')
    const setBuffering = (visible, label = 'Carregando prévia pela internet…') => {
      buffering?.classList.toggle('active', visible)
      if (bufferingText) bufferingText.textContent = label
    }
    const setPlayButton = (playing) => {
      if (!playButton) return
      playButton.innerHTML = `<img class="raster-icon" src="./assets/ui/${playing ? 'pause' : 'play'}.png" alt="">`
      playButton.setAttribute('aria-label', playing ? 'Pausar trecho' : 'Reproduzir trecho')
      playButton.title = playing ? 'Pausar trecho' : 'Reproduzir trecho'
    }
    const applyVolume = () => {
      player.volume = this.volume; player.muted = this.muted
      if (audio) { audio.volume = this.volume; audio.muted = this.muted }
      if (muteButton) { muteButton.innerHTML = `<img class="raster-icon" src="./assets/ui/${this.muted ? 'mute' : 'volume'}.png" alt="">`; muteButton.setAttribute('aria-label', this.muted ? 'Ativar som' : 'Silenciar'); muteButton.title = this.muted ? 'Ativar som' : 'Silenciar' }
    }
    volumeControl?.addEventListener('input', () => { this.volume = Number(volumeControl.value); this.muted = this.volume === 0; applyVolume() })
    muteButton?.addEventListener('click', () => { this.muted = !this.muted; if (!this.muted && this.volume === 0) { this.volume = 0.8; volumeControl.value = this.volume }; applyVolume() })
    applyVolume()
    const syncAudio = () => {
      if (!audio || this.dragging) return
      if (Math.abs(audio.currentTime - player.currentTime) > 0.3) audio.currentTime = player.currentTime
    }
    const stop = () => {
      player.pause(); audio?.pause()
      setPlayButton(false)
    }
    const revealFrame = () => {
      if (cover && player.readyState >= 2) cover.remove()
    }
    for (const side of ['start', 'end']) {
      const frame = this.root.querySelector(`#clip-thumb-${side}`)
      if (!frame?.dataset.src) continue
      let fallback = null
      if (this.info.thumbnail) {
        fallback = document.createElement('img')
        fallback.className = 'clip-boundary-fallback'
        fallback.src = this.info.thumbnail
        fallback.alt = ''
        frame.before(fallback)
      }
      const revealBoundary = () => { if (frame.readyState >= 2) { frame.classList.add('ready'); if (fallback) fallback.hidden = true } }
      frame.addEventListener('seeked', revealBoundary)
      frame.addEventListener('loadeddata', () => { if (Math.abs(frame.currentTime - clip[side]) < 0.2) revealBoundary() })
      frame.addEventListener('loadedmetadata', () => this.seekFrame(frame, clip[side]), { once: true })
      frame.addEventListener('error', () => { frame.style.display = 'none' })
      frame.src = frame.dataset.src
    }
    player.addEventListener('loadeddata', () => {
      revealFrame()
      setBuffering(false)
    }, { once: true })
    player.addEventListener('seeked', () => { revealFrame(); if (player.readyState >= 2) setBuffering(false) })
    player.addEventListener('canplay', () => setBuffering(false))
    player.addEventListener('playing', () => setBuffering(false))
    player.addEventListener('waiting', () => setBuffering(true, 'Aguardando dados do vídeo…'))
    player.addEventListener('stalled', () => setBuffering(true, 'Conexão lenta. Aguardando vídeo…'))
    player.addEventListener('seeking', () => setBuffering(true, 'Buscando frame pela internet…'))
    player.addEventListener('loadedmetadata', () => {
      const actualAspect = this.aspectFromDimensions(player.videoWidth, player.videoHeight)
      if (actualAspect && actualAspect !== this.info.aspect) {
        this.info.aspect = actualAspect
        const frame = this.root.querySelector('.clip-preview-frame')
        frame?.classList.remove('ratio-landscape', 'ratio-portrait', 'ratio-square')
        frame?.classList.add(`ratio-${actualAspect}`)
        const boundary = this.root.querySelector('.clip-boundary-strip')
        boundary?.classList.toggle('portrait', actualAspect === 'portrait')
      }
      if (this.playhead === 0 && player.duration > 0.2) player.currentTime = 0.12
      else this.seekFrame(player, this.playhead)
    }, { once: true })
    player.addEventListener('timeupdate', () => {
      if (this.dragging) return
      if (this.previewSelected && player.currentTime >= clip.end) { stop(); this.previewSelected = false; this.seekPlayhead(clip.start); return }
      syncAudio()
      this.playhead = player.currentTime
      const control = this.root.querySelector('#clip-playhead')
      if (control) control.value = player.currentTime
      const stamp = this.root.querySelector('#clip-playhead-time')
      if (stamp) { stamp.textContent = formatPrecise(player.currentTime); stamp.style.left = `${this.info.duration ? Math.min(96, Math.max(4, player.currentTime / this.info.duration * 100)) : 4}%` }
      const needle = this.root.querySelector('#clip-playhead-needle')
      if (needle) needle.style.left = `${this.info.duration ? player.currentTime / this.info.duration * 100 : 0}%`
      const label = this.root.querySelector('#clip-play-time')
      if (label) label.textContent = `${formatTime(player.currentTime)} / ${formatTime(this.info.duration)}`
    })
    player.addEventListener('seeking', syncAudio)
    player.addEventListener('pause', () => { if (!this.dragging) audio?.pause(); setPlayButton(false) })
    player.addEventListener('error', () => { setBuffering(false); this.setStatus('O servidor do vídeo não liberou a prévia. O corte ainda pode ser exportado.', 'error') })
    playButton?.addEventListener('click', async () => {
      if (!player.paused) { stop(); this.previewSelected = false; return }
      if (player.ended) this.seekFrame(player, this.playhead < this.info.duration - 0.2 ? this.playhead : 0)
      if (audio) { audio.currentTime = player.currentTime; audio.play().catch(() => {}) }
      try { await player.play(); setPlayButton(true) }
      catch { audio?.pause(); this.setStatus('Não foi possível tocar a prévia deste vídeo.', 'error') }
    })
    this.seekFrame(player, this.playhead)
  }

  beginScrub(prop) {
    if (!this.clips[this.active]) return
    this.dragging = prop
    this.lastScrubPosition = this.clips[this.active][prop]
    this.showZoom(prop, this.lastScrubPosition, true)
    this.root.querySelector('#clip-preview')?.pause()
    const overlay = this.root.querySelector('#clip-scrub-overlay')
    if (overlay) overlay.hidden = false
    for (const side of ['start', 'end']) {
      const frame = this.root.querySelector(`#clip-overlay-${side}`)
      if (frame && !frame.src && frame.dataset.src) {
        frame.addEventListener('loadedmetadata', () => this.seekFrame(frame, this.clips[this.active][side]), { once: true })
        frame.src = frame.dataset.src
      }
      this.seekFrame(frame, this.clips[this.active][side])
    }
  }

  scrubAt(time) {
    if (!this.dragging) return
    this.showZoom(this.dragging, time)
    const now = performance.now()
    if (now - this.lastFrameAt >= 110) {
      this.seekFrame(this.root.querySelector(`#clip-overlay-${this.dragging}`), time)
      this.lastFrameAt = now
    }
    if (now - this.lastScrubAt < 160) return
    const delta = time - this.lastScrubPosition
    this.lastScrubPosition = time
    this.lastScrubAt = now
    const audio = this.root.querySelector('#clip-preview-audio') || this.root.querySelector('#clip-preview')
    if (!audio || !Number.isFinite(audio.duration)) return
    clearTimeout(this.scrubTimer)
    audio.pause()
    audio.currentTime = Math.min(time, Math.max(0, audio.duration - 0.1))
    audio.playbackRate = Math.min(2.5, Math.max(0.7, Math.abs(delta) / 2 || 1))
    audio.play().catch(() => {})
    this.scrubTimer = setTimeout(() => audio.pause(), 140)
  }

  endScrub(prop) {
    if (this.dragging !== prop) return
    if (!this.clips[this.active]) { this.dragging = ''; return }
    this.dragging = 'restore'
    const editor = this.root.querySelector('.clip-editor')
    editor?.classList.remove('zoom-active')
    if (editor) delete editor.dataset.zoomSide
    clearTimeout(this.zoomTimer)
    this.zoomRequest += 1
    clearTimeout(this.scrubTimer)
    const audio = this.root.querySelector('#clip-preview-audio') || this.root.querySelector('#clip-preview')
    audio?.pause()
    if (audio) audio.playbackRate = 1
    const overlay = this.root.querySelector('#clip-scrub-overlay')
    if (overlay) overlay.hidden = true
    this.seekFrame(this.root.querySelector(`#clip-thumb-${prop}`), this.clips[this.active][prop])
    const player = this.root.querySelector('#clip-preview')
    if (player) {
      player.addEventListener('seeked', () => { if (this.dragging === 'restore') this.dragging = '' }, { once: true })
      this.seekFrame(player, this.playhead)
      setTimeout(() => { if (this.dragging === 'restore') this.dragging = '' }, 600)
    } else this.dragging = ''
  }

  showZoom(prop, time, force = false) {
    const editor = this.root.querySelector('.clip-editor')
    if (!editor) return
    editor.classList.add('zoom-active')
    editor.dataset.zoomSide = prop
    const track = this.root.querySelector('.clip-track')
    const lens = this.root.querySelector('#clip-zoom')
    if (track && lens) {
      const half = Math.min(125, track.clientWidth / 2)
      const position = Number(this.info?.duration) ? time / this.info.duration * track.clientWidth : half
      lens.style.left = `${Math.max(half, Math.min(track.clientWidth - half, position))}px`
    }
    const title = this.root.querySelector('#clip-zoom-title')
    const stamp = this.root.querySelector('#clip-zoom-time')
    if (title) title.textContent = prop === 'start' ? 'AJUSTANDO INÍCIO' : 'AJUSTANDO FIM'
    if (stamp) stamp.textContent = formatPrecise(time)
    const duration = Number(this.info?.duration) || 0
    this.zoomSpan = Math.min(8, Math.max(1, duration))
    this.zoomStart = Math.max(0, Math.min(Math.max(0, duration - this.zoomSpan), time - this.zoomSpan / 2))
    this.zoomCenter = time
    this.renderZoomWaveform()
    this.updateZoomCursor(time)
  }

  updateZoomCursor(time) {
    const cursor = this.root.querySelector('#clip-zoom-cursor')
    if (cursor) cursor.style.left = `${Math.max(0, Math.min(100, (time - this.zoomStart) / this.zoomSpan * 100))}%`
  }

  renderZoomWaveform() {
    const duration = Number(this.info?.duration) || 0
    const wave = this.root.querySelector('#clip-zoom-wave')
    if (!wave) return
    let message = wave.querySelector('span')
    if (!message) { message = document.createElement('span'); wave.prepend(message) }
    message.textContent = this.waveformStatus || 'Analisando áudio…'
    this.root.querySelector('#clip-zoom-start').textContent = formatPrecise(this.zoomStart)
    this.root.querySelector('#clip-zoom-end').textContent = formatPrecise(this.zoomStart + this.zoomSpan)
    if (!this.waveformImage || !duration) return
    message.remove()
    let img = wave.querySelector('img')
    if (!img) { img = document.createElement('img'); img.alt = 'Mesmo espectro da faixa, ampliado'; wave.prepend(img) }
    if (img.src !== this.waveformImage) img.src = this.waveformImage
    const width = wave.clientWidth * duration / this.zoomSpan
    img.style.width = `${width}px`
    img.style.left = `${-this.zoomStart / duration * width}px`
  }

  markFromPlayer(prop) { const player = this.root.querySelector('#clip-preview'); if (player) this.setTime(prop, player.currentTime) }

  aspectFromDimensions(width, height) {
    const w = Number(width); const h = Number(height)
    if (!(w > 0 && h > 0)) return ''
    const ratio = w / h
    return ratio <= 0.8 ? 'portrait' : ratio >= 1.3 ? 'landscape' : 'square'
  }

  guessAspectFromUrl(url) {
    try {
      const parsed = new URL(url)
      if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(parsed.hostname.toLowerCase()) && /^\/shorts\//.test(parsed.pathname)) return 'portrait'
    } catch {}
    return 'landscape'
  }

  async load() {
    const waveformRequest = ++this.waveformRequest
    this.waveformImage = ''; this.waveformStatus = 'Analisando áudio…'
    this.url = this.root.querySelector('#clip-url').value.trim()
    this.pendingAspect = this.guessAspectFromUrl(this.url)
    this.info = null; this.clips = []; this.active = 0; this.playhead = 0; this.exportOpen = false; this.exportName = ''; this.previewSelected = false; this.joinClips = false
    this.loading = true; this.render(); this.setStatus('Lendo informações do vídeo…', 'working')
    const result = await this.api.fetchClipInfo(this.url, this.cookiesPath, this.cookiesFromBrowser)
    this.loading = false
    if (result.error) { this.render(); this.setStatus(result.error, 'error'); return }
    this.info = result.video
    if (!Number(this.info?.duration)) { this.info = null; this.render(); this.setStatus('Esse vídeo não tem uma duração disponível para selecionar trechos.', 'error'); return }
    this.info.aspect = this.pendingAspect === 'portrait'
      ? 'portrait'
      : this.aspectFromDimensions(this.info.width, this.info.height) || this.pendingAspect
    this.clips = [{ start: 0, end: Math.max(1, Math.floor(Number(this.info.duration))) }]; this.active = 0
    this.render(); this.setStatus('Vídeo carregado. Escolha os trechos.')
    this.loadWaveform(waveformRequest)
  }

  async loadWaveform(requestId) {
    let result
    try { result = await this.api.getClipWaveform(this.info?.previewAudioUrl || this.info?.previewUrl) }
    catch { result = { error: 'Forma de onda indisponível' } }
    if (requestId !== this.waveformRequest) return
    this.waveformImage = result?.image || ''
    this.waveformStatus = result?.error || 'Forma de onda indisponível'
    const target = this.root.querySelector('#clip-waveform')
    if (target) target.innerHTML = this.waveformImage
      ? `<img src="${this.waveformImage}" alt="Forma de onda do áudio">`
      : `<span>${this.escape(this.waveformStatus)}</span>`
    if (this.root.querySelector('.clip-editor')?.classList.contains('zoom-active')) this.renderZoomWaveform()
  }

  showExportProgress(progress) {
    if (!this.exporting) return
    const panel = this.root.querySelector('#clip-export-progress')
    if (!panel) return
    panel.hidden = false
    const label = this.root.querySelector('#clip-export-progress-label')
    const value = this.root.querySelector('#clip-export-progress-value')
    const fill = this.root.querySelector('#clip-export-progress-fill')
    if (label) label.textContent = progress.label || 'Exportando clipes…'
    if (value) value.textContent = progress.phase === 'join' ? '' : `${Math.round(progress.percent || 0)}%`
    panel.classList.toggle('joining', progress.phase === 'join')
    if (fill) fill.style.width = `${Math.max(2, Math.min(100, progress.percent || 0))}%`
  }

  async export() {
    if (this.clips.length === 0) { this.setStatus('Adicione ao menos um trecho antes de exportar.', 'error'); return }
    const name = this.root.querySelector('#clip-name').value.trim() || 'clipe'
    if (this.clips.some(c => c.end - c.start < 1)) { this.setStatus('Cada trecho precisa ter ao menos 1 segundo.', 'error'); return }
    const button = this.root.querySelector('#clip-export'); button.disabled = true; button.textContent = 'Exportando…'
    this.exporting = true
    this.showExportProgress({ phase: 'download', percent: 0, label: `Baixando clipe 1 de ${this.clips.length}` })
    this.setStatus(`${this.exportFormat === 'audio' ? 'Extraindo áudio' : 'Baixando clipes'} (${this.clips.length})…`, 'working')
    let result
    try { result = await this.api.downloadClips({ url: this.url, clips: this.clips, duration: this.info.duration, folder: this.folder, filename: name, quality: this.quality || 'best', format: this.exportFormat, joinClips: this.joinClips, cookiesPath: this.cookiesPath, cookiesFromBrowser: this.cookiesFromBrowser }) }
    catch (error) { result = { error: error.message || 'Não foi possível exportar.' } }
    this.exporting = false
    button.disabled = false; button.textContent = this.exportLabel()
    const box = this.root.querySelector('#clip-result'); box.className = `result-box ${result.success ? 'success' : 'error'} show`; box.replaceChildren(document.createTextNode(result.success ? 'Arquivos salvos. ' : result.error || 'Falha ao baixar. '))
    if (result.folder) { const open = document.createElement('button'); open.className = 'open-btn'; open.textContent = 'Abrir pasta'; open.addEventListener('click', () => this.api.openFolder(result.folder)); box.append(open) }
    this.setStatus(result.success ? 'Arquivos salvos. Você pode abrir a pasta e compartilhar pelo app que preferir.' : 'Erro ao baixar clipes.', result.success ? '' : 'error')
    if (result.success) this.onSuccess?.()
  }

  escape(value) { return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
}
