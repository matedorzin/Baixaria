export function renderVideoOptions(state, capabilities) {
  const av1Option = capabilities?.av1 ? '<option value="AV1">AV1</option>' : ''
  const customCrfField = state.videoQualityPreset === 'custom'
    ? `
      <div class="field">
        <label>CRF personalizado</label>
        <input type="number" id="video-crf" min="0" max="51" value="${state.videoCrf}">
      </div>
    `
    : ''

  const disabled = state.convertToGif || state.extractAudioOnly ? 'disabled' : ''

  return `
    <div class="card">
      <div class="section-title">Opcoes de video</div>
      <div class="toggle-grid" style="margin-bottom:14px;">
        <label class="toggle-row" for="extract-audio-only">
          <input type="checkbox" id="extract-audio-only" ${state.extractAudioOnly ? 'checked' : ''}>
          <span class="toggle-copy">
            <span class="toggle-title">Extrair apenas o audio</span>
            <span class="toggle-sub">Esconde as opcoes de video e mostra as opcoes de audio.</span>
          </span>
        </label>
        <label class="toggle-row" for="hdr-to-sdr">
          <input type="checkbox" id="hdr-to-sdr" ${state.hdrToSdr ? 'checked' : ''} ${state.convertToGif || state.extractAudioOnly ? 'disabled' : ''}>
          <span class="toggle-copy">
            <span class="toggle-title">Corrigir HDR para SDR</span>
            <span class="toggle-sub">Aplica tone mapping Rec.709 apenas aos arquivos HDR da fila.</span>
          </span>
        </label>
        <label class="toggle-row" for="convert-to-gif">
          <input type="checkbox" id="convert-to-gif" ${state.convertToGif ? 'checked' : ''}>
          <span class="toggle-copy">
            <span class="toggle-title">Converter video para GIF</span>
            <span class="toggle-sub">Desabilita as opcoes normais de video e audio.</span>
          </span>
        </label>
      </div>

      <div class="row two">
        <div class="field">
          <label>Formato de saida</label>
          <select id="video-output-format" ${disabled}>
            <option value="MP4" ${state.outputFormat === 'MP4' ? 'selected' : ''}>MP4</option>
            <option value="MOV" ${state.outputFormat === 'MOV' ? 'selected' : ''}>MOV</option>
            <option value="MKV" ${state.outputFormat === 'MKV' ? 'selected' : ''}>MKV</option>
            <option value="WEBM" ${state.outputFormat === 'WEBM' ? 'selected' : ''}>WebM</option>
            <option value="AVI" ${state.outputFormat === 'AVI' ? 'selected' : ''}>AVI</option>
          </select>
        </div>
        <div class="field">
          <label>Codec de video</label>
          <select id="video-codec" ${disabled}>
            <option value="H.264" ${state.videoCodec === 'H.264' ? 'selected' : ''}>H.264</option>
            <option value="H.265" ${state.videoCodec === 'H.265' ? 'selected' : ''}>H.265</option>
            <option value="VP9" ${state.videoCodec === 'VP9' ? 'selected' : ''}>VP9</option>
            ${av1Option}
          </select>
        </div>
      </div>

      <div class="row three">
        <div class="field">
          <label>Qualidade</label>
          <select id="video-quality-preset" ${disabled || state.optimizeEnabled ? 'disabled' : ''}>
            <option value="high" ${state.videoQualityPreset === 'high' ? 'selected' : ''}>Alta</option>
            <option value="medium" ${state.videoQualityPreset === 'medium' ? 'selected' : ''}>Media</option>
            <option value="low" ${state.videoQualityPreset === 'low' ? 'selected' : ''}>Baixa</option>
            <option value="custom" ${state.videoQualityPreset === 'custom' ? 'selected' : ''}>Personalizada com CRF</option>
          </select>
          ${state.optimizeEnabled ? '<small>Qualidade controlada pela barra de otimização.</small>' : ''}
        </div>
        <div class="field">
          <label>Resolucao</label>
          <select id="video-resolution" ${disabled}>
            <option value="original" ${state.videoResolution === 'original' ? 'selected' : ''}>Manter original</option>
            <option value="4K" ${state.videoResolution === '4K' ? 'selected' : ''}>4K</option>
            <option value="1080p" ${state.videoResolution === '1080p' ? 'selected' : ''}>1080p</option>
            <option value="720p" ${state.videoResolution === '720p' ? 'selected' : ''}>720p</option>
            <option value="480p" ${state.videoResolution === '480p' ? 'selected' : ''}>480p</option>
          </select>
        </div>
        <div class="field">
          <label>FPS</label>
          <select id="video-fps" ${disabled}>
            <option value="original" ${state.videoFps === 'original' ? 'selected' : ''}>Manter original</option>
            <option value="60" ${state.videoFps === '60' ? 'selected' : ''}>60</option>
            <option value="30" ${state.videoFps === '30' ? 'selected' : ''}>30</option>
            <option value="24" ${state.videoFps === '24' ? 'selected' : ''}>24</option>
          </select>
        </div>
      </div>
      ${customCrfField}
    </div>
  `
}
