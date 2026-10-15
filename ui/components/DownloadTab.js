export class DownloadTab {
  constructor({ root, api, setStatus, appInfo, settings }) {
    this.root = root
    this.api = api
    this.setStatus = setStatus
    this.appInfo = appInfo
    this.currentFormat = 'video'
    this.lastFolder = ''
    this.defaultFolder = settings?.downloadFolder || ''
    this.downloading = false
    this.currentDownloadState = appInfo.downloadState || 'idle'
    this.playlistEntries = []
    this.playlistTitle = ''
    this.splitParts = 0
    this.currentUrl = ''
    this.previewInfo = null
    this.previewTimer = null
    this.previewRequest = 0
  }

  mount() {
    this.render()
    this.bindEvents()
    this.syncAppInfo()
  }

  render() {
    this.root.innerHTML = `
      ${this.appInfo.ok ? '' : `
        <div class="alert show">
          <strong>yt-dlp.exe nao encontrado.</strong>
          O app procura automaticamente em <code>bin/</code>, na raiz do projeto e em <code>DownloadsYT/</code>.
        </div>
      `}

      <div class="card">
        <div class="field">
          <label>Link do video ou playlist</label>
          <div class="row two">
            <input type="url" id="download-url" placeholder="https://youtube.com/watch?v=..." value="${this.escapeHtml(this.currentUrl)}">
            <button class="secondary-btn" id="download-analyze-playlist" type="button">Ver playlist</button>
          </div>
          <div class="helper-text">Continue usando a aba de download como hoje, inclusive com playlists e cookies.</div>
        </div>
      </div>

      <div class="card download-preview-card"><div class="download-preview-media" id="download-preview-media">${this.previewInfo?.thumbnail ? `<img src="${this.escapeHtml(this.previewInfo.thumbnail)}" alt="Miniatura do vídeo">` : `<img class="download-preview-placeholder" src="./assets/ui/video.png" alt="">`}</div><div class="download-preview-copy"><strong id="download-preview-title">${this.escapeHtml(this.previewInfo?.title || 'Prévia do vídeo')}</strong><small id="download-preview-detail">${this.previewInfo ? 'Vídeo encontrado' : 'Cole um link para carregar a imagem e o título.'}</small></div></div>

      <div class="card">
        <div class="field">
          <label>Formato</label>
          <div class="format-toggle">
            <button class="fmt-btn ${this.currentFormat === 'video' ? 'active-video' : ''}" id="download-btn-video" type="button">
              <span class="fmt-icon"><img class="raster-icon" src="./assets/ui/video.png" alt=""></span>
              <span class="fmt-label">Video</span>
              <span class="fmt-sub">MP4 para Premiere</span>
            </button>
            <button class="fmt-btn ${this.currentFormat === 'audio' ? 'active-audio' : ''}" id="download-btn-audio" type="button">
              <span class="fmt-icon"><img class="raster-icon" src="./assets/ui/audio.png" alt=""></span>
              <span class="fmt-label">Audio</span>
              <span class="fmt-sub">MP3</span>
            </button>
          </div>
        </div>

        <div class="field" id="download-video-quality-wrap" style="${this.currentFormat === 'audio' ? 'display:none;' : ''}">
          <label>Qualidade do video</label>
          <select id="download-quality" hidden>
            <option value="best">Melhor disponivel</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
            <option value="360">360p</option>
          </select>
          <div class="quality-grid">${[['best','Melhor disponível'],['1080','1080p'],['720','720p'],['480','480p'],['360','360p']].map(([v,l]) => `<button class="quality-choice ${this.selectedQuality === v || (!this.selectedQuality && v === 'best') ? 'active' : ''}" data-download-quality="${v}" type="button"><strong>${l}</strong><span>MP4</span></button>`).join('')}</div>
        </div>
        ${this.currentFormat === 'video' ? `<details class="advanced-options" style="margin-top:12px"><summary>Dividir este vídeo em clipes</summary><div class="field" style="margin-top:12px"><label>Quantidade de partes</label><select id="download-split-count"><option value="0" ${this.splitParts ? '' : 'selected'}>Não dividir</option>${[2,3,4,5,6,8,10,12].map(n => `<option value="${n}" ${Number(this.splitParts) === n ? 'selected' : ''}>${n} partes</option>`).join('')}</select><div class="helper-text">Baixa o vídeo e salva cada trecho como um arquivo separado.</div></div></details>` : ''}

        <div class="field" id="download-audio-quality-wrap" style="${this.currentFormat === 'audio' ? '' : 'display:none;'}">
          <label>Qualidade do audio</label>
          <select id="download-audio-quality">
            <option value="320">320 kbps (melhor)</option>
            <option value="192">192 kbps</option>
            <option value="128">128 kbps</option>
            <option value="96">96 kbps</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="toggle-grid" style="margin-bottom:14px;">
          <label class="toggle-row" for="download-playlist-mode">
            <input type="checkbox" id="download-playlist-mode">
            <span class="toggle-copy">
              <span class="toggle-title">Baixar playlist inteira</span>
              <span class="toggle-sub">Ligado: escolhe os itens da playlist. Desligado: baixa so o item atual.</span>
            </span>
          </label>
        </div>

        <div class="compact-destination"><div class="destination-copy"><div class="destination-title">Salvar em</div><div class="destination-path">${this.escapeHtml(this.defaultFolder || 'Downloads')}</div></div><button class="folder-action" id="download-pick-folder" type="button" aria-label="Escolher pasta"><img class="raster-icon" src="./assets/ui/folder.png" alt=""></button></div>
        <input type="hidden" id="download-folder" value="${this.escapeHtml(this.defaultFolder)}">
        <details class="advanced-options" style="margin-top:12px"><summary>Mais opções</summary>
          <div class="field"><label>Nome do arquivo ou pasta (opcional)</label><input type="text" id="download-filename" placeholder="Usar título do vídeo ou playlist"></div>
          <div class="settings-note">O download começa diretamente pelo link. O Baixaria não fecha nem reinicia o navegador.</div>
        </details>
      </div>

      <div class="card playlist-card" id="download-playlist-card">
        <div class="playlist-header">
          <div>
            <div class="playlist-title" id="download-playlist-title">Playlist</div>
            <div class="playlist-meta" id="download-playlist-meta">0 itens</div>
          </div>
          <div class="inline-actions">
            <button class="ghost-btn" id="download-reload-playlist" type="button">Atualizar lista</button>
          </div>
        </div>

        <div class="field">
          <label>Selecionar por faixas</label>
          <div class="row two">
            <input type="text" id="download-playlist-range" placeholder="Ex.: 1-10,15-20,23">
            <button class="secondary-btn" id="download-apply-range" type="button">Aplicar</button>
          </div>
          <div class="helper-text">Aceita numeros soltos e intervalos. Se digitar 15-2, o app entende como 2-15.</div>
        </div>

        <div class="inline-actions" style="margin-bottom:12px;">
          <button class="secondary-btn" id="download-select-all" type="button">Marcar todos</button>
          <button class="ghost-btn" id="download-clear-all" type="button">Desmarcar todos</button>
          <button class="ghost-btn" id="download-invert-selection" type="button">Inverter</button>
        </div>

        <div class="playlist-meta" id="download-playlist-selection-meta">Nenhum item selecionado</div>
        <div class="playlist-list" id="download-playlist-list">
          <div class="playlist-empty">Carregue uma playlist para ver os videos aqui.</div>
        </div>
      </div>

      <div class="action-row" style="grid-template-columns: 1fr 180px;">
        <button class="primary-btn" id="download-start-btn" type="button">${this.downloading ? 'Baixando...' : 'Baixar agora'}</button>
        <button class="danger-btn" id="download-stop-btn" type="button" ${this.currentDownloadState === 'downloading' || this.currentDownloadState === 'retrying' ? '' : 'disabled'}>Parar</button>
      </div>

      <div class="progress-wrap" id="download-progress-wrap">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="download-progress-fill"></div>
        </div>
        <div class="progress-log" id="download-progress-log"></div>
      </div>

      <div class="result-box" id="download-result-box">
        <span id="download-result-icon"></span>
        <span id="download-result-text"></span>
        <button class="open-btn" id="download-open-folder-btn" type="button" style="display:none;">Abrir pasta</button>
      </div>
    `
  }

  bindEvents() {
    this.root.querySelector('#download-url').addEventListener('input', event => {
      this.currentUrl = event.target.value
      clearTimeout(this.previewTimer)
      const request = ++this.previewRequest
      this.previewInfo = null
      this.showPreview()
      if (/^https?:\/\//i.test(this.currentUrl) && !this.currentUrl.includes('list=')) {
        this.previewTimer = setTimeout(() => this.loadPreview(this.currentUrl, request), 850)
      }
    })
    this.root.querySelector('#download-split-count')?.addEventListener('change', (event) => { this.splitParts = Number(event.target.value) || 0 })
    this.root.querySelectorAll('[data-download-quality]').forEach((button) => button.addEventListener('click', () => {
      this.selectedQuality = button.dataset.downloadQuality
      this.root.querySelector('#download-quality').value = this.selectedQuality
      this.root.querySelectorAll('[data-download-quality]').forEach((item) => item.classList.toggle('active', item === button))
    }))
    this.root.querySelector('#download-btn-video').addEventListener('click', () => {
      this.currentFormat = 'video'
      this.render()
      this.bindEvents()
      this.syncAppInfo()
    })

    this.root.querySelector('#download-btn-audio').addEventListener('click', () => {
      this.currentFormat = 'audio'
      this.render()
      this.bindEvents()
      this.syncAppInfo()
    })

    this.root.querySelector('#download-pick-folder').addEventListener('click', async () => {
      const folder = await this.api.selectFolder()
      if (folder) {
        this.root.querySelector('#download-folder').value = folder
        this.lastFolder = folder
        this.defaultFolder = folder
        this.root.querySelector('.destination-path').textContent = folder
      }
    })

    this.root.querySelector('#download-analyze-playlist').addEventListener('click', () => this.loadPlaylist())
    this.root.querySelector('#download-reload-playlist')?.addEventListener('click', () => this.loadPlaylist())
    this.root.querySelector('#download-apply-range')?.addEventListener('click', () => this.applyRangeSelection())
    this.root.querySelector('#download-select-all')?.addEventListener('click', () => this.setAllPlaylistItems(true))
    this.root.querySelector('#download-clear-all')?.addEventListener('click', () => this.setAllPlaylistItems(false))
    this.root.querySelector('#download-invert-selection')?.addEventListener('click', () => this.invertPlaylistSelection())
    this.root.querySelector('#download-playlist-mode').addEventListener('change', () => this.updatePlaylistVisibility())
    this.root.querySelector('#download-start-btn').addEventListener('click', () => this.startDownload())
    this.root.querySelector('#download-stop-btn').addEventListener('click', async () => {
      const result = await this.api.stopDownload()
      if (result.error) {
        this.setStatus(result.error, 'error')
      }
    })
    this.root.querySelector('#download-open-folder-btn').addEventListener('click', () => {
      const folder = this.lastFolder || this.root.querySelector('#download-folder').value
      if (folder) {
        this.api.openFolder(folder)
      }
    })
    this.api.removeProgressListener()
    this.api.onProgress((data) => this.handleProgress(data))
    this.api.removeDownloadStateListener()
    this.api.onDownloadState((data) => this.handleDownloadState(data))

    this.renderPlaylistList()
    this.updatePlaylistVisibility()
  }

  syncAppInfo() {
  }

  async loadPreview(url, request) {
    let result
    try { result = await this.api.fetchClipInfo(url, this.appInfo.cookiesPath || '', '') }
    catch { return }
    if (request !== this.previewRequest || url !== this.currentUrl) return
    this.previewInfo = result.video || null
    this.showPreview()
  }

  showPreview() {
    const media = this.root.querySelector('#download-preview-media')
    const title = this.root.querySelector('#download-preview-title')
    const detail = this.root.querySelector('#download-preview-detail')
    if (!media || !title || !detail) return
    media.replaceChildren()
    const img = document.createElement('img')
    img.src = this.previewInfo?.thumbnail || './assets/ui/video.png'
    img.alt = this.previewInfo?.thumbnail ? 'Miniatura do vídeo' : ''
    if (!this.previewInfo?.thumbnail) img.className = 'download-preview-placeholder'
    media.append(img)
    title.textContent = this.previewInfo?.title || 'Prévia do vídeo'
    detail.textContent = this.previewInfo ? 'Vídeo encontrado' : 'Cole um link para carregar a imagem e o título.'
  }

  getPlaylistMode() {
    return this.root.querySelector('#download-playlist-mode').checked
  }

  updatePlaylistVisibility() {
    const card = this.root.querySelector('#download-playlist-card')
    const show = this.getPlaylistMode() && this.playlistEntries.length > 0
    card.className = show ? 'card playlist-card show' : 'card playlist-card'
  }

  renderPlaylistList() {
    const list = this.root.querySelector('#download-playlist-list')
    if (!list) {
      return
    }

    if (this.playlistEntries.length === 0) {
      list.innerHTML = '<div class="playlist-empty">Carregue uma playlist para ver os videos aqui.</div>'
      const meta = this.root.querySelector('#download-playlist-selection-meta')
      if (meta) {
        meta.textContent = 'Nenhum item selecionado'
      }
      return
    }

    list.innerHTML = this.playlistEntries.map((entry) => `
      <label class="playlist-item">
        <input type="checkbox" class="download-playlist-checkbox" data-index="${entry.index}" ${entry.selected ? 'checked' : ''}>
        <span>
          <div class="playlist-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="playlist-item-meta">#${entry.index}${entry.duration ? ` - ${entry.duration}` : ''}</div>
        </span>
      </label>
    `).join('')

    list.querySelectorAll('.download-playlist-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const index = Number.parseInt(event.target.dataset.index, 10)
        const item = this.playlistEntries.find((entry) => entry.index === index)
        if (item) {
          item.selected = event.target.checked
        }
        this.updatePlaylistSelectionMeta()
      })
    })

    this.updatePlaylistSelectionMeta()
  }

  updatePlaylistSelectionMeta() {
    const selected = this.collectSelectedIndices().length
    const total = this.playlistEntries.length
    const meta = this.root.querySelector('#download-playlist-selection-meta')
    const title = this.root.querySelector('#download-playlist-title')
    const info = this.root.querySelector('#download-playlist-meta')
    if (meta) {
      meta.textContent = `${selected} de ${total} itens selecionados`
    }
    if (title) {
      title.textContent = this.playlistTitle || 'Playlist'
    }
    if (info) {
      info.textContent = `${total} itens encontrados`
    }
  }

  collectSelectedIndices() {
    return this.playlistEntries.filter((entry) => entry.selected).map((entry) => entry.index)
  }

  setAllPlaylistItems(selected) {
    this.playlistEntries.forEach((entry) => {
      entry.selected = selected
    })
    this.renderPlaylistList()
  }

  invertPlaylistSelection() {
    this.playlistEntries.forEach((entry) => {
      entry.selected = !entry.selected
    })
    this.renderPlaylistList()
  }

  parseSelectionRange(input, max) {
    const values = new Set()
    const raw = String(input || '').trim()
    if (!raw) {
      return []
    }

    const chunks = raw.split(',').map((part) => part.trim()).filter(Boolean)
    for (const chunk of chunks) {
      if (/^\d+$/.test(chunk)) {
        const value = Number.parseInt(chunk, 10)
        if (value >= 1 && value <= max) {
          values.add(value)
        }
        continue
      }

      const rangeMatch = chunk.match(/^(\d+)\s*-\s*(\d+)$/)
      if (!rangeMatch) {
        continue
      }

      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      const min = Math.max(1, Math.min(start, end))
      const maxValue = Math.min(max, Math.max(start, end))
      for (let value = min; value <= maxValue; value += 1) {
        values.add(value)
      }
    }

    return [...values].sort((a, b) => a - b)
  }

  applyRangeSelection() {
    if (this.playlistEntries.length === 0) {
      this.setStatus('Carregue uma playlist antes de aplicar faixas.', 'error')
      return
    }

    const input = this.root.querySelector('#download-playlist-range').value
    const indices = this.parseSelectionRange(input, this.playlistEntries.length)
    if (indices.length === 0) {
      this.setStatus('Digite uma faixa valida, por exemplo 1-10,15-20,23.', 'error')
      return
    }

    const selectedSet = new Set(indices)
    this.playlistEntries.forEach((entry) => {
      entry.selected = selectedSet.has(entry.index)
    })

    this.renderPlaylistList()
    this.setStatus(`Faixas aplicadas na playlist ${this.playlistTitle || ''}.`)
  }

  async loadPlaylist() {
    const url = this.root.querySelector('#download-url').value.trim()
    if (!this.isValidHttpUrl(url)) {
      this.setStatus('Cole um link valido para ler a playlist.', 'error')
      return false
    }

    this.resetResultBox()
    this.setStatus('Lendo playlist...', 'working')
    const cookiesPath = this.appInfo?.cookiesPath || ''
    const cookiesFromBrowser = ''
    const result = await this.api.fetchPlaylist(url, cookiesPath, cookiesFromBrowser)

    if (result.error) {
      this.showResult('error', result.error)
      this.setStatus('Erro ao ler playlist.', 'error')
      return false
    }

    this.playlistTitle = result.title
    this.playlistEntries = (result.entries || []).map((entry) => ({
      ...entry,
      selected: true
    }))
    this.root.querySelector('#download-playlist-mode').checked = true
    this.renderPlaylistList()
    this.updatePlaylistVisibility()
    this.setStatus(`Playlist carregada: ${result.count} itens.`)
    return true
  }

  getPayload() {
    return {
      url: this.root.querySelector('#download-url').value.trim(),
      format: this.currentFormat,
      quality: this.root.querySelector('#download-quality').value,
      audioQuality: this.root.querySelector('#download-audio-quality').value,
      filename: this.root.querySelector('#download-filename').value.trim(),
      folder: this.root.querySelector('#download-folder').value.trim(),
      cookiesPath: this.appInfo?.cookiesPath || '',
      cookiesFromBrowser: '',
      playlistMode: this.getPlaylistMode(),
      selectedIndices: this.getPlaylistMode() ? this.collectSelectedIndices() : []
    }
  }

  setDefaultFolder(folder) {
    this.defaultFolder = folder
    const input = this.root.querySelector('#download-folder')
    const label = this.root.querySelector('.destination-path')
    if (input) input.value = folder
    if (label) label.textContent = folder || 'Downloads'
  }

  escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  async startDownload() {
    if (this.downloading) {
      return
    }

    const payload = this.getPayload()
    if (!payload.url) {
      this.setStatus('Cole o link do video primeiro.', 'error')
      return
    }

    if (!this.isValidHttpUrl(payload.url)) {
      this.setStatus('A URL precisa comecar com http:// ou https://.', 'error')
      return
    }

    if (payload.playlistMode) {
      if (this.splitParts >= 2) {
        this.setStatus('Dividir em partes está disponível para um vídeo individual. Desmarque a playlist inteira.', 'error')
        return
      }
      if (this.playlistEntries.length === 0) {
        const loaded = await this.loadPlaylist()
        if (!loaded) {
          return
        }
        payload.selectedIndices = this.collectSelectedIndices()
      }

      if (payload.selectedIndices.length === 0) {
        this.setStatus('Selecione pelo menos um item da playlist.', 'error')
        return
      }
    }

    if (this.currentFormat === 'video' && this.splitParts >= 2) {
      await this.startSplitDownload(payload)
      return
    }

    this.downloading = true
    this.root.querySelector('#download-start-btn').textContent = 'Baixando...'
    this.root.querySelector('#download-stop-btn').disabled = false
    this.root.querySelector('#download-progress-wrap').className = 'progress-wrap show'
    this.root.querySelector('#download-progress-log').textContent = ''
    this.root.querySelector('#download-progress-fill').style.width = '0%'
    this.resetResultBox()
    this.setStatus('Iniciando download...', 'working')

    const result = await this.api.startDownload(payload)
    this.downloading = false
    this.root.querySelector('#download-start-btn').textContent = 'Baixar agora'
    this.root.querySelector('#download-stop-btn').disabled = true

    if (result.success) {
      this.root.querySelector('#download-progress-fill').style.width = '100%'
      this.showResult('success', 'Download concluido.', result.folder)
      this.setStatus('Download concluido com sucesso.')
      return
    }

    if (result.stopped) {
      this.showResult('success', 'Download parado.', result.folder)
      this.setStatus('Download parado.')
      return
    }

    this.showResult('error', result.error || 'Falha ao baixar.')
    this.setStatus('Erro no download.', 'error')
  }

  async startSplitDownload(payload) {
    this.downloading = true
    this.root.querySelector('#download-start-btn').textContent = 'Preparando clipes…'
    this.root.querySelector('#download-stop-btn').disabled = false
    this.root.querySelector('#download-progress-wrap').className = 'progress-wrap show'
    this.root.querySelector('#download-progress-log').textContent = ''
    this.root.querySelector('#download-progress-fill').style.width = '0%'
    this.resetResultBox()
    this.setStatus('Lendo a duração do vídeo…', 'working')
    const info = await this.api.fetchClipInfo(payload.url, payload.cookiesPath, payload.cookiesFromBrowser)
    if (info.error || !Number(info.video?.duration)) {
      this.downloading = false
      this.root.querySelector('#download-start-btn').textContent = 'Baixar agora'
      this.root.querySelector('#download-stop-btn').disabled = true
      this.showResult('error', info.error || 'Não consegui identificar a duração para dividir este vídeo.')
      this.setStatus('Não foi possível preparar os clipes.', 'error')
      return
    }
    const duration = Number(info.video.duration)
    if (duration < this.splitParts) {
      this.downloading = false
      this.root.querySelector('#download-start-btn').textContent = 'Baixar agora'
      this.root.querySelector('#download-stop-btn').disabled = true
      this.showResult('error', 'O vídeo é curto demais para essa quantidade de partes.')
      this.setStatus('Reduza a quantidade de partes.', 'error')
      return
    }
    const clips = Array.from({ length: this.splitParts }, (_, index) => ({
      start: Math.floor(duration * index / this.splitParts),
      end: Math.floor(duration * (index + 1) / this.splitParts)
    }))
    this.setStatus(`Baixando ${clips.length} clipes…`, 'working')
    const result = await this.api.downloadClips({ url: payload.url, clips, duration, folder: payload.folder, filename: payload.filename || info.video.title, quality: payload.quality, cookiesPath: payload.cookiesPath, cookiesFromBrowser: payload.cookiesFromBrowser })
    this.downloading = false
    this.root.querySelector('#download-start-btn').textContent = 'Baixar agora'
    this.root.querySelector('#download-stop-btn').disabled = true
    if (result.success) {
      this.root.querySelector('#download-progress-fill').style.width = '100%'
      this.showResult('success', `${clips.length} clipes baixados.`, result.folder)
      this.setStatus('Clipes baixados com sucesso.')
    } else {
      this.showResult('error', result.error || 'Falha ao baixar clipes.', result.folder)
      this.setStatus('Erro ao baixar clipes.', 'error')
    }
  }

  handleProgress(data) {
    const progressWrap = this.root.querySelector('#download-progress-wrap')
    const progressFill = this.root.querySelector('#download-progress-fill')
    const progressLog = this.root.querySelector('#download-progress-log')
    if (!progressWrap || !progressFill || !progressLog) {
      return
    }

    progressWrap.className = 'progress-wrap show'
    if (data.percent !== undefined) {
      const percent = Math.max(0, Math.min(100, data.percent))
      progressFill.style.width = `${percent}%`
      this.setStatus(`Baixando... ${Math.round(percent)}%`, 'working')
    }

    if (data.line) {
      progressLog.textContent += (progressLog.textContent ? '\n' : '') + String(data.line).trim()
      progressLog.scrollTop = progressLog.scrollHeight
    }
  }

  handleDownloadState(data) {
    this.currentDownloadState = data.state
    const stopBtn = this.root.querySelector('#download-stop-btn')
    if (stopBtn) {
      stopBtn.disabled = data.state !== 'downloading' && data.state !== 'retrying'
    }
  }

  resetResultBox() {
    const box = this.root.querySelector('#download-result-box')
    box.className = 'result-box'
    this.root.querySelector('#download-result-icon').textContent = ''
    this.root.querySelector('#download-result-text').textContent = ''
    this.root.querySelector('#download-open-folder-btn').style.display = 'none'
  }

  showResult(type, message, folder = '') {
    const box = this.root.querySelector('#download-result-box')
    box.className = `result-box ${type} show`
    this.root.querySelector('#download-result-icon').textContent = type === 'success' ? 'OK' : 'ERRO'
    this.root.querySelector('#download-result-text').textContent = message
    if (folder) {
      this.lastFolder = folder
      this.root.querySelector('#download-open-folder-btn').style.display = ''
    }
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  isValidHttpUrl(value) {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }
}
