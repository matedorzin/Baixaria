import { renderFileDropZone } from './FileDropZone.js'
import { renderMediaInfoCard } from './MediaInfoCard.js'
import { renderVideoOptions } from './VideoOptions.js'
import { renderAudioOptions } from './AudioOptions.js'
import { renderGifOptions } from './GifOptions.js'

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

export class ConvertTab {
  constructor({ root, api, setStatus, appInfo }) {
    this.root = root
    this.api = api
    this.setStatus = setStatus
    this.appInfo = appInfo
    this.state = {
      selectedFilePath: '',
      mediaInfo: null,
      capabilities: appInfo.ffmpegCapabilities || { av1: false },
      converting: appInfo.conversionState === 'converting',
      outputFolder: '',
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
    this.state.result = null
    this.state.progress = 0
    this.state.logLines = [`Arquivo detectado: ${mediaInfo.fileName}`]
    this.render()
    this.setStatus(`Arquivo analisado: ${mediaInfo.fileName}`)
  }

  render() {
    const mediaInfo = this.state.mediaInfo
    const showVideoOptions = mediaInfo && mediaInfo.type === 'video'
    const showAudioOptions = mediaInfo && (mediaInfo.type === 'audio' || this.state.extractAudioOnly)
    const showGifOptions = mediaInfo && mediaInfo.type === 'video' && this.state.convertToGif

    this.root.innerHTML = `
      ${renderFileDropZone({ selectedFileName: this.state.selectedFilePath })}
      ${mediaInfo ? renderMediaInfoCard(mediaInfo) : ''}
      ${showVideoOptions ? renderVideoOptions(this.state, this.state.capabilities) : ''}
      ${showGifOptions ? renderGifOptions(this.state) : ''}
      ${showAudioOptions ? renderAudioOptions(this.state, mediaInfo.type === 'audio' ? 'audio' : 'extract') : ''}
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
          <div class="field">
            <label>Pasta de destino</label>
            <div class="path-row">
              <input type="text" id="convert-output-folder" value="${this.escapeAttribute(this.state.outputFolder)}" placeholder="pasta final">
              <button class="icon-btn" id="convert-pick-folder" type="button">...</button>
            </div>
          </div>
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
    const pickMediaButton = this.root.querySelector('#pick-media-btn')

    dropZone.addEventListener('dragenter', (event) => {
      event.preventDefault()
      dropZone.classList.add('dragging')
    })
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault()
      dropZone.classList.add('dragging')
    })
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragging')
    })
    dropZone.addEventListener('drop', (event) => this.handleDrop(event))

    pickMediaButton.addEventListener('click', async () => {
      const filePath = await this.api.selectMediaFile()
      if (filePath) {
        await this.probeSelectedFile(filePath)
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
    const filePath = file?.path
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
      outputName: this.state.outputName,
      outputFormat: this.state.outputFormat,
      videoCodec: this.state.videoCodec,
      videoQualityPreset: this.state.videoQualityPreset,
      videoCrf: this.state.videoCrf,
      videoResolution: this.state.videoResolution,
      videoFps: this.state.videoFps,
      extractAudioOnly: this.state.extractAudioOnly,
      hdrToSdr: this.state.hdrToSdr,
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
        message: `Conversao concluida: ${result.outputPath}`,
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
