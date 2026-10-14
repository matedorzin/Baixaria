import { DownloadTab } from './components/DownloadTab.js'
import { ConvertTab } from './components/ConvertTab.js'

const statusDot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const updatePanel = document.getElementById('update-panel')
const updateTitle = document.getElementById('update-title')
const updateSummary = document.getElementById('update-summary')
const updateNotes = document.getElementById('update-notes')
const updateCheckButton = document.getElementById('update-check-btn')
const updateActionButton = document.getElementById('update-action-btn')

function setStatus(text, type = '') {
  statusDot.className = 'status-dot' + (type ? ` ${type}` : '')
  statusText.textContent = text
}

function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName)
  })

  document.getElementById('download-panel').classList.toggle('active', tabName === 'download')
  document.getElementById('convert-panel').classList.toggle('active', tabName === 'convert')
  setStatus(tabName === 'download' ? 'Aba Baixar pronta.' : 'Aba Converter pronta.')
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
  updateCheckButton.hidden = !appInfo.updaterAvailable
  const shared = {
    api: window.api,
    appInfo,
    setStatus
  }

  const downloadTab = new DownloadTab({
    root: document.getElementById('download-panel'),
    ...shared
  })

  const convertTab = new ConvertTab({
    root: document.getElementById('convert-panel'),
    ...shared
  })

  downloadTab.mount()
  convertTab.mount()

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
