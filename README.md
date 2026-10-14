# Baixaria

Aplicativo para baixar vídeos e playlists e converter arquivos de mídia no Windows.

## Instalar

Baixe o instalador `.exe` na seção **Releases** deste repositório e siga as instruções na tela. Com internet, o Baixaria verifica atualizações ao abrir. Quando houver uma nova versão, o app mostra as notas, permite baixar e pede para reiniciar para concluir a instalação. A checagem também pode ser iniciada manualmente na barra inferior.

## Desenvolver

Requisitos: Windows x64, Node.js 24 ou compatível e PowerShell.

```powershell
npm ci
npm start
```

O app usa executáveis do yt-dlp, FFmpeg/ffprobe e Deno em `bin/`. Para preparar versões recentes e verificar os checksums publicados pelos fornecedores:

```powershell
./scripts/download-runtime.ps1
```

Os executáveis, downloads, cookies e arquivos temporários são ignorados pelo Git. Cookies do navegador são dados sensíveis: selecione-os localmente no app quando precisar, e nunca os publique.

## Criar uma versão

1. Atualize `version` em `package.json` e inclua notas no topo de `CHANGELOG.md` usando `## [x.y.z] - AAAA-MM-DD`.
2. Envie as alterações para a branch principal.
3. Crie e envie uma tag que corresponda à versão, por exemplo:

   ```powershell
   git tag v1.0.1
   git push origin v1.0.1
   ```

O GitHub Actions compila o instalador NSIS x64 e publica um GitHub Release com as notas do changelog. O segredo `GITHUB_TOKEN` é fornecido pelo próprio GitHub Actions. Não coloque tokens no código.

## Segurança e componentes

O app não inclui cookies pessoais no instalador. A janela usa isolamento de contexto e sandbox; a comunicação entre a interface e o processo principal valida a origem. O atualizador obtém pacotes de GitHub Releases sobre HTTPS.

Consulte [avisos de terceiros](THIRD_PARTY_NOTICES.md) para as origens e licenças das ferramentas incluídas. A build Essentials do FFmpeg indicada pelo fornecedor é GPLv3; revise os termos aplicáveis à redistribuição antes de publicar um instalador. Instaladores não assinados podem exibir avisos do Windows SmartScreen.
