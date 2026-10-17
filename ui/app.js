import { DownloadTab } from './components/DownloadTab.js'
import { ConvertTab } from './components/ConvertTab.js'
import { ClipTab } from './components/ClipTab.js'

const statusDot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const updatePanel = document.getElementById('update-panel')
const updateTitle = document.getElementById('update-title')
const updateSummary = document.getElementById('update-summary')
const updateNotes = document.getElementById('update-notes')
const updateCheckButton = document.getElementById('update-check-btn')
const updateActionButton = document.getElementById('update-action-btn')
let appSettings = { downloadFolder: '', soundMuted: false, soundVolume: 0.35 }
let clickAudioContext
let soundSaveTimer

function playClick() {
  if (appSettings.soundMuted || appSettings.soundVolume <= 0) return
  try {
    clickAudioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    if (clickAudioContext.state === 'suspended') clickAudioContext.resume()
    const now = clickAudioContext.currentTime
    const oscillator = clickAudioContext.createOscillator()
    const gain = clickAudioContext.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(660, now)
    oscillator.frequency.exponentialRampToValueAtTime(260, now + 0.038)
    gain.gain.setValueAtTime(Math.max(0.001, appSettings.soundVolume * 0.12), now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
    oscillator.connect(gain).connect(clickAudioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.05)
  } catch {}
}

function playSuccessSound() {
  if (appSettings.soundMuted || appSettings.soundVolume <= 0) return
  try {
    clickAudioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    if (clickAudioContext.state === 'suspended') clickAudioContext.resume()
    const start = clickAudioContext.currentTime + 0.02
    ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const at = start + index * 0.115
      const length = index === 3 ? 0.3 : 0.105
      const oscillator = clickAudioContext.createOscillator()
      const gain = clickAudioContext.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(frequency, at)
      gain.gain.setValueAtTime(0.001, at)
      gain.gain.linearRampToValueAtTime(appSettings.soundVolume * 0.085, at + 0.008)
      gain.gain.setValueAtTime(appSettings.soundVolume * 0.085, at + length * 0.6)
      gain.gain.exponentialRampToValueAtTime(0.001, at + length)
      oscillator.connect(gain).connect(clickAudioContext.destination)
      oscillator.start(at)
      oscillator.stop(at + length)
    })
  } catch {}
}

function syncSoundControls() {
  const mute = document.getElementById('sound-toggle')
  const icon = document.getElementById('sound-toggle-icon')
  const slider = document.getElementById('settings-sound-volume')
  const value = document.getElementById('settings-sound-value')
  if (mute) { mute.classList.toggle('is-muted', appSettings.soundMuted); mute.title = appSettings.soundMuted ? 'Ativar efeitos' : 'Silenciar efeitos'; mute.setAttribute('aria-label', mute.title) }
  if (icon) icon.src = `./assets/ui/${appSettings.soundMuted ? 'mute' : 'volume'}.png`
  if (slider) slider.value = Math.round(appSettings.soundVolume * 100)
  if (value) value.textContent = `${Math.round(appSettings.soundVolume * 100)}%`
}

async function saveSoundSettings() {
  const result = await window.api.setSoundSettings(appSettings.soundMuted, appSettings.soundVolume)
  if (result.error) setStatus(result.error, 'error')
}
let downloadTab
let convertTab
let clipTab

const homeBanners = [
  './assets/ui/home-bald.png',
  './assets/ui/home-demon.png',
  './assets/ui/home-oni.png'
]
const lastHomeBanner = localStorage.getItem('lastHomeBanner')
const bannerChoices = homeBanners.map((_, index) => index).filter((index) => String(index) !== lastHomeBanner)
const homeBannerIndex = bannerChoices[Math.floor(Math.random() * bannerChoices.length)]
localStorage.setItem('lastHomeBanner', String(homeBannerIndex))
document.getElementById('home-art').src = homeBanners[homeBannerIndex]

const japaneseLabels = new Map([
  ['Criar clipes', 'クリップ作成'], ['Exportar clipes', '書き出し'], ['Saida', '出力'],
  ['Link do video ou playlist', '動画リンク'], ['Formato', '形式'],
  ['Qualidade do video', '画質'], ['Qualidade do audio', '音質'],
  ['Pasta de destino', '保存先'], ['Salvar em', '保存先'],
  ['Nome final do arquivo', 'ファイル名'], ['Nome do arquivo ou pasta (opcional)', 'ファイル名'],
  ['Quantidade de partes', '分割数'], ['Dividir em vários clipes', 'クリップに分割'],
  ['Baixar playlist inteira', '全件ダウンロード'],
  ['Video', 'ビデオ'], ['Áudio', 'オーディオ'], ['Audio', 'オーディオ'], ['Só áudio', '音声のみ'],
  ['Melhor disponível', '最高画質'], ['Melhor', '最高画質'],
  ['Carregar vídeo', '動画を読み込む'], ['Ver playlist', 'リストを見る'],
  ['Marcar início no player', '開始を設定'], ['Marcar fim no player', '終了を設定'],
  ['Ver trecho', 'プレビュー'], ['Verificar atualizações', '更新を確認'],
  ['Mais opções', '詳細設定'], ['Opções avançadas', '詳細設定'],
  ['Dividir este vídeo em clipes', 'クリップに分割'],
  ['Adicionar trecho', '区間を追加'], ['Parar', '停止'],
  ['Desinstalar pelo Windows', 'アンインストール'],
  ['Baixar agora', 'ダウンロード'], ['Converter agora', '変換する']
])

function decorateJapanese() {
  document.querySelectorAll('.content .section-title, .content .field > label, .content .destination-title, .content .primary-btn, .content .secondary-btn, .content .ghost-btn, .content .danger-btn, .content .quality-choice strong, .content .fmt-label, .content .toggle-title, .content .advanced-options summary').forEach((element) => {
    if (element.dataset.jp) return
    const label = element.textContent.trim().replace(/\s+/g, ' ')
    const translation = japaneseLabels.get(label) || (label.startsWith('Baixar ') && /clipe|áudio/.test(label) ? 'ダウンロード' : '')
    if (translation) element.dataset.jp = translation
  })
}

function setStatus(text, type = '') {
  statusDot.className = 'status-dot' + (type ? ` ${type}` : '')
  statusText.textContent = text
}

function activateTab(tabName) {
  if (tabName === 'settings') {
    if (document.querySelector('.layout').classList.contains('home-active')) activateTab('download')
    document.getElementById('settings-panel').classList.add('active')
    document.querySelector('.layout').classList.add('settings-open')
    document.getElementById('settings-btn').classList.add('active')
    return
  }
  document.getElementById('settings-panel').classList.remove('active')
  document.querySelector('.layout').classList.remove('settings-open')
  document.getElementById('settings-btn').classList.remove('active')
  document.querySelector('.layout').classList.toggle('home-active', tabName === 'home')
  const screens = {
    download: ['01', 'BAIXAR', 'ダウンロード'],
    clips: ['02', 'CLIPES', 'クリップ'],
    convert: ['03', 'CONVERTER', '変換'],
    settings: ['04', 'CONFIGURAÇÕES', '設定']
  }
  const screen = screens[tabName]
  if (screen) {
    const [number, title, japanese] = screen
    document.getElementById('screen-index').textContent = number
    document.getElementById('screen-title').textContent = title
    document.getElementById('screen-japanese').textContent = japanese
  }
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName)
  })

  document.querySelectorAll('.tab-panel:not(#settings-panel)').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tabName}-panel`)
  })
  const labels = { download: 'Baixar', clips: 'Clipes', convert: 'Converter', settings: 'Configurações' }
  if (labels[tabName]) setStatus(`Aba ${labels[tabName]} pronta.`)
}

function renderUpdaterState(data) {
  const state = data.state
  updatePanel.hidden = false
  updateActionButton.hidden = true
  updateActionButton.disabled = false

  if (state === 'checking') {
    updateTitle.textContent = 'Procurando atualizações'
    updateSummary.textContent = 'Verificando se há uma versão nova do Baixaria.'
    updateNotes.hidden = true
    updateCheckButton.disabled = true
    return
  }

  updateCheckButton.disabled = false

  if (state === 'available') {
    updateTitle.textContent = `Baixaria ${data.version} está disponível`
    updateSummary.textContent = 'Veja as novidades e escolha quando baixar.'
    updateNotes.textContent = data.releaseNotes || 'Esta versão não trouxe notas de lançamento.'
    updateNotes.hidden = false
    updateActionButton.textContent = 'Baixar atualização'
    updateActionButton.hidden = false
    updateActionButton.dataset.action = 'download'
    setStatus(`Atualização ${data.version} disponível.`)
    return
  }

  if (state === 'downloading') {
    updateTitle.textContent = 'Baixando atualização'
    updateSummary.textContent = `${data.percent || 0}% concluído`
    updateNotes.hidden = true
    updateCheckButton.disabled = true
    return
  }

  if (state === 'downloaded') {
    updateTitle.textContent = `Baixaria ${data.version} está pronta`
    updateSummary.textContent = 'Salve seu trabalho e reinicie para instalar.'
    updateNotes.textContent = data.releaseNotes || 'Esta versão não trouxe notas de lançamento.'
    updateNotes.hidden = false
    updateActionButton.textContent = 'Reiniciar e atualizar'
    updateActionButton.hidden = false
    updateActionButton.dataset.action = 'install'
    setStatus('Atualização baixada e pronta para instalar.')
    return
  }

  if (state === 'up-to-date') {
    updatePanel.hidden = true
    setStatus('Baixaria está atualizado.')
    return
  }

  updateTitle.textContent = 'Não foi possível verificar atualizações'
  updateSummary.textContent = data.message || 'Tente novamente quando estiver online.'
  updateNotes.hidden = true
  setStatus('Verificação de atualização indisponível.')
}

async function boot() {
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button:not(:disabled)')) playClick()
  }, true)
  document.getElementById('minimize-btn').addEventListener('click', () => window.api.minimize())
  document.getElementById('close-btn').addEventListener('click', () => window.api.close())
  document.getElementById('tab-home-btn').addEventListener('click', () => activateTab('home'))
  document.getElementById('home-download-btn').addEventListener('click', () => activateTab('download'))
  document.getElementById('home-clips-btn').addEventListener('click', () => activateTab('clips'))
  document.getElementById('home-convert-btn').addEventListener('click', () => activateTab('convert'))
  document.getElementById('home-settings-btn').addEventListener('click', () => activateTab('settings'))
  updateCheckButton.addEventListener('click', async () => {
    updateCheckButton.disabled = true
    updatePanel.hidden = false
    updateTitle.textContent = 'Procurando atualizações'
    updateSummary.textContent = 'Verificando se há uma versão nova do Baixaria.'
    updateNotes.hidden = true
    const result = await window.api.checkForUpdates()
    if (result.error || result.available === false) {
      renderUpdaterState({ state: 'error', message: result.error || result.message })
    }
  })
  updateActionButton.addEventListener('click', async () => {
    updateActionButton.disabled = true
    const result = updateActionButton.dataset.action === 'install'
      ? await window.api.installUpdate()
      : await window.api.downloadUpdate()
    if (result.error) {
      renderUpdaterState({ state: 'error', message: result.error })
    }
  })

  window.api.removeUpdaterStateListener()
  window.api.onUpdaterState(renderUpdaterState)

  const appInfo = await window.api.checkYtdlp()
  appSettings = appInfo.settings || await window.api.getAppSettings()
  syncSoundControls()
  document.getElementById('sound-toggle').addEventListener('click', () => {
    appSettings.soundMuted = !appSettings.soundMuted
    syncSoundControls()
    clearTimeout(soundSaveTimer)
    saveSoundSettings()
  })
  document.getElementById('settings-sound-volume').addEventListener('input', (event) => {
    appSettings.soundVolume = Number(event.target.value) / 100
    if (appSettings.soundVolume > 0) appSettings.soundMuted = false
    syncSoundControls()
    clearTimeout(soundSaveTimer)
    soundSaveTimer = setTimeout(saveSoundSettings, 200)
  })
  document.getElementById('settings-session-status').textContent = appInfo.cookiesPath
    ? 'Arquivo local de acesso encontrado neste PC. O Baixaria o usa automaticamente ao ler vídeos do YouTube.'
    : 'Nenhum arquivo local de acesso encontrado. O Baixaria tentará ler vídeos diretamente.'
  updateCheckButton.hidden = !appInfo.updaterAvailable
  document.getElementById('settings-download-folder').textContent = appSettings.downloadFolder || 'Downloads'
  document.getElementById('settings-version').textContent = `Baixaria ${appInfo.appVersion || ''}`
  document.getElementById('settings-pick-folder').addEventListener('click', async () => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const result = await window.api.setDownloadFolder(folder)
    if (result.error) { setStatus(result.error, 'error'); return }
    appSettings = result.settings
    document.getElementById('settings-download-folder').textContent = appSettings.downloadFolder
    downloadTab?.setDefaultFolder(appSettings.downloadFolder)
    convertTab?.setDefaultFolder(appSettings.downloadFolder)
    clipTab?.setDefaultFolder(appSettings.downloadFolder)
    setStatus('Pasta padrão atualizada.')
  })
  document.getElementById('settings-btn').addEventListener('click', () => activateTab('settings'))
  document.getElementById('tab-settings-btn').addEventListener('click', () => activateTab('settings'))
  document.getElementById('settings-close').addEventListener('click', () => activateTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'download'))
  document.getElementById('settings-dismiss').addEventListener('click', () => activateTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'download'))
  document.getElementById('tab-clips-btn').addEventListener('click', () => activateTab('clips'))
  document.getElementById('uninstall-btn').addEventListener('click', async () => {
    const result = await window.api.openUninstallSettings()
    if (result?.error) setStatus(result.error, 'error')
  })
  const shared = {
    api: window.api,
    appInfo,
    setStatus,
    onSuccess: playSuccessSound
  }

  downloadTab = new DownloadTab({
    root: document.getElementById('download-panel'),
    settings: appSettings,
    ...shared
  })

  convertTab = new ConvertTab({
    root: document.getElementById('convert-panel'),
    settings: appSettings,
    ...shared
  })
  clipTab = new ClipTab({ root: document.getElementById('clips-panel'), settings: appSettings, ...shared })

  downloadTab.mount()
  convertTab.mount()
  clipTab.mount()
  decorateJapanese()
  new MutationObserver(decorateJapanese).observe(document.querySelector('.content'), { childList: true, subtree: true })

  document.getElementById('tab-download-btn').addEventListener('click', () => activateTab('download'))
  document.getElementById('tab-convert-btn').addEventListener('click', () => activateTab('convert'))

  if (!appInfo.ok) {
    setStatus('yt-dlp.exe nao encontrado.', 'error')
    return
  }

  const ytdlpLocation = appInfo.ytdlpPath ? `yt-dlp pronto em ${appInfo.ytdlpPath}` : 'yt-dlp pronto'
  const ffmpegHint = appInfo.ffmpegPath ? ' e ffmpeg detectado' : ''
  setStatus(ytdlpLocation + ffmpegHint)
}

boot()
