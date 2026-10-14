const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectCookiesFile: () => ipcRenderer.invoke('select-cookies-file'),
  selectMediaFile: () => ipcRenderer.invoke('select-media-file'),
  openFolder: (folderPath) => ipcRenderer.send('open-folder', folderPath),
  checkYtdlp: () => ipcRenderer.invoke('check-ytdlp'),
  fetchPlaylist: (url) => ipcRenderer.invoke('fetch-playlist', url),
  probeMedia: (filePath) => ipcRenderer.invoke('probe-media', filePath),
  convertMedia: (payload) => ipcRenderer.invoke('convert-media', payload),
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  stopDownload: () => ipcRenderer.invoke('stop-download'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data)),
  onDownloadState: (callback) => ipcRenderer.on('download-state', (_, data) => callback(data)),
  onConversionProgress: (callback) => ipcRenderer.on('conversion-progress', (_, data) => callback(data)),
  onConversionState: (callback) => ipcRenderer.on('conversion-state', (_, data) => callback(data)),
  onUpdaterState: (callback) => ipcRenderer.on('updater-state', (_, data) => callback(data)),
  removeProgressListener: () => ipcRenderer.removeAllListeners('download-progress'),
  removeDownloadStateListener: () => ipcRenderer.removeAllListeners('download-state'),
  removeConversionProgressListener: () => ipcRenderer.removeAllListeners('conversion-progress'),
  removeConversionStateListener: () => ipcRenderer.removeAllListeners('conversion-state'),
  removeUpdaterStateListener: () => ipcRenderer.removeAllListeners('updater-state')
})
