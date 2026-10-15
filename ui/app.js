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
let appSettings = { downloadFolder: '' }
let downloadTab
let convertTab
let clipTab

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
  const screens = {
    download: ['01', 'BAIXAR', 'ダウンロード'],
    clips: ['02', 'CLIPES', 'クリップ'],
    convert: ['03', 'CONVERTER', '変換'],
    settings: ['04', 'CONFIGURAÇÕES', '設定']
  }
  const [number, title, japanese] = screens[tabName] || screens.download
  document.getElementById('screen-index').textContent = number
  document.getElementById('screen-title').textContent = title
  document.getElementById('screen-japanese').textContent = japanese
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName)
  })

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tabName}-panel`)
  })
  const labels = { download: 'Baixar', clips: 'Clipes', convert: 'Converter', settings: 'Configurações' }
  setStatus(`Aba ${labels[tabName] || 'Baixar'} pronta.`)
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
  document.getElementById('minimize-btn').addEventListener('click', () => window.api.minimize())
  document.getElementById('close-btn').addEventListener('click', () => window.api.close())
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
  document.getElementById('tab-clips-btn').addEventListener('click', () => activateTab('clips'))
  document.getElementById('uninstall-btn').addEventListener('click', async () => {
    const result = await window.api.openUninstallSettings()
    if (result?.error) setStatus(result.error, 'error')
  })
  const shared = {
    api: window.api,
    appInfo,
    setStatus
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
