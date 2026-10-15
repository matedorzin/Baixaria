const formatTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export class ClipTab {
  constructor({ root, api, setStatus, appInfo, settings }) {
    this.root = root; this.api = api; this.setStatus = setStatus; this.appInfo = appInfo
    this.folder = settings?.downloadFolder || ''; this.info = null; this.url = ''; this.clips = []
    this.active = 0; this.cookiesPath = appInfo?.cookiesPath || ''; this.cookiesFromBrowser = ''; this.loading = false
    this.exportFormat = 'video'; this.dragging = ''; this.scrubTimer = null; this.lastScrubAt = 0
    this.lastFrameAt = 0; this.lastScrubPosition = 0; this.volume = 0.8; this.muted = false
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
      <div class="card"><div class="section-title">Criar clipes</div>
        <div class="row two"><input id="clip-url" type="url" placeholder="Cole o link de um vídeo ou VOD do YouTube/Twitch" value="${this.escape(this.url)}"><button class="primary-btn" id="clip-load" type="button" ${this.loading ? 'disabled' : ''}>${this.loading ? 'Carregando…' : 'Carregar vídeo'}</button></div>
        <div class="helper-text">O vídeo é lido diretamente pelo link, sem fechar o navegador.</div>
        ${this.info ? `<div class="clip-meta"><strong title="${this.escape(this.info.title)}">${this.escape(this.info.title)}</strong><span>${formatTime(duration)}</span></div>` : ''}
      </div>
      ${!this.info && this.loading ? `<div class="card"><div class="clip-loading-preview ratio-${this.pendingAspect || 'landscape'}"><span class="clip-loader"></span><span>Buscando vídeo na internet…</span></div></div>` : ''}
      ${this.info ? `<div class="card">
        <div class="clip-preview-frame ratio-${this.info.aspect || 'landscape'}">${this.info.previewUrl ? `<video class="clip-preview" id="clip-preview" preload="metadata" playsinline src="${this.escape(this.info.previewUrl)}"></video>${this.info.thumbnail ? `<img class="clip-preview-cover" id="clip-preview-cover" src="${this.escape(this.info.thumbnail)}" alt="">` : ''}<div class="clip-buffering active" id="clip-buffering" role="status"><span class="clip-loader"></span><span id="clip-buffering-text">Carregando prévia pela internet…</span></div>${this.info.previewAudioUrl ? `<audio id="clip-preview-audio" preload="metadata" src="${this.escape(this.info.previewAudioUrl)}"></audio>` : ''}<div class="clip-preview-scrub" id="clip-scrub-overlay" hidden><div class="clip-scrub-card"><span>Início <b id="clip-overlay-start-time">${formatTime(current.start)}</b></span><video id="clip-overlay-start" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video></div><div class="clip-scrub-card"><span>Fim <b id="clip-overlay-end-time">${formatTime(current.end)}</b></span><video id="clip-overlay-end" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video></div></div>` : `<div class="clip-poster">${this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : ''}<span class="clip-poster-label">Prévia indisponível. Você ainda pode escolher os tempos abaixo.</span></div>`}</div>
        <div class="clip-player-controls"><button class="clip-icon-button" id="clip-play" type="button" title="Reproduzir trecho" aria-label="Reproduzir trecho" ${this.info.previewUrl ? '' : 'disabled'}><img class="raster-icon" src="./assets/ui/play.png" alt=""></button><span id="clip-play-time">${formatTime(current.start)} / ${formatTime(current.end)}</span><div class="clip-volume"><button class="clip-icon-button" id="clip-mute" type="button" title="${this.muted ? 'Ativar som' : 'Silenciar'}" aria-label="${this.muted ? 'Ativar som' : 'Silenciar'}"><img class="raster-icon" src="./assets/ui/${this.muted ? 'mute' : 'volume'}.png" alt=""></button><input id="clip-volume" type="range" min="0" max="1" step="0.01" value="${this.volume}" aria-label="Volume"></div></div>
        <div class="clip-boundary-strip ${this.info.aspect === 'portrait' ? 'portrait' : ''}"><div class="clip-boundary"><div class="clip-boundary-image">${this.info.previewUrl ? `<video id="clip-thumb-start" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video>` : (this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : '')}</div><span>Início · <b id="clip-thumb-start-time">${formatTime(current.start)}</b></span></div><div class="clip-boundary"><div class="clip-boundary-image">${this.info.previewUrl ? `<video id="clip-thumb-end" muted preload="none" playsinline data-src="${this.escape(this.info.previewUrl)}"></video>` : (this.info.thumbnail ? `<img src="${this.escape(this.info.thumbnail)}" alt="">` : '')}</div><span>Fim · <b id="clip-thumb-end-time">${formatTime(current.end)}</b></span></div></div>
        <div class="clip-track" style="--clip-start:${percent}%;--clip-end:${endPercent}%"><div class="clip-track-selection"></div></div>
        <div class="clip-range-stack"><input class="clip-slider start" id="clip-start-slider" aria-label="Início do clipe" type="range" min="0" max="${duration}" value="${current.start}" step="1" ${hasClip ? '' : 'disabled'}><input class="clip-slider end" id="clip-end-slider" aria-label="Fim do clipe" type="range" min="0" max="${duration}" value="${current.end}" step="1" ${hasClip ? '' : 'disabled'}></div>
        <div class="clip-range-fields"><label>Início<input type="number" id="clip-start" min="0" max="${duration}" value="${current.start}" step="1" ${hasClip ? '' : 'disabled'}></label><label>Fim<input type="number" id="clip-end" min="1" max="${duration}" value="${current.end}" step="1" ${hasClip ? '' : 'disabled'}></label></div>
        <div class="inline-actions" style="margin:12px 0"><button class="secondary-btn" id="clip-mark-start" type="button" ${hasClip ? '' : 'disabled'}>Marcar início no player</button><button class="secondary-btn" id="clip-mark-end" type="button" ${hasClip ? '' : 'disabled'}>Marcar fim no player</button><button class="ghost-btn" id="clip-add" type="button" ${this.clips.length >= 12 ? 'disabled' : ''}>＋ Adicionar trecho</button></div>
        <div class="clip-segment-list">${hasClip ? this.clips.map((clip, i) => `<div class="clip-segment-row ${i === this.active ? 'active' : ''}"><button class="clip-segment-select" data-select="${i}" type="button">Trecho ${i + 1} · ${formatTime(clip.start)} – ${formatTime(clip.end)}</button><button class="clip-segment-remove" data-remove="${i}" type="button" title="Remover trecho">×</button></div>`).join('') : '<div class="clip-empty">Nenhum trecho selecionado. Use “Adicionar trecho” para criar um novo.</div>'}</div>
      </div>
      <div class="card"><div class="section-title">Exportar clipes</div>
        <div class="clip-export-modes"><button class="quality-choice ${this.exportFormat === 'video' ? 'active' : ''}" data-export-format="video" type="button"><strong>Vídeo</strong><span>MP4</span></button><button class="quality-choice ${this.exportFormat === 'audio' ? 'active' : ''}" data-export-format="audio" type="button"><strong>Só áudio</strong><span>MP3</span></button></div>
        ${this.exportFormat === 'video' ? `<div class="quality-grid">${[['best','Melhor'],['1080','1080p'],['720','720p']].map(([v,l])=>`<button class="quality-choice ${this.quality === v || (!this.quality && v === 'best') ? 'active' : ''}" data-quality="${v}" type="button"><strong>${l}</strong><span>MP4</span></button>`).join('')}</div>` : ''}
        <div class="compact-destination" style="margin-top:12px"><div class="destination-copy"><div class="destination-title">Salvar em</div><div class="destination-path">${this.escape(this.folder || 'Downloads')}</div></div><button class="folder-action" id="clip-pick-folder" type="button" aria-label="Escolher pasta"><img class="raster-icon" src="./assets/ui/folder.png" alt=""></button></div>
        <details class="advanced-options" style="margin-top:14px"><summary>Opções avançadas</summary><div class="field"><label>Nome dos arquivos</label><input id="clip-name" type="text" value="${this.escape(this.info.title || 'clipe')}" placeholder="clipe"></div></details>
        <button class="primary-btn" id="clip-export" type="button" style="width:100%;margin-top:12px" ${hasClip ? '' : 'disabled'}>${this.exportLabel()}</button>
        <div class="result-box" id="clip-result"></div>
      </div>` : ''}`
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
    this.root.querySelector('#clip-add').addEventListener('click', () => {
      if (this.clips.length >= 12) return
      const start = Number(this.clips[this.active]?.end || 0)
      this.clips.push({ start: Math.min(start, Math.max(0, this.info.duration - 1)), end: Math.min(this.info.duration, start + 10) })
      this.active = this.clips.length - 1; this.render()
    })
    this.root.querySelectorAll('[data-select]').forEach(b => b.addEventListener('click', () => { this.active = Number(b.dataset.select); this.render() }))
    this.root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { this.clips.splice(Number(b.dataset.remove), 1); this.active = Math.max(0, Math.min(this.active, this.clips.length - 1)); this.render() }))
    this.root.querySelectorAll('[data-quality]').forEach(b => b.addEventListener('click', () => { this.quality = b.dataset.quality; this.render() }))
    this.root.querySelectorAll('[data-export-format]').forEach(b => b.addEventListener('click', () => { this.exportFormat = b.dataset.exportFormat; this.render() }))
    this.root.querySelector('#clip-mark-start')?.addEventListener('click', () => this.markFromPlayer('start'))
    this.root.querySelector('#clip-mark-end')?.addEventListener('click', () => this.markFromPlayer('end'))
    this.root.querySelector('#clip-pick-folder').addEventListener('click', async () => { const folder = await this.api.selectFolder(); if (folder) { this.folder = folder; this.render() } })
    this.root.querySelector('#clip-export').addEventListener('click', () => this.export())
  }

  setTime(prop, value) {
    const clip = this.clips[this.active]; if (!clip) return
    const n = Math.max(0, Math.min(Number(this.info.duration), Math.floor(Number(value) || 0)))
    clip[prop] = n
    if (clip.end <= clip.start) clip[prop === 'start' ? 'end' : 'start'] = prop === 'start' ? Math.min(this.info.duration, n + 1) : Math.max(0, n - 1)
    const start = this.root.querySelector('#clip-start'); const end = this.root.querySelector('#clip-end')
    const startRange = this.root.querySelector('#clip-start-slider'); const endRange = this.root.querySelector('#clip-end-slider')
    if (start) start.value = clip.start
    if (end) end.value = clip.end
    if (startRange) startRange.value = clip.start
    if (endRange) endRange.value = clip.end
    const track = this.root.querySelector('.clip-track')
    if (track) { track.style.setProperty('--clip-start', `${clip.start / this.info.duration * 100}%`); track.style.setProperty('--clip-end', `${clip.end / this.info.duration * 100}%`) }
    const selected = this.root.querySelector(`[data-select="${this.active}"]`)
    if (selected) selected.textContent = `Trecho ${this.active + 1} · ${formatTime(clip.start)} – ${formatTime(clip.end)}`
    for (const side of ['start', 'end']) {
      const stamp = formatTime(clip[side])
      const thumbTime = this.root.querySelector(`#clip-thumb-${side}-time`)
      const overlayTime = this.root.querySelector(`#clip-overlay-${side}-time`)
      if (thumbTime) thumbTime.textContent = stamp
      if (overlayTime) overlayTime.textContent = stamp
      if (!this.dragging) this.seekFrame(this.root.querySelector(`#clip-thumb-${side}`), clip[side])
    }
    const playTime = this.root.querySelector('#clip-play-time')
    if (playTime) playTime.textContent = `${formatTime(clip.start)} / ${formatTime(clip.end)}`
  }

  exportLabel() {
    const unit = this.exportFormat === 'audio' ? 'áudio' : 'clipe'
    return `Baixar ${this.clips.length} ${unit}${this.clips.length === 1 ? '' : 's'}`
  }

  seekFrame(video, time) {
    if (!video || !Number.isFinite(video.duration)) return
    const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05))
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
    player.addEventListener('loadeddata', () => {
      revealFrame()
      setBuffering(false)
      for (const side of ['start', 'end']) {
        const frame = this.root.querySelector(`#clip-thumb-${side}`)
        if (frame?.dataset.src && !frame.src) {
          frame.addEventListener('loadedmetadata', () => this.seekFrame(frame, clip[side]), { once: true })
          frame.src = frame.dataset.src
        }
      }
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
      if (clip.start === 0 && player.duration > 0.2) player.currentTime = 0.12
      else this.seekFrame(player, clip.start)
    }, { once: true })
    player.addEventListener('timeupdate', () => {
      if (player.currentTime >= clip.end) { stop(); this.seekFrame(player, clip.start) }
      else syncAudio()
      const label = this.root.querySelector('#clip-play-time')
      if (label) label.textContent = `${formatTime(player.currentTime)} / ${formatTime(clip.end)}`
    })
    player.addEventListener('seeking', syncAudio)
    player.addEventListener('pause', () => { if (!this.dragging) audio?.pause(); setPlayButton(false) })
    player.addEventListener('error', () => { setBuffering(false); this.setStatus('O servidor do vídeo não liberou a prévia. O corte ainda pode ser exportado.', 'error') })
    playButton?.addEventListener('click', async () => {
      if (!player.paused) { stop(); return }
      if (player.currentTime < clip.start || player.currentTime >= clip.end - 0.2) this.seekFrame(player, clip.start)
      if (audio) { audio.currentTime = player.currentTime; audio.play().catch(() => {}) }
      try { await player.play(); setPlayButton(true) }
      catch { audio?.pause(); this.setStatus('Não foi possível tocar a prévia deste vídeo.', 'error') }
    })
    this.seekFrame(player, clip.start)
  }

  beginScrub(prop) {
    if (!this.clips[this.active]) return
    this.dragging = prop
    this.lastScrubPosition = this.clips[this.active][prop]
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
    this.dragging = ''
    clearTimeout(this.scrubTimer)
    const audio = this.root.querySelector('#clip-preview-audio') || this.root.querySelector('#clip-preview')
    audio?.pause()
    if (audio) audio.playbackRate = 1
    const overlay = this.root.querySelector('#clip-scrub-overlay')
    if (overlay) overlay.hidden = true
    this.seekFrame(this.root.querySelector(`#clip-thumb-${prop}`), this.clips[this.active][prop])
    this.seekFrame(this.root.querySelector('#clip-preview'), this.clips[this.active][prop])
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
    this.url = this.root.querySelector('#clip-url').value.trim()
    this.pendingAspect = this.guessAspectFromUrl(this.url)
    this.info = null; this.clips = []; this.active = 0
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
  }

  async export() {
    if (this.clips.length === 0) { this.setStatus('Adicione ao menos um trecho antes de exportar.', 'error'); return }
    const name = this.root.querySelector('#clip-name').value.trim() || 'clipe'
    if (this.clips.some(c => c.end - c.start < 1)) { this.setStatus('Cada trecho precisa ter ao menos 1 segundo.', 'error'); return }
    const button = this.root.querySelector('#clip-export'); button.disabled = true; button.textContent = 'Baixando…'
    this.setStatus(`${this.exportFormat === 'audio' ? 'Extraindo áudio' : 'Baixando clipes'} (${this.clips.length})…`, 'working')
    const result = await this.api.downloadClips({ url: this.url, clips: this.clips, duration: this.info.duration, folder: this.folder, filename: name, quality: this.quality || 'best', format: this.exportFormat, cookiesPath: this.cookiesPath, cookiesFromBrowser: this.cookiesFromBrowser })
    button.disabled = false; button.textContent = this.exportLabel()
    const box = this.root.querySelector('#clip-result'); box.className = `result-box ${result.success ? 'success' : 'error'} show`; box.replaceChildren(document.createTextNode(result.success ? 'Arquivos salvos. ' : result.error || 'Falha ao baixar. '))
    if (result.folder) { const open = document.createElement('button'); open.className = 'open-btn'; open.textContent = 'Abrir pasta'; open.addEventListener('click', () => this.api.openFolder(result.folder)); box.append(open) }
    this.setStatus(result.success ? 'Arquivos salvos. Você pode abrir a pasta e compartilhar pelo app que preferir.' : 'Erro ao baixar clipes.', result.success ? '' : 'error')
  }

  escape(value) { return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
}
