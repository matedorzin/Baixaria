export function renderAudioOptions(state, mode = 'audio') {
  const formatLabel = mode === 'extract' ? 'Formato de audio' : 'Formato de saida'
  const formatId = mode === 'extract' ? 'extract-audio-format' : 'audio-format'
  const bitrateId = mode === 'extract' ? 'extract-audio-bitrate' : 'audio-bitrate'
  const sampleRateId = mode === 'extract' ? 'extract-audio-sample-rate' : 'audio-sample-rate'
  const channelsId = mode === 'extract' ? 'extract-audio-channels' : 'audio-channels'
  const formatValue = mode === 'extract' ? state.audioExtractFormat : state.audioFormat
  const bitrateValue = state.audioBitrate
  const sampleRateValue = state.audioSampleRate
  const channelsValue = state.audioChannels
  const includeM4a = mode === 'audio'

  return `
    <div class="card">
      <div class="section-title">${mode === 'extract' ? 'Opcoes de extracao de audio' : 'Opcoes de audio'}</div>
      <div class="row two">
        <div class="field">
          <label>${formatLabel}</label>
          <select id="${formatId}">
            <option value="MP3" ${formatValue === 'MP3' ? 'selected' : ''}>MP3</option>
            <option value="WAV" ${formatValue === 'WAV' ? 'selected' : ''}>WAV</option>
            <option value="AAC" ${formatValue === 'AAC' ? 'selected' : ''}>AAC</option>
            <option value="FLAC" ${formatValue === 'FLAC' ? 'selected' : ''}>FLAC</option>
            <option value="OGG" ${formatValue === 'OGG' ? 'selected' : ''}>OGG</option>
            ${includeM4a ? `<option value="M4A" ${formatValue === 'M4A' ? 'selected' : ''}>M4A</option>` : ''}
          </select>
        </div>
        <div class="field">
          <label>Qualidade / bitrate</label>
          <select id="${bitrateId}">
            <option value="320k" ${bitrateValue === '320k' ? 'selected' : ''}>320 kbps</option>
            <option value="256k" ${bitrateValue === '256k' ? 'selected' : ''}>256 kbps</option>
            <option value="192k" ${bitrateValue === '192k' ? 'selected' : ''}>192 kbps</option>
            <option value="128k" ${bitrateValue === '128k' ? 'selected' : ''}>128 kbps</option>
            <option value="96k" ${bitrateValue === '96k' ? 'selected' : ''}>Personalizado basico 96k</option>
          </select>
        </div>
      </div>

      <div class="row two">
        <div class="field">
          <label>Sample rate</label>
          <select id="${sampleRateId}">
            <option value="original" ${sampleRateValue === 'original' ? 'selected' : ''}>Manter original</option>
            <option value="44100" ${sampleRateValue === '44100' ? 'selected' : ''}>44100 Hz</option>
            <option value="48000" ${sampleRateValue === '48000' ? 'selected' : ''}>48000 Hz</option>
          </select>
        </div>
        <div class="field">
          <label>Canais</label>
          <select id="${channelsId}">
            <option value="original" ${channelsValue === 'original' ? 'selected' : ''}>Manter original</option>
            <option value="stereo" ${channelsValue === 'stereo' ? 'selected' : ''}>Stereo</option>
            <option value="mono" ${channelsValue === 'mono' ? 'selected' : ''}>Mono</option>
          </select>
        </div>
      </div>
    </div>
  `
}
