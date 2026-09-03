import "./style.css";
import { io } from "socket.io-client";

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI = new URL(import.meta.env.BASE_URL, location.origin).href;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "https://spotiguess-kk1y.onrender.com";
const API = "https://api.spotify.com/v1";
const SCOPES = "playlist-read-private playlist-read-collaborative streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";

const app=document.querySelector("#app");
app.innerHTML=`
<div class="app">
<section class="screen active" id="home">
  <div class="logo"><div class="disc"></div><span>Sahur<b>Guess</b></span></div>
  <div class="intro"><span class="eyebrow">OUÇA. ADIVINHE. VENÇA.</span><h1>Você conhece mesmo<br>as suas playlists?</h1><p>Conecte o Spotify, escolha uma playlist e dispute cada segundo.</p></div>
  <label>SEU NOME</label>
  <div class="namebox"><div class="avatar" id="avatar">?</div><input id="name" maxlength="16" placeholder="Como podemos te chamar?"></div>
  <div class="menu" id="create"><div class="icon">🎧</div><div><h3>Criar sala</h3><p>Conecte seu Spotify e desafie seus amigos.</p></div></div>
  <div class="menu" id="join"><div class="icon">🔑</div><div><h3>Entrar em sala</h3><p>Use o código de 6 dígitos do host.</p></div></div>
  <div class="menu" id="solo"><div class="icon">🎵</div><div><h3>Jogar solo</h3><p>10 rodadas para bater seu recorde.</p></div></div>
  <p class="small muted center">Feito para jogar no celular · conectado ao Spotify</p>
</section>

<section class="screen" id="createScreen">
  <div class="top"><span class="back" data-back>← voltar</span></div>
  <span class="eyebrow">NOVA SALA</span><h2>Criar sala</h2>
  <div id="createMsg"></div>
  <button class="btn primary" id="connect">Conectar e ver minhas playlists</button>
  <div id="playlistPick" style="display:none"></div>
  <div id="gameSettings" style="display:none"><label for="rounds">NÚMERO DE RODADAS</label><div class="round-picker"><button type="button" data-rounds="5">5</button><button type="button" class="active" data-rounds="10">10</button><button type="button" data-rounds="15">15</button><button type="button" data-rounds="20">20</button></div></div>
  <button class="btn primary" id="createRoom" style="display:none">Criar sala</button>
  <p class="hint">O login usa o fluxo seguro PKCE. Sua senha e seu Client Secret nunca passam pelo site.</p>
</section>

<section class="screen" id="joinScreen">
  <div class="top"><span class="back" data-back>← voltar</span></div>
  <span class="eyebrow">ENTRAR</span><h2>Código da sala</h2>
  <input id="roomCode" maxlength="6" inputmode="numeric" style="text-align:center;font:900 30px ui-monospace,monospace;letter-spacing:.2em" placeholder="------">
  <div id="joinMsg"></div><button class="btn primary" id="joinRoom">Entrar</button>
</section>

<section class="screen" id="lobby">
  <div class="top"><span class="back" id="leave">← sair</span><span class="muted small">LOBBY</span></div>
  <div class="center"><span class="eyebrow">CÓDIGO</span><div class="code" id="code"></div></div>
  <div id="lobbyPlaylist"></div><label>JOGADORES</label><div class="players" id="players"></div>
  <div class="spacer"></div><div id="hostAction"></div><p class="small muted center">Compartilhe o código com seus amigos.</p>
</section>

<section class="screen countdown" id="countdown"><div class="count" id="count">3</div><div class="count-sub" id="countSub">PREPARE-SE</div></section>

<section class="screen" id="game">
  <div class="roundbar"><span class="eyebrow">RODADA</span><strong id="round"></strong></div>
  <div class="vinyl"><img id="cover" alt=""></div>
  <div class="timer" id="timer">15s</div>
  <div class="options" id="options"></div>
  <div style="margin-top:18px"><label>PLACAR</label><div id="miniRank"></div></div>
</section>

<section class="screen" id="result">
  <div class="result" id="resultBox"></div><label>PLACAR</label><div id="resultRank"></div>
  <div class="spacer"></div><p class="small muted center" id="next"></p>
</section>

<section class="screen" id="podiumScreen">
  <div class="center"><span class="eyebrow">FIM DE JOGO</span><h2>Pódio final</h2></div>
  <div class="podium" id="podium"></div><label>RANKING</label><div id="finalRank"></div>
  <div class="footer"><button class="btn primary" id="again">Jogar novamente</button><button class="btn outline" id="exit">Sair</button></div>
</section>
</div>`;

const $=s=>document.querySelector(s);
const screens=["home","createScreen","joinScreen","lobby","countdown","game","result","podiumScreen"];
function show(id){screens.forEach(x=>$("#"+x).classList.toggle("active",x===id))}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function initials(s){return (s||"?").trim().slice(0,2).toUpperCase()}
let name=localStorage.getItem("spotiguess_name")||"Jogador"+Math.floor(Math.random()*900+100);
$("#name").value=name; $("#avatar").textContent=initials(name);
$("#name").oninput=e=>{name=e.target.value.slice(0,16);$("#avatar").textContent=initials(name);localStorage.setItem("spotiguess_name",name)}

let socket=null, room=null, me=null, selectedPlaylist=null, tokenState=null, countdownTimer=null, roundTimer=null, solo=false, selectedRounds=10;
let soloState=null;
let soloAudio=null;
let soloAudioStopTimer=null;
let soloAudioStartTimer=null;
let playbackNonce=0;
let spotifySDKPromise=null;
let spotifyPlayer=null;
let spotifyDeviceId="";
let spotifyPlayerError="";

const ROUND_MS=15000;
const SOLO_COUNTDOWN_MS=3200;

function msg(el,text,type="error"){el.innerHTML=text?`<div class="${type}">${esc(text)}</div>`:""}

function loadSpotifySDK(){
  if(window.Spotify) return Promise.resolve();
  if(spotifySDKPromise) return spotifySDKPromise;

  spotifySDKPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
    const script=existing||document.createElement("script");
    if(!existing){
      script.src="https://sdk.scdn.co/spotify-player.js";
      script.async=true;
      document.head.appendChild(script);
    }

    const timeout=setTimeout(()=>reject(new Error("Spotify SDK timeout")),10000);
    window.onSpotifyWebPlaybackSDKReady=()=>{clearTimeout(timeout);resolve()};
    script.onerror=()=>{clearTimeout(timeout);reject(new Error("Falha ao carregar Spotify SDK"))};
  });

  return spotifySDKPromise;
}

async function ensureSpotifyPlayer(){
  if(spotifyPlayer && spotifyDeviceId) return true;
  try{
    await loadSpotifySDK();
    await getToken();

    const player=new window.Spotify.Player({
      name:"SahurGuess",
      getOAuthToken:cb=>{getToken().then(t=>cb(t)).catch(()=>cb(""))},
      volume:0.8
    });

    spotifyPlayer=player;
    const readyPromise=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Player não ficou pronto a tempo.")),12000);
      player.addListener("ready",({device_id})=>{
        clearTimeout(timeout);
        spotifyDeviceId=device_id;
        resolve(true);
      });
      player.addListener("not_ready",()=>{spotifyDeviceId=""});
      const fail=message=>{clearTimeout(timeout);reject(new Error(message))};
      player.addListener("initialization_error",({message})=>fail(message||"Não foi possível iniciar o player do Spotify."));
      player.addListener("authentication_error",({message})=>fail(message||"O Spotify recusou a autenticação do player."));
      player.addListener("account_error",()=>fail("A reprodução de músicas completas exige Spotify Premium na conta do host."));
      player.addListener("playback_error",({message})=>console.warn("Spotify playback error:",message));
    });

    const connected=await player.connect();
    if(!connected) return false;
    if(player.activateElement) player.activateElement();
    await readyPromise;
    return true;
  }catch(err){
    spotifyPlayerError=err?.message||"Não foi possível iniciar o player do Spotify.";
    console.warn("Web Playback indisponível:", err?.message||err);
    return false;
  }
}

async function pauseSpotifyPlayback(){
  if(!spotifyDeviceId) return;
  try{
    if(spotifyPlayer){await spotifyPlayer.pause();return}
    await spotifyFetch(`/me/player/pause?device_id=${encodeURIComponent(spotifyDeviceId)}`,{method:"PUT"});
  }catch{}
}

async function playSpotifySnippet(track,nonce){
  if(!track?.uri || (!solo && room?.hostId!==me)) return false;
  const ready=await ensureSpotifyPlayer();
  if(!ready || !spotifyDeviceId) return false;

  try{
    const snippetMs=7000;
    const durationMs=Math.max(1000, Number(track.durationMs)||30000);
    const maxStart=Math.max(0, durationMs-snippetMs);
    const positionMs=Math.floor(Math.random()*(maxStart+1));

    await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({uris:[track.uri],position_ms:positionMs})
    });

    if(nonce!==playbackNonce)return false;
    soloAudioStopTimer=setTimeout(()=>{if(nonce===playbackNonce)pauseSpotifyPlayback()},snippetMs);
    return true;
  }catch(err){
    console.warn("Falha no playback completo, usando preview:", err?.message||err);
    return false;
  }
}

function stopSoloSnippet(){
  playbackNonce++;
  if(soloAudioStartTimer){
    clearTimeout(soloAudioStartTimer);
    soloAudioStartTimer=null;
  }
  if(soloAudioStopTimer){
    clearTimeout(soloAudioStopTimer);
    soloAudioStopTimer=null;
  }
  if(soloAudio){
    soloAudio.pause();
    soloAudio.src="";
    soloAudio=null;
  }
  pauseSpotifyPlayback();
}

async function playSoloSnippet(track){
  if(!track || (!solo && room?.hostId!==me)) return;

  const nonce=++playbackNonce;
  if(soloAudioStartTimer){clearTimeout(soloAudioStartTimer);soloAudioStartTimer=null}
  if(soloAudioStopTimer){clearTimeout(soloAudioStopTimer);soloAudioStopTimer=null}
  if(soloAudio){soloAudio.pause();soloAudio.src="";soloAudio=null}

  const playedFullTrack=await playSpotifySnippet(track,nonce);
  if(playedFullTrack) return;
  if(nonce!==playbackNonce||!track.previewUrl) return;

  const audio=new Audio(track.previewUrl);
  audio.preload="auto";
  audio.addEventListener("loadedmetadata", async ()=>{
    try{
      const snippetMs=7000;
      const maxStart=Math.max(0, (audio.duration||30)-snippetMs/1000);
      const startAt=Math.random()*maxStart;
      audio.currentTime=startAt;
      await audio.play();
      soloAudioStopTimer=setTimeout(()=>{
        if(nonce===playbackNonce&&audio===soloAudio) audio.pause();
      },snippetMs);
    }catch{
      // Browser may block autoplay if the tab lost user activation.
    }
  },{once:true});
  soloAudio=audio;
}

function shuffled(list){
  return [...list].sort(()=>Math.random()-0.5);
}

function resetCreateUI(){
  $("#createRoom").textContent=solo?"Jogar solo":"Criar sala";
  $("#createRoom").style.display="none";
  $("#connect").style.display="block";
  $("#connect").disabled=false;
  $("#connect").innerHTML="Conectar com Spotify";
  $("#playlistPick").style.display="none";
  $("#playlistPick").innerHTML="";
  $("#gameSettings").style.display="none";
  msg($("#createMsg"),"");
}

function buildRoundQuestion(tracks, used){
  let pool=tracks.filter(t=>!used.has(t.id));
  if(!pool.length){
    used.clear();
    pool=tracks.slice();
  }
  const correct=pool[Math.floor(Math.random()*pool.length)];
  used.add(correct.id);

  const wrong=shuffled(tracks.filter(t=>t.id!==correct.id)).slice(0,3);
  const all=shuffled([correct,...wrong]);
  const options=all.map((t,i)=>({id:String(i),label:`${t.name} — ${t.artists}`}));
  const correctId=String(all.findIndex(t=>t.id===correct.id));
  return {correct, options, correctId};
}

function startSoloCountdown(round){
  const at=Date.now()+SOLO_COUNTDOWN_MS;
  runCountdown({at,round,totalRounds:room.totalRounds});
  setTimeout(()=>startSoloRound(round),SOLO_COUNTDOWN_MS+100);
}

function startSoloRound(round){
  if(!solo || !soloState || !room) return;
  const q=buildRoundQuestion(soloState.tracks, soloState.used);
  const startedAt=Date.now()+250;
  const endsAt=startedAt+ROUND_MS;
  room.round=round;
  room.current={round,startedAt,endsAt,options:q.options};
  room.results=null;
  soloState.current={...q,round,startedAt,endsAt};
  soloState.answered=false;
  runRound({round,totalRounds:room.totalRounds,startedAt,endsAt,options:q.options,trackForHost:q.correct});
  const wait=Math.max(0,startedAt-Date.now());
  soloAudioStartTimer=setTimeout(()=>{playSoloSnippet(q.correct)},wait);
}

function finishSoloRound(optionId){
  if(!soloState?.current || soloState.answered) return;
  soloState.answered=true;
  stopSoloSnippet();

  const current=soloState.current;
  const player=room.players[0];
  const correct=optionId===current.correctId;
  let delta=0;
  let newStreak=0;
  if(correct){
    const elapsed=Math.max(0,Math.min(ROUND_MS,Date.now()-current.startedAt));
    const speed=Math.max(0,Math.min(100,Math.round(100*(1-elapsed/ROUND_MS))));
    newStreak=player.streak+1;
    delta=speed;
  }

  player.score+=delta;
  player.streak=correct?newStreak:0;

  const result={id:player.id,name:player.name,correct,delta,score:player.score,streak:player.streak};
  room.results={round:room.round,correctId:current.correctId,track:current.correct,results:[result]};
  showResult(room);

  if(room.round>=room.totalRounds){
    room.finalRanking=[{id:player.id,name:player.name,score:player.score}];
    setTimeout(()=>showPodium(room),1800);
  } else {
    setTimeout(()=>startSoloCountdown(room.round+1),1800);
  }
}

async function startSoloGame(){
  if(!selectedPlaylist){
    msg($("#createMsg"),"Primeiro conecte o Spotify e carregue uma playlist.");
    return;
  }
  if(selectedPlaylist.tracks.length<4){
    msg($("#createMsg"),"A playlist precisa ter pelo menos 4 faixas disponíveis.");
    return;
  }

  msg($("#createMsg"),"Ativando o player do Spotify…","success");
  const playerReady=await ensureSpotifyPlayer();
  if(!playerReady){msg($("#createMsg"),`${spotifyPlayerError} Para tocar qualquer música, use uma conta Spotify Premium e permita a reprodução neste navegador.`);return}
  me="solo-player";
  const soloTracks=selectedPlaylist.tracks;
  const totalRounds=Math.min(selectedRounds, selectedPlaylist.tracks.length);
  room={
    code:"SOLO",
    status:"playing",
    round:0,
    totalRounds,
    playlist:selectedPlaylist,
    hostId:me,
    players:[{id:me,name,score:0,streak:0}],
    current:null,
    results:null,
    finalRanking:[]
  };
  soloState={tracks:soloTracks.slice(0,200),used:new Set(),current:null,answered:false};
  startSoloCountdown(1);
}

function parsePlaylistId(value){
  const m=String(value||"").match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)|spotify:playlist:([A-Za-z0-9]+)/);
  return m?.[1]||m?.[2]||null;
}
function rand(n=32){const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function pkce(){
  const verifier=rand(32);
  const data=new TextEncoder().encode(verifier);
  const digest=await crypto.subtle.digest("SHA-256",data);
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return {verifier,challenge}
}
async function spotifyLogin(){
  if(!CLIENT_ID) throw new Error("Configure VITE_SPOTIFY_CLIENT_ID no .env.");
  const {verifier,challenge}=await pkce();
  const state=rand(16);
  sessionStorage.setItem("sp_pkce_verifier",verifier);
  sessionStorage.setItem("sp_state",state);
  const q=new URLSearchParams({client_id:CLIENT_ID,response_type:"code",redirect_uri:REDIRECT_URI,code_challenge_method:"S256",code_challenge:challenge,state,scope:SCOPES});
  location.href=`https://accounts.spotify.com/authorize?${q}`;
}
async function exchangeCode(code){
  const verifier=sessionStorage.getItem("sp_pkce_verifier");
  const state=sessionStorage.getItem("sp_state");
  if(!verifier||!state) throw new Error("Sessão PKCE não encontrada. Tente conectar novamente.");
  if(new URLSearchParams(location.search).get("state")!==state) throw new Error("Falha de segurança: state inválido.");
  const body=new URLSearchParams({client_id:CLIENT_ID,grant_type:"authorization_code",code,redirect_uri:REDIRECT_URI,code_verifier:verifier});
  const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!r.ok) throw new Error("O Spotify recusou a autorização.");
  const d=await r.json();
  tokenState={access:d.access_token,refresh:d.refresh_token,expiresAt:Date.now()+d.expires_in*1000-60000};
  sessionStorage.setItem("sp_token",JSON.stringify(tokenState));
  history.replaceState({},document.title,location.pathname);
  return tokenState;
}
async function getToken(){
  if(tokenState?.access && Date.now()<tokenState.expiresAt) return tokenState.access;
  const saved=sessionStorage.getItem("sp_token");
  if(saved){tokenState=JSON.parse(saved);if(tokenState.access&&Date.now()<tokenState.expiresAt)return tokenState.access}
  if(tokenState?.refresh){
    const body=new URLSearchParams({client_id:CLIENT_ID,grant_type:"refresh_token",refresh_token:tokenState.refresh});
    const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    if(r.ok){const d=await r.json();tokenState={access:d.access_token,refresh:d.refresh_token||tokenState.refresh,expiresAt:Date.now()+d.expires_in*1000-60000};sessionStorage.setItem("sp_token",JSON.stringify(tokenState));return tokenState.access}
  }
  throw new Error("Spotify não conectado.");
}
async function spotifyFetch(path,opts={}){
  let access=await getToken();
  for(let attempt=0;attempt<3;attempt++){
    const r=await fetch(API+path,{...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${access}`}});
    if(r.status===401){tokenState=null;sessionStorage.removeItem("sp_token");throw new Error("Sua autorização do Spotify expirou. Conecte novamente.")}
    if(r.status===429){const wait=Number(r.headers.get("Retry-After")||2);await new Promise(x=>setTimeout(x,Math.min(wait*1000,8000)));continue}
    if(!r.ok){let e={};try{e=await r.json()}catch{};throw new Error(e?.error?.message||`Spotify respondeu ${r.status}.`)}
    return r.status===204?null:r.json();
  }
  throw new Error("Spotify está limitando as requisições. Tente novamente em alguns segundos.");
}
async function getPlaylist(id){
  const data=await spotifyFetch(`/playlists/${encodeURIComponent(id)}?fields=id,name,images,external_urls`);
  const items=[];
  let url=`/playlists/${encodeURIComponent(id)}/items?limit=50&fields=items(item(id,name,artists(name),album(name,images),uri,preview_url,duration_ms,type,is_local)),next`;
  while(url&&items.length<200){
    const d=await spotifyFetch(url);
    for(const x of d.items||[]){
      const t=x.item;
      if(t?.type==="track"&&!t.is_local&&t.id) items.push({id:t.id,name:t.name,artists:(t.artists||[]).map(a=>a.name).join(", "),album:t.album?.name||"",image:t.album?.images?.[0]?.url||"",uri:t.uri,previewUrl:t.preview_url||"",durationMs:t.duration_ms||0});
    }
    url=d.next?d.next.replace(API,"") : null;
  }
  return {id:data.id,name:data.name,image:data.images?.[0]?.url||"",spotifyUrl:data.external_urls?.spotify||`https://open.spotify.com/playlist/${data.id}`,tracks:items};
}
async function getMyPlaylists(){
  const playlists=[];
  let url="/me/playlists?limit=50";
  while(url&&playlists.length<100){
    const d=await spotifyFetch(url);
    playlists.push(...(d.items||[]).filter(Boolean).map(p=>({id:p.id,name:p.name,image:p.images?.[0]?.url||"",count:p.tracks?.total||0,owner:p.owner?.display_name||""})));
    url=d.next?d.next.replace(API,""):null;
  }
  return playlists;
}
function renderPlaylists(playlists){
  $("#playlistPick").style.display="block";
  $("#playlistPick").innerHTML=`<label>ESCOLHA UMA PLAYLIST</label><div class="playlist-grid">${playlists.map(p=>`<button class="playlist-choice" data-playlist="${esc(p.id)}">${p.image?`<img src="${esc(p.image)}" alt="">`:`<span class="playlist-fallback">♪</span>`}<span><b>${esc(p.name)}</b><small>${p.count} músicas</small></span></button>`).join("")}</div>`;
  document.querySelectorAll(".playlist-choice").forEach(button=>button.onclick=async()=>{
    document.querySelectorAll(".playlist-choice").forEach(x=>x.classList.toggle("selected",x===button));
    msg($("#createMsg"),"Carregando músicas…","success");
    try{
      selectedPlaylist=await getPlaylist(button.dataset.playlist);
      if(selectedPlaylist.tracks.length<4)throw new Error("Essa playlist precisa ter pelo menos 4 músicas disponíveis.");
      msg($("#createMsg"),`${selectedPlaylist.name}: ${selectedPlaylist.tracks.length} músicas prontas.`,"success");
      $("#gameSettings").style.display="block";$("#createRoom").style.display="block";
    }catch(e){selectedPlaylist=null;msg($("#createMsg"),e.message)}
  });
}

function connectSocket(){
  if(socket?.connected)return;
  socket=io(SERVER_URL,{transports:["websocket","polling"]});
  socket.on("room:update",r=>{room=r;renderLobby()});
  socket.on("room:countdown",d=>runCountdown(d));
  socket.on("room:round",d=>runRound(d));
  socket.on("room:host-track",d=>{if(!solo&&room?.hostId===me&&d.track){const wait=Math.max(0,d.startedAt-Date.now());soloAudioStartTimer=setTimeout(()=>playSoloSnippet(d.track),wait)}});
  socket.on("room:result",r=>{room=r;showResult(r)});
  socket.on("room:finished",r=>{room=r;showPodium(r)});
  socket.on("room:closed",d=>{alert(d.message);location.reload()});
}
function renderLobby(){
  if(!room)return;
  $("#code").textContent=room.code;
  $("#lobbyPlaylist").innerHTML=`<div class="playlist">${room.playlist.image?`<img src="${esc(room.playlist.image)}">`:""}<div><b>${esc(room.playlist.name)}</b><br><small>${room.players.length} jogadores · ${room.totalRounds} rodadas</small></div></div>`;
  $("#players").innerHTML=room.players.map(p=>`<div class="player"><div class="avatar">${esc(initials(p.name))}</div><div class="name">${esc(p.name)}${p.id===me?" <span class='muted'>(você)</span>":""}</div>${p.id===room.hostId?`<span class="tag">HOST</span>`:""}</div>`).join("");
  $("#hostAction").innerHTML=room.hostId===me?`<button class="btn primary" id="start">Iniciar jogo</button>`:`<p class="small muted center">Aguardando o host iniciar…</p>`;
  $("#start")?.addEventListener("click",()=>socket.emit("room:start",{code:room.code},res=>{if(!res?.ok)alert(res?.error||"Erro")}));
}
function runCountdown(d){
  show("countdown");
  const tick=()=>{
    const left=d.at-Date.now();
    const n=Math.ceil(left/1000);
    $("#count").textContent=n>0?n:"GO!";
    $("#countSub").textContent=`RODADA ${d.round} DE ${d.totalRounds}`;
    if(left<=0)clearInterval(countdownTimer);
  };
  clearInterval(countdownTimer);tick();countdownTimer=setInterval(tick,80);
}
function runRound(d){
  show("game");
  $("#round").textContent=`${d.round} / ${d.totalRounds}`;
  const cover=d.trackForHost?.image||room?.results?.track?.image||"";
  if(solo){
    $("#cover").style.display="none";
  }else{
    $("#cover").style.display="block";
    $("#cover").src=cover;
    $("#cover").alt=cover?"Capa da rodada":"";
  }
  $("#options").innerHTML=d.options.map((o,i)=>`<button class="option" data-id="${o.id}"><span class="letter">${"ABCD"[i]}</span><span>${esc(o.label)}</span></button>`).join("");
  $("#options").querySelectorAll(".option").forEach(b=>b.onclick=()=>answer(d,b));
  clearInterval(roundTimer);
  const tick=()=>{
    const left=Math.max(0,d.endsAt-Date.now());
    $("#timer").textContent=`${Math.ceil(left/1000)}s`;
    if(left<=0){
      clearInterval(roundTimer);
      $("#options").querySelectorAll("button").forEach(b=>b.disabled=true);
      if(solo) finishSoloRound(null);
    }
  };
  tick();roundTimer=setInterval(tick,100);
  renderMiniRank();
}
function answer(d,b){
  if(b.disabled)return;
  $("#options").querySelectorAll("button").forEach(x=>x.disabled=true);
  b.classList.add("selected");
  if(solo){
    finishSoloRound(b.dataset.id);
    return;
  }
  socket.emit("answer",{code:room.code,round:d.round,optionId:b.dataset.id},res=>{if(!res?.ok)alert(res?.error||"Resposta não enviada")});
}
function renderMiniRank(){
  const ps=(room?.players||[]).slice().sort((a,b)=>b.score-a.score);
  $("#miniRank").innerHTML=ps.map((p,i)=>`<div class="rank ${p.id===me?"me":""}"><span>${i+1}</span><div class="avatar">${esc(initials(p.name))}</div><div>${esc(p.name)} ${p.streak>1?`<span class="streak">🔥x${p.streak}</span>`:""}</div><span class="score">${p.score}</span></div>`).join("");
}
function showResult(r){
  clearInterval(roundTimer);show("result");
  const resultsList=r.results?.results||[];
  const meR=resultsList.find(x=>x.id===me);
  $("#resultBox").innerHTML=`<div class="verdict">${meR?.correct?"Acertou! 🎯":"Errou 💔"}</div><div class="delta">${meR?`+${meR.delta} pontos${meR.streak>1?` · 🔥 sequência x${meR.streak}`:""}`:"Sem resposta"}</div><div class="track"><b>${esc(r.results?.track?.name||"")}</b><br>${esc(r.results?.track?.artists||"")}</div>`;
  $("#resultRank").innerHTML=resultsList.map((p,i)=>`<div class="rank ${p.id===me?"me":""}"><span>#${i+1}</span><div class="avatar">${esc(initials(p.name))}</div><div>${esc(p.name)} ${p.streak>1?`<span class="streak">🔥x${p.streak}</span>`:""}</div><span class="score">${p.score}</span></div>`).join("");
  $("#next").textContent=r.round<r.totalRounds?"Próxima rodada em instantes…":"Calculando pódio…";
}
function showPodium(r){
  show("podiumScreen");
  const ranking=(r.finalRanking||[]).slice();
  const order=[1,0,2].filter(i=>ranking[i]);
  $("#podium").innerHTML=order.map(i=>`<div class="pod ${i===0?"first":i===1?"second":"third"}"><div class="avatar" style="margin:auto">${esc(initials(ranking[i].name))}</div><div class="who">${esc(ranking[i].name)}</div><div class="pts">${ranking[i].score} pts</div><div class="bar">${i+1}</div></div>`).join("");
  $("#finalRank").innerHTML=ranking.map((p,i)=>`<div class="rank ${p.id===me?"me":""}"><span>#${i+1}</span><div class="avatar">${esc(initials(p.name))}</div><div>${esc(p.name)}</div><span class="score">${p.score}</span></div>`).join("");
  $("#again").style.display=room?.hostId===me?"block":"none";
}
async function createWithPlaylist(){
  msg($("#createMsg"),"Ativando o player do host…","success");
  const playerReady=await ensureSpotifyPlayer();
  if(!playerReady){msg($("#createMsg"),`${spotifyPlayerError} O host precisa usar Spotify Premium para tocar trechos aleatórios de todas as músicas.`);return}
  connectSocket();
  const p=selectedPlaylist;
  socket.emit("room:create",{name,playlist:p,tracks:p.tracks,totalRounds:selectedRounds},res=>{
    if(!res?.ok){msg($("#createMsg"),res?.error||"Não foi possível criar.");return}
    room=res.room;me=res.playerId;show("lobby");renderLobby();
  });
}

$("#create").onclick=()=>{solo=false;resetCreateUI();show("createScreen")};
$("#join").onclick=()=>{solo=false;show("joinScreen")};
$("#solo").onclick=()=>{solo=true;resetCreateUI();show("createScreen")};
document.querySelectorAll("[data-back]").forEach(x=>x.onclick=()=>{stopSoloSnippet();solo=false;show("home")});
$("#connect").onclick=async()=>{
  msg($("#createMsg"),"");
  try{
    if(!sessionStorage.getItem("sp_token")){await spotifyLogin();return}
    $("#connect").disabled=true;$("#connect").innerHTML=`<span class="spinner"></span> buscando playlists`;
    renderPlaylists(await getMyPlaylists());
    $("#createRoom").textContent=solo?"Jogar solo":"Criar sala";$("#connect").style.display="none";
  }catch(e){msg($("#createMsg"),e.message)}
  finally{$("#connect").disabled=false}
};
document.querySelectorAll("[data-rounds]").forEach(button=>button.onclick=()=>{selectedRounds=Number(button.dataset.rounds);document.querySelectorAll("[data-rounds]").forEach(x=>x.classList.toggle("active",x===button))});
$("#createRoom").onclick=()=>{
  if(!selectedPlaylist){
    msg($("#createMsg"),"Carregue a playlist antes de continuar.");
    return;
  }
  if(solo){
    startSoloGame();
    return;
  }
  createWithPlaylist();
};
$("#roomCode").oninput=e=>e.target.value=e.target.value.replace(/\D/g,"").slice(0,6);
$("#joinRoom").onclick=()=>{
  msg($("#joinMsg"),"");connectSocket();
  socket.emit("room:join",{code:$("#roomCode").value,name},res=>{
    if(!res?.ok){msg($("#joinMsg"),res?.error||"Não foi possível entrar.");return}
    room=res.room;me=res.playerId;show("lobby");renderLobby();
  });
};
$("#leave").onclick=()=>{stopSoloSnippet();if(room)socket?.emit("room:leave",{code:room.code});location.reload()};
$("#exit").onclick=()=>location.reload();
$("#again").onclick=()=>{if(solo){room.players[0].score=0;room.players[0].streak=0;soloState.used.clear();startSoloCountdown(1);return}socket.emit("room:restart",{code:room.code},res=>{if(!res?.ok)alert(res?.error||"Não foi possível reiniciar.")})};

if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name:"open_join_room",title:"Abrir entrada de sala",description:"Abre a tela de entrada do SahurGuess e preenche um código de sala de 6 números.",
    inputSchema:{type:"object",properties:{code:{type:"string",pattern:"^[0-9]{6}$"}},required:["code"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const code=String(input?.code||"");if(!/^\d{6}$/.test(code))throw new Error("O código precisa ter 6 números.");$("#roomCode").value=code;show("joinScreen");return {screen:"join",code}}
  },{signal:lifecycle.signal})).catch(()=>{});
}

(async()=>{
  const params=new URLSearchParams(location.search);
  const joinCode=params.get("room");
  const authCode=params.get("code");
  if(authCode && sessionStorage.getItem("sp_pkce_verifier")){
    try{await exchangeCode(authCode)}catch(e){console.error(e)}
  }
  if(joinCode){$("#roomCode").value=joinCode;show("joinScreen")}
})();
