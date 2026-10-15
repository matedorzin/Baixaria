function isHdrTransfer(colorTransfer) {
  return ['arib-std-b67', 'smpte2084'].includes(String(colorTransfer || '').toLowerCase())
}

function buildHdrToSdrFilter(colorTransfer) {
  // For iPhone HLG, the forced 10x peak and highlight desaturation washed
  // out skin tones. A 300-nit linearization matches its SDR presentation.
  const isHlg = colorTransfer === 'arib-std-b67'
  const nominalPeak = isHlg ? 300 : 100
  const toneMap = isHlg
    ? 'hable:desat=0'
    : 'hable:peak=10:desat=1'
  return `zscale=t=linear:npl=${nominalPeak},format=gbrpf32le,zscale=p=bt709,tonemap=${toneMap},zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
}

module.exports = { isHdrTransfer, buildHdrToSdrFilter }
