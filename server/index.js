import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);
const allowedOrigins=String(process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
const allowOrigin=(origin,cb)=>cb(null,!origin||!allowedOrigins.length||allowedOrigins.includes(origin));
const io = new Server(server, { cors: { origin: allowOrigin, credentials: true } });

app.use(cors({ origin: allowOrigin, credentials:true }));
app.use(express.json());

const PORT = Number(process.env.PORT || 5020);
const rooms = new Map();
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

function code() {
  let c;
  do c = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  while (rooms.has(c));
  return c;
}
function cleanRoom(room) {
  if (Date.now() - room.updatedAt > ROOM_TTL_MS) rooms.delete(room.code);
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    totalRounds: room.totalRounds,
    playlist: room.playlist,
    hostId: room.hostId,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, streak: p.streak
    })),
    current: room.current ? {
      round: room.current.round,
      startedAt: room.current.startedAt,
      endsAt: room.current.endsAt,
      options: room.current.options
    } : null,
    results: room.results,
    finalRanking: room.finalRanking || []
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

io.on("connection", socket => {
  socket.on("room:create", (payload, cb) => {
    const name = String(payload?.name || "Jogador").trim().slice(0, 16) || "Jogador";
    const playlist = payload?.playlist;
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    if (!playlist?.id || tracks.length < 4) return cb?.({ ok:false, error:"Playlist inválida ou com menos de 4 músicas." });

    const c = code();
    const id = socket.id;
    const room = {
      code: c, hostId: id, status:"lobby", round:0, totalRounds: Math.max(1,Math.min(Number(payload?.totalRounds)||10,20,tracks.length)),
      playlist: {
        id: playlist.id,
        name: String(playlist.name || "Playlist").slice(0, 100),
        image: playlist.image || "",
        spotifyUrl: playlist.spotifyUrl || ""
      },
      // Immediate-use room state only. No Spotify token is ever sent to the server.
      tracks: tracks.slice(0, 200).map(t => ({
        id:t.id, name:t.name, artists:t.artists, album:t.album || "", image:t.image || "", uri:t.uri
      })),
      players:new Map([[id,{id,name,score:0,streak:0}]]),
      answers:new Map(), current:null, results:null, updatedAt:Date.now()
    };
    rooms.set(c, room);
    socket.join(c);
    cb?.({ok:true, room:publicRoom(room), playerId:id});
    io.to(c).emit("room:update", publicRoom(room));
  });

  socket.on("room:join", (payload, cb) => {
    const c = String(payload?.code || "").replace(/\D/g,"").slice(0,6);
    const room = rooms.get(c);
    if (!room) return cb?.({ok:false,error:"Sala não encontrada."});
    if (room.status !== "lobby") return cb?.({ok:false,error:"Essa sala já começou."});
    const name = String(payload?.name || "Jogador").trim().slice(0,16) || "Jogador";
    const id = socket.id;
    room.players.set(id,{id,name,score:0,streak:0});
    room.updatedAt=Date.now();
    socket.join(c);
    cb?.({ok:true,room:publicRoom(room),playerId:id});
    io.to(c).emit("room:update",publicRoom(room));
  });

  socket.on("room:start", (payload, cb) => {
    const room = rooms.get(payload?.code);
    if (!room || room.hostId !== socket.id) return cb?.({ok:false,error:"Somente o host pode iniciar."});
    if (room.players.size < 1) return cb?.({ok:false,error:"Nenhum jogador na sala."});
    room.status="countdown";
    room.round=0;
    room.results=null;
    room.updatedAt=Date.now();
    const countdownAt=Date.now()+3200;
    room.countdownAt=countdownAt;
    cb?.({ok:true});
    io.to(room.code).emit("room:countdown",{at:countdownAt,round:1,totalRounds:room.totalRounds});
    setTimeout(()=>startRound(room.code),3300);
  });

  socket.on("room:restart", (payload, cb) => {
    const room=rooms.get(payload?.code);
    if(!room || room.hostId!==socket.id) return cb?.({ok:false,error:"Somente o host pode reiniciar."});
    for(const player of room.players.values()){player.score=0;player.streak=0}
    room.status="lobby";room.round=0;room.used=new Set();room.answers=new Map();room.current=null;room.results=null;room.finalRanking=[];room.updatedAt=Date.now();
    cb?.({ok:true});io.to(room.code).emit("room:update",publicRoom(room));
  });

  socket.on("answer", (payload, cb) => {
    const room=rooms.get(payload?.code);
    if(!room || room.status!=="playing" || !room.current) return cb?.({ok:false,error:"Rodada não está disponível."});
    if(room.current.round !== Number(payload?.round)) return cb?.({ok:false,error:"Rodada expirada."});
    if(room.answers.has(socket.id)) return cb?.({ok:false,error:"Resposta já enviada."});
    const at=Date.now();
    const answerId=String(payload?.optionId || "");
    const correctId=room.current.correctId;
    const correct=answerId===correctId;
    room.answers.set(socket.id,{optionId:answerId,at,correct});
    cb?.({ok:true});
  });

  socket.on("room:leave", payload => {
    const room=rooms.get(payload?.code);
    if (!room) return;
    leaveRoom(socket, room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (room.players.has(socket.id)) leaveRoom(socket,room);
    }
  });
});

function leaveRoom(socket, room) {
  room.players.delete(socket.id);
  if (room.hostId === socket.id) {
    room.status="finished";
    room.results=null;
    io.to(room.code).emit("room:closed",{message:"O host saiu da sala."});
    rooms.delete(room.code);
    return;
  }
  room.updatedAt=Date.now();
  io.to(room.code).emit("room:update",publicRoom(room));
}

function startRound(c) {
  const room=rooms.get(c);
  if(!room || room.status==="finished") return;
  room.round++;
  room.status="playing";
  room.answers=new Map();

  const used=room.used || new Set();
  let pool=room.tracks.filter(t=>!used.has(t.id));
  if(!pool.length){ room.used=new Set(); pool=room.tracks.slice(); }
  const correct=pool[crypto.randomInt(pool.length)];
  used.add(correct.id); room.used=used;

  const wrongPool=room.tracks.filter(t=>t.id!==correct.id);
  const shuffled=wrongPool.sort(()=>Math.random()-0.5).slice(0,3);
  const opts=[correct,...shuffled].sort(()=>Math.random()-0.5);
  const options=opts.map((t,i)=>({id:String(i),label:`${t.name} — ${t.artists}`}));
  const correctId=String(options.findIndex(o=>o.label===`${correct.name} — ${correct.artists}`));

  const startedAt=Date.now()+250;
  const endsAt=startedAt+15000;
  room.current={round:room.round,startedAt,endsAt,correctId,options,answerTrack:correct};
  room.results=null;
  room.updatedAt=Date.now();
  io.to(c).emit("room:round",{round:room.round,totalRounds:room.totalRounds,startedAt,endsAt,options});
  io.to(room.hostId).emit("room:host-track",{round:room.round,startedAt,track:correct});
  setTimeout(()=>endRound(c,room.round),15300);
}

function endRound(c,round) {
  const room=rooms.get(c);
  if(!room || room.status!=="playing" || room.round!==round) return;
  const current=room.current;
  const results=[];
  for(const p of room.players.values()){
    const a=room.answers.get(p.id);
    let delta=0;
    let correct=false;
    let newStreak=0;
    if(a){
      correct=a.correct;
      if(correct){
        const elapsed=Math.max(0,Math.min(15000,a.at-current.startedAt));
        const speed=Math.max(0,Math.min(100,Math.round(100*(1-elapsed/15000))));
        newStreak=p.streak+1;
        delta=speed;
      }
    }
    p.score+=delta;
    p.streak=correct?newStreak:0;
    results.push({id:p.id,name:p.name,correct,delta,score:p.score,streak:p.streak});
  }
  results.sort((a,b)=>b.score-a.score || b.delta-a.delta);
  room.results={round,correctId:current.correctId,track:current.answerTrack,results};
  room.status="round_result";
  room.updatedAt=Date.now();
  io.to(c).emit("room:result",publicRoom(room));

  setTimeout(()=>{
    const r=rooms.get(c);
    if(!r || r.round!==round) return;
    if(round>=r.totalRounds){
      r.status="finished";
      r.finalRanking=[...r.players.values()].sort((a,b)=>b.score-a.score).map(p=>({id:p.id,name:p.name,score:p.score}));
      io.to(c).emit("room:finished",publicRoom(r));
    } else {
      r.status="countdown";
      const at=Date.now()+3200;
      r.countdownAt=at;
      io.to(c).emit("room:countdown",{at,round:round+1,totalRounds:r.totalRounds});
      setTimeout(()=>startRound(c),3300);
    }
  },4300);
}

setInterval(()=>{
  for(const room of rooms.values()) cleanRoom(room);
},60_000);

server.listen(PORT,()=>console.log(`SahurGuess server on http://127.0.0.1:${PORT}`));
