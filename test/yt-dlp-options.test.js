const test = require('node:test')
const assert = require('node:assert/strict')
const { cookieArgs, describeYtDlpError, isYoutubeAuthError, normalizeCookieBrowser } = require('../services/YtDlpOptions')

test('uses only the browser explicitly selected by the user', () => {
  assert.deepEqual(cookieArgs('', 'chrome'), ['--cookies-from-browser', 'chrome'])
  assert.deepEqual(cookieArgs('', 'EDGE'), ['--cookies-from-browser', 'edge'])
  assert.deepEqual(cookieArgs('', ''), [])
  assert.deepEqual(cookieArgs('', 'not-a-browser'), [])
})

test('a selected cookies file takes priority over browser cookies', () => {
  assert.deepEqual(cookieArgs('C:\\Users\\test\\cookies.txt', 'chrome'), ['--cookies', 'C:\\Users\\test\\cookies.txt'])
})

test('rejects unsupported browser identifiers', () => {
  assert.equal(normalizeCookieBrowser('safari'), '')
  assert.equal(normalizeCookieBrowser('firefox'), 'firefox')
})

test('reports a YouTube block without claiming Chrome authentication ran', () => {
  const message = describeYtDlpError("Sign in to confirm you're not a bot")
  assert.match(message, /YouTube bloqueou/)
  assert.doesNotMatch(message, /Chrome|cookies/i)
})

test('recognizes a rate limit as a recoverable YouTube block', () => {
  assert.equal(isYoutubeAuthError('HTTP Error 429: Too Many Requests'), true)
  assert.match(describeYtDlpError('HTTP Error 429: Too Many Requests'), /limitou as tentativas/)
})

test('explains a DPAPI failure without suggesting Chrome was restarted', () => {
  const message = describeYtDlpError('ERROR: Failed to decrypt with DPAPI')
  assert.match(message, /Windows não permitiu/)
  assert.doesNotMatch(message, /reinici/i)
})
