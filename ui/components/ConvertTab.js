import { renderFileDropZone } from './FileDropZone.js'
import { renderMediaInfoCard } from './MediaInfoCard.js'
import { renderVideoOptions } from './VideoOptions.js'
import { renderAudioOptions } from './AudioOptions.js'
import { renderGifOptions } from './GifOptions.js'

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes), index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1 }
  return `${value.toFixed(index && value < 10 ? 1 : 0)} ${units[index]}`
}

function isHdr(mediaInfo) {
  return ['arib-std-b67', 'smpte2084'].includes(mediaInfo?.colorTransfer)
}

const OPTIMIZATION_LABELS = ['Mais leve', 'Leve', 'Padrão', 'Equilibrado · recomendado', 'Mais qualidade']

export class ConvertTab {
  constructor({ root, api, setStatus, appInfo, settings, onSuccess }) {
    this.root = root
    this.api = api
    this.setStatus = setStatus
    this.onSuccess = onSuccess
    this.appInfo = appInfo
    this.state = {
      selectedFilePath: '',
      mediaInfo: null,
      queue: [],
      capabilities: appInfo.ffmpegCapabilities || { av1: false },
      converting: appInfo.conversionState === 'converting',
      outputFolder: settings?.downloadFolder || '',
      defaultFolder: settings?.downloadFolder || '',
      splitParts: 0,
      outputName: '',
      outputFormat: 'MP4',
      videoCodec: 'H.264',
      videoQualityPreset: 'high',
      videoCrf: '23',
      optimizeEnabled: false,
      optimizationLevel: 3,
      preview: null,
      previewLoading: false,
      previewError: '',
      videoResolution: 'original',
      videoFps: 'original',
      extractAudioOnly: false,
      hdrToSdr: false,
      convertToGif: false,
      audioExtractFormat: 'MP3',
      audioFormat: 'MP3',
      audioBitrate: '192k',
      audioSampleRate: 'original',
      audioChannels: 'original',
      gifFps: '15',
      gifWidth: 'original',
      gifStart: '',
      gifDuration: '4',
      gifLoop: true,
      lastOutputFolder: '',
      logLines: [],
      progress: 0,
      result: null
    }
    this.batchRunning = false
    this.batchIndex = 0
    this.previewTimer = null
    this.previewBusy = false
    this.previewPending = false
    this.previewGeneration = 0
    this.hdrTouched = false
  }

  mount() {
    this.render()
    this.api.removeConversionProgressListener()
    this.api.onConversionProgress((data) => this.handleConversionProgress(data))
    this.api.removeConversionStateListener()
    this.api.onConversionState((data) => this.handleConversionState(data))
  }

  getDefaultOutputName(fileName) {
    return `${stripExtension(fileName)}-convertido`
  }

  setMediaInfo(mediaInfo, capabilities) {
    const alreadyQueued = this.state.queue.find((item) => item.mediaInfo.filePath.toLowerCase() === mediaInfo.filePath.toLowerCase())
    if (!alreadyQueued) this.state.queue.push({ mediaInfo, status: 'ready', progress: 0, outputPath: '' })
    this.selectQueueItem(mediaInfo.filePath, false)
    this.state.capabilities = capabilities || this.state.capabilities
    this.state.outputFolder = this.state.outputFolder || mediaInfo.filePath.replace(/\\[^\\]+$/, '')
    if (!this.hdrTouched) this.state.hdrToSdr = this.state.queue.some((item) => isHdr(item.mediaInfo))
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`${this.state.queue.length} arquivo(s) na fila.`]
    this.render()
    this.schedulePreview()
    this.setStatus(`${this.state.queue.length} arquivo(s) pronto(s) para converter.`)
  }

  selectQueueItem(filePath, rerender = true) {
    const item = this.state.queue.find((entry) => entry.mediaInfo.filePath === filePath)
    if (!item) return
    const previousType = this.state.mediaInfo?.type
    this.state.mediaInfo = item.mediaInfo
    this.state.selectedFilePath = filePath
    this.state.outputName = this.getDefaultOutputName(item.mediaInfo.fileName)
    if (previousType !== item.mediaInfo.type) {
      this.state.outputFormat = item.mediaInfo.type === 'video' ? 'MP4' : 'MP3'
      this.state.audioFormat = 'MP3'
      this.state.convertToGif = false
      this.state.extractAudioOnly = false
    }
    this.state.preview = null
    this.state.previewError = ''
    this.previewGeneration += 1
    if (rerender) { this.render(); this.schedulePreview() }
  }

  setDefaultFolder(folder) {
    this.state.defaultFolder = folder
    if (!this.state.outputFolder) this.state.outputFolder = folder
    const label = this.root.querySelector('.destination-path')
    if (label) label.textContent = this.state.outputFolder || folder || 'Downloads'
  }

  render() {
    const mediaInfo = this.state.mediaInfo
    const showVideoOptions = mediaInfo && mediaInfo.type === 'video'
    const showAudioOptions = mediaInfo && (mediaInfo.type === 'audio' || this.state.extractAudioOnly)
    const showGifOptions = mediaInfo && mediaInfo.type === 'video' && this.state.convertToGif

    this.root.innerHTML = `
      ${renderFileDropZone({ selectedFileName: mediaInfo?.fileName, thumbnail: mediaInfo?.thumbnail, aspect: mediaInfo?.displayAspect })}
      ${this.renderQueue()}
      ${mediaInfo ? renderMediaInfoCard(mediaInfo) : ''}
      ${showVideoOptions ? renderVideoOptions(this.state, this.state.capabilities) : ''}
      ${showVideoOptions && !this.state.convertToGif && !this.state.extractAudioOnly ? this.renderOptimizationCard() : ''}
      ${showGifOptions ? renderGifOptions(this.state) : ''}
      ${showAudioOptions ? renderAudioOptions(this.state, mediaInfo.type === 'audio' ? 'audio' : 'extract') : ''}
      ${showVideoOptions ? `<div class="card convert-split-card"><label class="toggle-row"><input type="checkbox" id="convert-split-toggle" ${this.state.splitParts ? 'checked' : ''}><span class="toggle-copy"><span class="toggle-title">Dividir em vários clipes</span><span class="toggle-sub">Cria arquivos consecutivos com a mesma duração aproximada.</span></span></label><div class="field" id="convert-split-count-wrap" style="${this.state.splitParts ? '' : 'display:none;'}margin-top:12px"><label>Quantidade de partes</label><select id="convert-split-count">${[2,3,4,5,6,8,10,12,15,20,30].map(n => `<option value="${n}" ${Number(this.state.splitParts || 6) === n ? 'selected' : ''}>${n} partes</option>`).join('')}</select></div></div>` : ''}
      ${this.renderOutputCard(mediaInfo)}
    `

    this.bindEvents()
  }

  renderQueue() {
    if (!this.state.queue.length) return ''
    const total = this.state.queue.reduce((sum, item) => sum + (Number(item.mediaInfo.size) || 0), 0)
    return `<div class="card convert-queue-card"><div class="section-title">Fila de conversão <small>${this.state.queue.length} arquivo${this.state.queue.length === 1 ? '' : 's'} · ${formatBytes(total)}</small><button id="convert-add-files" type="button" ${this.state.converting ? 'disabled' : ''}>+ Adicionar</button></div>
      <div class="convert-queue-list">${this.state.queue.map((item, index) => `<div class="convert-queue-row ${this.state.selectedFilePath === item.mediaInfo.filePath ? 'active' : ''}">
        <button class="convert-queue-select" type="button" data-queue-select="${index}"><strong>${this.escapeAttribute(item.mediaInfo.fileName)}</strong><span>${formatBytes(item.mediaInfo.size)} · ${item.status === 'done' ? 'Concluído' : item.status === 'error' ? 'Erro' : item.status === 'converting' ? `Convertendo ${Math.round(item.progress)}%` : 'Na fila'}</span></button>
        <button class="convert-queue-remove" type="button" data-queue-remove="${index}" title="Remover da fila" aria-label="Remover ${this.escapeAttribute(item.mediaInfo.fileName)} da fila" ${this.state.converting ? 'disabled' : ''}>×</button>
      </div>`).join('')}</div><p class="convert-queue-help">Clique num arquivo para ver a prévia. As opções de conversão valem para toda a fila.</p></div>`
  }

  renderOptimizationCard() {
    const info = this.state.mediaInfo
    const preview = this.state.preview
    const enabled = this.state.optimizeEnabled
    return `<div class="card convert-optimize-card"><div class="section-title">Otimização <small>opcional</small></div>
      <label class="toggle-row" for="convert-optimize-toggle"><input type="checkbox" id="convert-optimize-toggle" ${enabled ? 'checked' : ''}><span class="toggle-copy"><span class="toggle-title">Otimizar tamanho do arquivo</span><span class="toggle-sub">Ajusta a compressão mantendo a resolução escolhida. O resultado pode ficar maior se a origem já estiver muito comprimida.</span></span></label>
      <div class="convert-optimization-controls ${enabled ? '' : 'disabled'}"><div class="convert-quality-caption"><span>+ leve</span><strong id="convert-quality-name">${OPTIMIZATION_LABELS[this.state.optimizationLevel]}</strong><span>+ qualidade</span></div>
      <input id="convert-optimization-level" type="range" min="0" max="4" step="1" value="${this.state.optimizationLevel}" ${enabled ? '' : 'disabled'} aria-label="Equilíbrio entre tamanho e qualidade">
      <div class="convert-quality-ticks"><span>Leve</span><span>Padrão</span><span>Recomendado</span><span>Qualidade</span></div></div>
      <div class="convert-preview-heading"><strong>Prévia do resultado</strong><span>Amostra real do arquivo selecionado</span></div>
      <div class="convert-preview-pair ${info?.displayAspect === 'portrait' ? 'portrait' : ''}"><div><span>ANTES</span>${preview?.before || info?.thumbnail ? `<img src="${preview?.before || info.thumbnail}" alt="Imagem original">` : '<div class="convert-preview-empty">Sem imagem</div>'}</div>
      <div><span>DEPOIS</span>${preview?.after ? `<img src="${preview.after}" alt="Imagem da amostra convertida">` : `<div class="convert-preview-empty">${this.state.previewLoading ? 'Gerando amostra…' : this.escapeAttribute(this.state.previewError || 'Aguardando amostra')}</div>`}</div></div>
      <div class="convert-size-row"><div><small>ORIGINAL</small><strong>${formatBytes(info?.size)}</strong></div><span>→</span><div><small>APÓS CONVERTER · ESTIMATIVA</small><strong>${preview?.estimatedSize ? formatBytes(preview.estimatedSize) : this.state.previewLoading ? 'Calculando…' : '—'}</strong></div></div>
      <p class="convert-estimate-note">Estimativa calculada com ${preview?.sampleDuration ? `${preview.sampleDuration.toFixed(1)} s` : 'alguns segundos'} do vídeo. O tamanho final varia conforme as cenas.</p>
    </div>`
  }

  renderOutputCard(mediaInfo) {
    const canConvert = this.state.queue.length > 0
    const logText = this.state.logLines.join('\n')

    return `
      <div class="card ${this.state.queue.length > 1 ? 'batch-output' : ''}">
        <div class="section-title">Saida</div>
        <div class="row two">
          <div class="field" ${this.state.queue.length > 1 ? 'style="display:none"' : ''}>
            <label>Nome final do arquivo</label>
            <input type="text" id="convert-output-name" value="${this.escapeAttribute(this.state.outputName)}" placeholder="nome do arquivo final">
          </div>
          <div class="field"><label>Pasta de destino</label><div class="compact-destination"><div class="destination-copy"><div class="destination-title">Salvar em</div><div class="destination-path">${this.escapeAttribute(this.state.outputFolder || this.state.defaultFolder || 'Downloads')}</div></div><button class="folder-action" id="convert-pick-folder" type="button" aria-label="Escolher pasta"><img class="raster-icon" src="./assets/ui/folder.png" alt=""></button></div><input type="hidden" id="convert-output-folder" value="${this.escapeAttribute(this.state.outputFolder)}"></div>
        </div>
        ${this.state.queue.length > 1 ? '<p class="convert-queue-help">Cada arquivo manterá seu nome, com “-convertido” no final. Nomes repetidos recebem um número.</p>' : ''}

        <div class="action-row" style="grid-template-columns: 1fr;">
          <button class="primary-btn" id="convert-start-btn" type="button" ${canConvert && !this.state.converting ? '' : 'disabled'}>
            ${this.state.converting ? 'Convertendo...' : this.state.queue.length > 1 ? `Converter ${this.state.queue.length} arquivos` : 'Converter agora'}
          </button>
        </div>

        <div class="progress-wrap ${this.state.converting || this.state.progress > 0 ? 'show' : ''}">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="convert-progress-fill" style="width:${this.state.progress}%;"></div>
          </div>
          <div class="progress-log" id="convert-progress-log">${logText}</div>
        </div>

        <div class="result-box ${this.state.result ? `${this.state.result.type} show` : ''}" id="convert-result-box">
          <span>${this.state.result ? (this.state.result.type === 'success' ? 'OK' : 'ERRO') : ''}</span>
          <span>${this.state.result ? this.state.result.message : ''}</span>
          <button class="open-btn" id="convert-open-folder-btn" type="button" style="${this.state.result?.folder ? '' : 'display:none;'}">Abrir pasta</button>
        </div>
      </div>
    `
  }

  bindEvents() {
    const dropZone = this.root.querySelector('#convert-drop-zone')
    const outputName = this.root.querySelector('#convert-output-name')
    const outputFolder = this.root.querySelector('#convert-output-folder')
    const pickFolder = this.root.querySelector('#convert-pick-folder')
    const startButton = this.root.querySelector('#convert-start-btn')
    const openFolderButton = this.root.querySelector('#convert-open-folder-btn')

    dropZone.addEventListener('dragenter', (event) => {
      event.preventDefault()
      dropZone.classList.add('dragging')
    })
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault()
      dropZone.classList.add('dragging')
    })
    dropZone.addEventListener('dragleave', (event) => {
      if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('dragging')
    })
    dropZone.addEventListener('drop', (event) => this.handleDrop(event))

    const pickMedia = async () => {
      const filePaths = await this.api.selectMediaFile()
      if (filePaths?.length) await this.probeSelectedFiles(filePaths)
    }
    dropZone.addEventListener('click', pickMedia)
    this.root.querySelector('#convert-add-files')?.addEventListener('click', pickMedia)
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        pickMedia()
      }
    })

    outputName?.addEventListener('input', (event) => {
      this.state.outputName = event.target.value
    })

    this.root.querySelectorAll('[data-queue-select]').forEach((button) => button.addEventListener('click', () => {
      const item = this.state.queue[Number(button.dataset.queueSelect)]
      if (item) this.selectQueueItem(item.mediaInfo.filePath)
    }))
    this.root.querySelectorAll('[data-queue-remove]').forEach((button) => button.addEventListener('click', () => {
      if (this.state.converting) return
      const index = Number(button.dataset.queueRemove)
      const [removed] = this.state.queue.splice(index, 1)
      if (removed?.mediaInfo.filePath === this.state.selectedFilePath) {
        if (this.state.queue.length) this.selectQueueItem(this.state.queue[Math.min(index, this.state.queue.length - 1)].mediaInfo.filePath, false)
        else { this.state.mediaInfo = null; this.state.selectedFilePath = ''; this.state.preview = null; this.previewGeneration += 1; this.hdrTouched = false }
      }
      this.render()
      if (this.state.mediaInfo) this.schedulePreview()
    }))

    this.root.querySelector('#convert-optimize-toggle')?.addEventListener('change', (event) => {
      this.state.optimizeEnabled = event.target.checked
      this.state.preview = null
      this.render()
      this.schedulePreview()
    })
    this.root.querySelector('#convert-optimization-level')?.addEventListener('input', (event) => {
      this.state.optimizationLevel = Number(event.target.value)
      const label = this.root.querySelector('#convert-quality-name')
      if (label) label.textContent = OPTIMIZATION_LABELS[this.state.optimizationLevel]
      this.schedulePreview()
    })

    outputFolder?.addEventListener('input', (event) => {
      this.state.outputFolder = event.target.value
    })

    pickFolder?.addEventListener('click', async () => {
      const folder = await this.api.selectFolder()
      if (folder) {
        this.state.outputFolder = folder
        this.render()
      }
    })

    const splitToggle = this.root.querySelector('#convert-split-toggle')
    splitToggle?.addEventListener('change', (event) => {
      this.state.splitParts = event.target.checked ? (Number(this.state.splitParts) || 6) : 0
      this.render()
    })
    this.root.querySelector('#convert-split-count')?.addEventListener('change', (event) => { this.state.splitParts = Number(event.target.value) })

    startButton?.addEventListener('click', () => this.startConversion())
    openFolderButton?.addEventListener('click', () => {
      const folder = this.state.result?.folder || this.state.lastOutputFolder
      if (folder) {
        this.api.openFolder(folder)
      }
    })

    this.bindDynamicOptionEvents()
  }

  bindDynamicOptionEvents() {
    const mapping = [
      ['#video-output-format', 'outputFormat'],
      ['#video-codec', 'videoCodec'],
      ['#video-quality-preset', 'videoQualityPreset'],
      ['#video-crf', 'videoCrf'],
      ['#video-resolution', 'videoResolution'],
      ['#video-fps', 'videoFps'],
      ['#extract-audio-format', 'audioExtractFormat'],
      ['#extract-audio-bitrate', 'audioBitrate'],
      ['#extract-audio-sample-rate', 'audioSampleRate'],
      ['#extract-audio-channels', 'audioChannels'],
      ['#audio-format', 'audioFormat'],
      ['#audio-bitrate', 'audioBitrate'],
      ['#audio-sample-rate', 'audioSampleRate'],
      ['#audio-channels', 'audioChannels'],
      ['#gif-fps', 'gifFps'],
      ['#gif-width', 'gifWidth'],
      ['#gif-start', 'gifStart'],
      ['#gif-duration', 'gifDuration']
    ]

    mapping.forEach(([selector, key]) => {
      const field = this.root.querySelector(selector)
      if (!field) {
        return
      }

      field.addEventListener('input', (event) => {
        this.state[key] = event.target.value
        if (selector === '#video-quality-preset') {
          this.render()
        }
        if (selector.startsWith('#video-')) this.schedulePreview()
      })

      field.addEventListener('change', (event) => {
        this.state[key] = event.target.value
        if (selector === '#video-quality-preset') {
          this.render()
        }
        if (selector.startsWith('#video-')) this.schedulePreview()
      })
    })

    const extractToggle = this.root.querySelector('#extract-audio-only')
    if (extractToggle) {
      extractToggle.addEventListener('change', (event) => {
        this.state.extractAudioOnly = event.target.checked
        if (event.target.checked) {
          this.state.convertToGif = false
        }
        this.render()
      })
    }

    const hdrToggle = this.root.querySelector('#hdr-to-sdr')
    if (hdrToggle) {
      hdrToggle.addEventListener('change', (event) => {
        this.state.hdrToSdr = event.target.checked
        this.hdrTouched = true
        this.schedulePreview()
      })
    }

    const gifToggle = this.root.querySelector('#convert-to-gif')
    if (gifToggle) {
      gifToggle.addEventListener('change', (event) => {
        this.state.convertToGif = event.target.checked
        if (event.target.checked) {
          this.state.extractAudioOnly = false
        }
        this.render()
      })
    }

    const gifLoop = this.root.querySelector('#gif-loop')
    if (gifLoop) {
      gifLoop.addEventListener('change', (event) => {
        this.state.gifLoop = event.target.checked
      })
    }
  }

  async handleDrop(event) {
    event.preventDefault()
    const dropZone = this.root.querySelector('#convert-drop-zone')
    dropZone.classList.remove('dragging')
    let filePaths = []
    try {
      filePaths = Array.from(event.dataTransfer.files || []).map((file) => this.api.getPathForFile(file)).filter(Boolean)
    } catch {
      filePaths = []
    }
    if (!filePaths.length) {
      this.setStatus('Não consegui ler os arquivos arrastados.', 'error')
      return
    }
    await this.probeSelectedFiles(filePaths)
  }

  async probeSelectedFiles(filePaths) {
    if (this.state.converting) return
    this.setStatus(`Analisando ${filePaths.length} arquivo(s)…`, 'working')
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`Analisando ${filePaths.length} arquivo(s)…`]
    this.render()
    const errors = []
    for (const filePath of [...new Set(filePaths)]) {
      if (this.state.queue.some((item) => item.mediaInfo.filePath.toLowerCase() === filePath.toLowerCase())) continue
      let result
      try { result = await this.api.probeMedia(filePath) }
      catch (error) { result = { error: error.message } }
      if (result.error) { errors.push(`${filePath}: ${result.error}`); continue }
      if (this.state.queue.length && result.mediaInfo.type !== this.state.queue[0].mediaInfo.type) {
        errors.push(`${result.mediaInfo.fileName}: adicione vídeo e áudio em filas separadas.`)
        continue
      }
      this.setMediaInfo(result.mediaInfo, result.ffmpegCapabilities)
    }
    if (errors.length) {
      this.state.result = { type: 'error', message: `${errors.length} arquivo(s) não entraram na fila. ${errors[0]}` }
      this.state.logLines.push(...errors)
      this.setStatus(this.state.result.message, 'error')
      this.render()
    }
  }

  getPayload(mediaInfo = this.state.mediaInfo, outputName = this.state.outputName) {
    return {
      inputPath: mediaInfo.filePath,
      mediaType: mediaInfo.type,
      duration: mediaInfo.duration,
      outputFolder: this.state.outputFolder,
      splitParts: this.state.splitParts,
      outputName,
      outputFormat: this.state.outputFormat,
      videoCodec: this.state.videoCodec,
      videoQualityPreset: this.state.videoQualityPreset,
      videoCrf: this.state.videoCrf,
      optimizeEnabled: this.state.optimizeEnabled && mediaInfo.type === 'video' && !this.state.convertToGif && !this.state.extractAudioOnly,
      optimizationLevel: this.state.optimizationLevel,
      videoResolution: this.state.videoResolution,
      videoFps: this.state.videoFps,
      extractAudioOnly: this.state.extractAudioOnly,
      hdrToSdr: this.state.hdrToSdr && isHdr(mediaInfo),
      sourceColorTransfer: mediaInfo.colorTransfer,
      audioExtractFormat: this.state.audioExtractFormat,
      audioFormat: this.state.audioFormat,
      audioBitrate: this.state.audioBitrate,
      audioSampleRate: this.state.audioSampleRate,
      audioChannels: this.state.audioChannels,
      convertToGif: this.state.convertToGif,
      gifFps: this.state.gifFps,
      gifWidth: this.state.gifWidth,
      gifStart: this.state.gifStart,
      gifDuration: this.state.gifDuration,
      gifLoop: this.state.gifLoop
    }
  }

  schedulePreview() {
    clearTimeout(this.previewTimer)
    if (!this.state.mediaInfo || this.state.mediaInfo.type !== 'video' || this.state.convertToGif || this.state.extractAudioOnly || this.state.converting) return
    this.previewGeneration += 1
    this.state.preview = null
    this.state.previewLoading = true
    const estimate = this.root.querySelector('.convert-size-row div:last-child strong')
    if (estimate) estimate.textContent = 'Calculando…'
    const after = this.root.querySelector('.convert-preview-pair > div:last-child')
    if (after) after.innerHTML = '<span>DEPOIS</span><div class="convert-preview-empty">Aguardando amostra…</div>'
    this.previewTimer = setTimeout(() => this.updatePreview(), 650)
  }

  async updatePreview() {
    if (this.previewBusy) { this.previewPending = true; return }
    if (!this.state.mediaInfo || this.state.converting) return
    this.previewBusy = true
    const generation = ++this.previewGeneration
    const payload = this.getPayload()
    this.state.previewLoading = true
    this.state.previewError = ''
    const after = this.root.querySelector('.convert-preview-pair > div:last-child')
    if (after) after.innerHTML = '<span>DEPOIS</span><div class="convert-preview-empty">Gerando amostra…</div>'
    let result
    try { result = await this.api.previewConversion(payload) }
    catch (error) { result = { error: error.message } }
    this.previewBusy = false
    if (generation === this.previewGeneration && this.state.selectedFilePath === payload.inputPath) {
      this.state.previewLoading = false
      this.state.preview = result?.success ? result : null
      this.state.previewError = result?.error || ''
      this.render()
    }
    if (this.previewPending) { this.previewPending = false; this.schedulePreview() }
  }

  async startConversion() {
    if (!this.state.queue.length || this.state.converting) {
      return
    }
    clearTimeout(this.previewTimer)
    this.previewGeneration += 1
    this.batchRunning = true
    this.state.converting = true
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`Preparando ${this.state.queue.length} arquivo(s)…`]
    this.render()
    const items = [...this.state.queue]
    let completed = 0, failed = 0
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      this.batchIndex = index
      item.status = 'converting'
      item.progress = 0
      this.state.logLines.push(`Arquivo ${index + 1} de ${items.length}: ${item.mediaInfo.fileName}`)
      this.setStatus(`Convertendo arquivo ${index + 1} de ${items.length}…`, 'working')
      this.render()
      const outputName = items.length > 1 ? this.getDefaultOutputName(item.mediaInfo.fileName) : this.state.outputName
      let result
      try { result = await this.api.convertMedia(this.getPayload(item.mediaInfo, outputName)) }
      catch (error) { result = { error: error.message } }
      if (result.success) {
        item.status = 'done'
        item.progress = 100
        item.outputPath = result.outputPath || result.outputPaths?.[0] || ''
        this.state.lastOutputFolder = result.outputFolder
        completed += 1
      } else {
        item.status = 'error'
        failed += 1
        this.state.logLines.push(`${item.mediaInfo.fileName}: ${result.error || 'Falha ao converter.'}`)
      }
      this.state.progress = Math.round((index + 1) / items.length * 100)
    }
    this.batchRunning = false
    this.state.converting = false
    this.state.result = { type: failed ? 'error' : 'success',
      message: failed ? `${completed} concluído(s), ${failed} com erro. Veja o registro abaixo.` : `${completed} arquivo(s) convertido(s) com sucesso.`,
      folder: this.state.lastOutputFolder }
    this.setStatus(this.state.result.message, failed ? 'error' : 'success')
    if (completed > 0) this.onSuccess?.()
    this.render()
  }

  handleConversionProgress(data) {
    if (data.percent !== undefined) {
      const itemProgress = Math.max(0, Math.min(100, Number(data.percent)))
      if (this.batchRunning) {
        const item = this.state.queue[this.batchIndex]
        if (item) item.progress = itemProgress
        this.state.progress = Math.round((this.batchIndex + itemProgress / 100) / this.state.queue.length * 100)
      } else this.state.progress = itemProgress
    }

    if (data.line) {
      const last = this.state.logLines[this.state.logLines.length - 1]
      if (last !== data.line) {
        this.state.logLines.push(data.line)
      }
    }

    const fill = this.root.querySelector('#convert-progress-fill')
    const log = this.root.querySelector('#convert-progress-log')
    if (fill) {
      fill.style.width = `${this.state.progress}%`
    }
    if (log) {
      log.textContent = this.state.logLines.join('\n')
      log.scrollTop = log.scrollHeight
    }
    const rowStatus = this.root.querySelectorAll('.convert-queue-select span')[this.batchIndex]
    if (this.batchRunning && rowStatus) rowStatus.textContent = `Convertendo ${Math.round(this.state.queue[this.batchIndex]?.progress || 0)}%`
  }

  handleConversionState(data) {
    if (this.batchRunning) return
    if (data.state === 'converting') {
      this.state.converting = true
      this.render()
      return
    }

    this.state.converting = false
    if (data.outputFolder) {
      this.state.lastOutputFolder = data.outputFolder
    }
    this.render()
  }

  escapeAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}
