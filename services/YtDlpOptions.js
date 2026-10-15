const SUPPORTED_COOKIE_BROWSERS = new Set(['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'chromium', 'whale'])

function normalizeCookieBrowser(value) {
  const browser = String(value || '').trim().toLowerCase()
  return SUPPORTED_COOKIE_BROWSERS.has(browser) ? browser : ''
}

function cookieArgs(cookiesPath, browser) {
  if (typeof cookiesPath === 'string' && cookiesPath.trim()) {
    return ['--cookies', cookiesPath]
  }
  const normalizedBrowser = normalizeCookieBrowser(browser)
  if (normalizedBrowser) {
    return ['--cookies-from-browser', normalizedBrowser]
  }
  return []
}

function isYoutubeAuthError(message) {
  return /sign in to confirm|not a bot|confirm you.re not a bot|login required|age.restricted|members.only|http error 429|too many requests/i.test(String(message || ''))
}

function describeYtDlpError(message) {
  const details = String(message || '')
  if (/failed to decrypt with DPAPI/i.test(details)) {
    return 'O Windows não permitiu ler os cookies do navegador. O Chrome não foi fechado pelo Baixaria.'
  }
  if (/http error 429|too many requests/i.test(details)) {
    return 'O YouTube limitou as tentativas desta conexão. O Baixaria tentou recuperar o download automaticamente.'
  }
  if (/sign in to confirm|not a bot|confirm you.re not a bot/i.test(details)) {
    return 'O YouTube bloqueou a leitura automática deste vídeo.'
  }
  return ''
}

module.exports = { cookieArgs, describeYtDlpError, isYoutubeAuthError, normalizeCookieBrowser }
