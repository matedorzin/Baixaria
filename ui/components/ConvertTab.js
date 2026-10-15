import { renderFileDropZone } from './FileDropZone.js'
import { renderMediaInfoCard } from './MediaInfoCard.js'
import { renderVideoOptions } from './VideoOptions.js'
import { renderAudioOptions } from './AudioOptions.js'
import { renderGifOptions } from './GifOptions.js'

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

export class ConvertTab {
  constructor({ root, api, setStatus, appInfo, settings }) {
    this.root = root
    this.api = api
    this.setStatus = setStatus
    this.appInfo = appInfo
    this.state = {
      selectedFilePath: '',
      mediaInfo: null,
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
    const nextOutputFormat = mediaInfo.type === 'video' ? 'MP4' : 'MP3'
    this.state.mediaInfo = mediaInfo
    this.state.selectedFilePath = mediaInfo.filePath
    this.state.capabilities = capabilities || this.state.capabilities
    this.state.outputFolder = this.state.outputFolder || mediaInfo.filePath.replace(/\\[^\\]+$/, '')
    this.state.outputName = this.getDefaultOutputName(mediaInfo.fileName)
    this.state.outputFormat = nextOutputFormat
    this.state.audioFormat = mediaInfo.type === 'audio' ? 'MP3' : this.state.audioFormat
    this.state.convertToGif = false
    this.state.extractAudioOnly = false
    this.state.hdrToSdr = ['arib-std-b67', 'smpte2084'].includes(mediaInfo.colorTransfer)
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`Arquivo detectado: ${mediaInfo.fileName}`]
    this.render()
    this.setStatus(`Arquivo analisado: ${mediaInfo.fileName}`)
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
      ${mediaInfo ? renderMediaInfoCard(mediaInfo) : ''}
      ${showVideoOptions ? renderVideoOptions(this.state, this.state.capabilities) : ''}
      ${showGifOptions ? renderGifOptions(this.state) : ''}
      ${showAudioOptions ? renderAudioOptions(this.state, mediaInfo.type === 'audio' ? 'audio' : 'extract') : ''}
      ${showVideoOptions ? `<div class="card"><label class="toggle-row"><input type="checkbox" id="convert-split-toggle" ${this.state.splitParts ? 'checked' : ''}><span class="toggle-copy"><span class="toggle-title">Dividir em vários clipes</span><span class="toggle-sub">Cria arquivos consecutivos com a mesma duração aproximada.</span></span></label><div class="field" id="convert-split-count-wrap" style="${this.state.splitParts ? '' : 'display:none;'}margin-top:12px"><label>Quantidade de partes</label><select id="convert-split-count">${[2,3,4,5,6,8,10,12,15,20,30].map(n => `<option value="${n}" ${Number(this.state.splitParts || 6) === n ? 'selected' : ''}>${n} partes</option>`).join('')}</select></div></div>` : ''}
      ${this.renderOutputCard(mediaInfo)}
    `

    this.bindEvents()
  }

  renderOutputCard(mediaInfo) {
    const canConvert = Boolean(mediaInfo)
    const logText = this.state.logLines.join('\n')

    return `
      <div class="card">
        <div class="section-title">Saida</div>
        <div class="row two">
          <div class="field">
            <label>Nome final do arquivo</label>
            <input type="text" id="convert-output-name" value="${this.escapeAttribute(this.state.outputName)}" placeholder="nome do arquivo final">
          </div>
          <div class="field"><label>Pasta de destino</label><div class="compact-destination"><div class="destination-copy"><div class="destination-title">Salvar em</div><div class="destination-path">${this.escapeAttribute(this.state.outputFolder || this.state.defaultFolder || 'Downloads')}</div></div><button class="folder-action" id="convert-pick-folder" type="button" aria-label="Escolher pasta"><img class="raster-icon" src="./assets/ui/folder.png" alt=""></button></div><input type="hidden" id="convert-output-folder" value="${this.escapeAttribute(this.state.outputFolder)}"></div>
        </div>

        <div class="action-row" style="grid-template-columns: 1fr;">
          <button class="primary-btn" id="convert-start-btn" type="button" ${canConvert && !this.state.converting ? '' : 'disabled'}>
            ${this.state.converting ? 'Convertendo...' : 'Converter agora'}
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
      const filePath = await this.api.selectMediaFile()
      if (filePath) {
        await this.probeSelectedFile(filePath)
      }
    }
    dropZone.addEventListener('click', pickMedia)
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        pickMedia()
      }
    })

    outputName?.addEventListener('input', (event) => {
      this.state.outputName = event.target.value
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
      })

      field.addEventListener('change', (event) => {
        this.state[key] = event.target.value
        if (selector === '#video-quality-preset') {
          this.render()
        }
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
    const file = event.dataTransfer.files?.[0]
    let filePath = ''
    try {
      if (file) filePath = this.api.getPathForFile(file)
    } catch {
      filePath = ''
    }
    if (!filePath) {
      this.setStatus('Nao consegui ler o arquivo arrastado.', 'error')
      return
    }

    await this.probeSelectedFile(filePath)
  }

  async probeSelectedFile(filePath) {
    this.setStatus('Lendo metadados com ffprobe...', 'working')
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`Analisando: ${filePath}`]
    this.render()

    const result = await this.api.probeMedia(filePath)
    if (result.error) {
      this.state.result = {
        type: 'error',
        message: result.error
      }
      this.setStatus('Erro ao analisar arquivo.', 'error')
      this.render()
      return
    }

    this.setMediaInfo(result.mediaInfo, result.ffmpegCapabilities)
  }

  getPayload() {
    const mediaInfo = this.state.mediaInfo
    return {
      inputPath: this.state.selectedFilePath,
      mediaType: mediaInfo.type,
      duration: mediaInfo.duration,
      outputFolder: this.state.outputFolder,
      splitParts: this.state.splitParts,
      outputName: this.state.outputName,
      outputFormat: this.state.outputFormat,
      videoCodec: this.state.videoCodec,
      videoQualityPreset: this.state.videoQualityPreset,
      videoCrf: this.state.videoCrf,
      videoResolution: this.state.videoResolution,
      videoFps: this.state.videoFps,
      extractAudioOnly: this.state.extractAudioOnly,
      hdrToSdr: this.state.hdrToSdr,
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

  async startConversion() {
    if (!this.state.mediaInfo || this.state.converting) {
      return
    }

    this.state.converting = true
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = ['Preparando conversao...', `Arquivo: ${this.state.mediaInfo.fileName}`]
    this.render()
    this.setStatus('Iniciando conversao...', 'working')

    const result = await this.api.convertMedia(this.getPayload())
    this.state.converting = false

    if (result.success) {
      this.state.progress = 100
      this.state.lastOutputFolder = result.outputFolder
      this.state.result = {
        type: 'success',
        message: result.outputPaths ? `${result.outputPaths.length} clipes exportados para ${result.outputFolder}` : `Conversao concluida: ${result.outputPath}`,
        folder: result.outputFolder
      }
      this.state.logLines.push(`Comando final: ${result.commandPreview}`)
      this.setStatus('Conversao concluida com sucesso.')
      this.render()
      return
    }

    this.state.result = {
      type: 'error',
      message: result.error || 'Falha ao converter.'
    }
    this.setStatus('Erro na conversao.', 'error')
    this.render()
  }

  handleConversionProgress(data) {
    if (data.percent !== undefined) {
      this.state.progress = Math.max(0, Math.min(100, Number(data.percent)))
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
  }

  handleConversionState(data) {
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
