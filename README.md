# SahurGuess

Quiz musical mobile-first conectado às playlists do Spotify. O host escolhe uma playlist, define de 5 a 20 rodadas e pode jogar sozinho ou abrir uma sala multiplayer com código de 6 números.

## O que está pronto

- Login Spotify com Authorization Code + PKCE, sem Client Secret no navegador.
- Lista automática das playlists do usuário.
- Escolha de 5, 10, 15 ou 20 rodadas.
- Modo solo e salas multiplayer em tempo real com Socket.IO.
- Quatro respostas por rodada e pontuação de 100 a 0 conforme o tempo.
- Ranking durante as rodadas, pódio final, reinício da sala e saída.
- Frontend configurado para Netlify e backend configurado para Render.

## Rodar localmente

Use Node.js 20 ou superior. Copie `.env.example` para `.env`, preencha somente o Client ID e execute `npm install` e `npm run dev`.

No Spotify Developer Dashboard, cadastre `http://127.0.0.1:5019/` como Redirect URI. O Client Secret não é necessário, pois o projeto usa PKCE.

## Publicar

### Backend no Render

Crie um Web Service com este repositório. O arquivo `render.yaml` já contém os comandos. Depois do primeiro deploy, defina `ALLOWED_ORIGINS` como a URL final do Netlify, por exemplo `https://sahurguess.netlify.app`.

### Frontend no Netlify

Importe o repositório. O arquivo `netlify.toml` já define o build e a pasta publicada. Configure:

```text
VITE_SPOTIFY_CLIENT_ID=seu_client_id
VITE_SPOTIFY_REDIRECT_URI=https://seu-site.netlify.app/
VITE_SERVER_URL=https://spotiguess-kk1y.onrender.com
```

Cadastre a mesma `VITE_SPOTIFY_REDIRECT_URI`, exatamente igual e com HTTPS, no Spotify Developer Dashboard.

## Áudio do Spotify

O áudio completo é iniciado no dispositivo do host usando o Spotify Web Playback SDK e requer Spotify Premium. Os demais jogadores acompanham as opções e o placar sincronizados; em uma partida remota, o host precisa compartilhar o áudio em uma chamada. Quando existir `preview_url`, o navegador pode usá-la como alternativa.

Nunca coloque `SPOTIFY_CLIENT_SECRET` em variáveis `VITE_*` ou em arquivos enviados ao GitHub.
