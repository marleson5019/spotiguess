# Spotiguess 2.0

Projeto mobile-first para quiz musical com salas multiplayer.

## O que foi corrigido

- OAuth 2.0 Authorization Code with PKCE no navegador.
- Nenhum Client Secret no frontend.
- `/playlists/{id}/items` em vez do endpoint removido `/tracks`.
- Tratamento de 401, 429 e expiração da sessão.
- `Retry-After` com espera antes de tentar novamente.
- Salas com código de 6 dígitos usando Socket.IO.
- Host, lobby, countdown, 10 rodadas, respostas, ranking, streak e pódio.
- Metadata do Spotify mantida somente no estado imediato da sala.
- Atribuição/link do Spotify no modelo de dados.
- Layout pensado primeiro para celular.

## Limitação importante do Spotify

A API atual restringe a leitura completa de itens de playlist a playlists que o usuário autenticado possui ou em que é colaborador. Uma playlist pública de terceiros pode retornar 403.

Além disso, o Web Playback SDK exige Spotify Premium e o Spotify proíbe sincronizar gravações de áudio com mídia visual. Por isso esta versão não sincroniza áudio completo da música com o cronômetro visual do jogo. No modo solo, quando disponível, pode ser usado apenas um trecho curto de `preview_url` para a rodada.

Se a intenção é publicar o jogo, mantenha o fluxo de áudio fora da aplicação e siga os Developer Terms do Spotify.

## Rodando localmente

1. Instale Node.js 20+.
2. Copie `.env.example` para `.env`.
3. No Spotify Developer Dashboard, crie um app Web API.
4. Coloque o Client ID no `VITE_SPOTIFY_CLIENT_ID`.
5. Cadastre exatamente este Redirect URI:
   `http://127.0.0.1:5019/`
6. Execute:
   `npm install`
   `npm run dev`
7. Abra:
   `http://127.0.0.1:5019/`

Não use `http://localhost`.

## Produção

Use HTTPS. O Redirect URI cadastrado no Spotify precisa ser exatamente igual ao usado pela aplicação.

Para produção, configure:
`VITE_SPOTIFY_REDIRECT_URI=https://seu-dominio/`

E use um servidor Node/Socket.IO persistente para as salas.

## Deploy: Render (backend) + Vercel (frontend)

### 1) Backend no Render

1. Crie um serviço Web usando este repositório.
2. Build Command: `npm install`
3. Start Command: `npm run start`
4. Variáveis de ambiente:
   `PORT` não precisa definir manualmente (Render injeta automaticamente).
5. Após deploy, copie a URL pública do backend:
   `https://seu-backend.onrender.com`

### 2) Frontend no Vercel

1. Importe o mesmo repositório no Vercel.
2. Framework: Vite.
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Variáveis de ambiente no Vercel:
   `VITE_SPOTIFY_CLIENT_ID=...`
   `VITE_SPOTIFY_REDIRECT_URI=https://seu-frontend.vercel.app/`
   `VITE_SERVER_URL=https://seu-backend.onrender.com`

### 3) Spotify Dashboard

1. Em Redirect URIs, adicione exatamente:
   `https://seu-frontend.vercel.app/`
2. Salve as mudanças no app Spotify.

### 4) Teste final

1. Abra o frontend no Vercel.
2. Conecte no Spotify.
3. Crie sala/solo e valide conexão Socket.IO com o backend Render.

## Observação sobre modo solo

O modo solo agora roda localmente com base nas faixas da playlist carregada: cada rodada sorteia 1 música alvo e exibe 4 opções.

A reprodução/sincronização de áudio do Spotify continua deliberadamente não implementada por causa das restrições atuais da plataforma. Não substitua isso por download de previews ou por sincronização de gravações.
