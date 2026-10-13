import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: process.env.NODE_ENV === 'production' ? false : true } });
const rooms = new Map();
const MAX_PLAYERS = 8;
const resources = [
  ...Array.from({length:18},(_,i)=>({id:`wood${i}`,type:'wood',x:Math.sin(i*2.4)* (12+i%4*5),z:Math.cos(i*2.4)*(12+i%4*5)})),
  ...Array.from({length:14},(_,i)=>({id:`stone${i}`,type:'stone',x:Math.sin(i*3.1)*(9+i%5*5),z:Math.cos(i*3.1)*(9+i%5*5)})),
  ...Array.from({length:12},(_,i)=>({id:`food${i}`,type:'food',x:Math.sin(i*2.7)*(7+i%5*5),z:Math.cos(i*2.7)*(7+i%5*5)}))
];
const sanitize = (s,n=20)=>String(s??'').replace(/[<>]/g,'').trim().slice(0,n);
const getRoom = (code)=>rooms.get(code);
function publicPlayers(room){return [...room.players.entries()].map(([id,p])=>({id,...p}));}
function leave(socket){const code=socket.data.room; if(!code)return; const room=getRoom(code); if(room){room.players.delete(socket.id);io.to(code).emit('playerLeft',socket.id);if(!room.players.size)rooms.delete(code);} socket.leave(code);socket.data.room=null;}
io.on('connection',socket=>{
  socket.on('joinRoom',(data,reply)=>{
    const code=sanitize(data?.code,8).toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(code.length<4)return reply?.({ok:false,error:'รหัสห้องต้องมีอย่างน้อย 4 ตัว'});
    leave(socket);
    let room=getRoom(code);
    if(!room){room={players:new Map(),collected:new Set()};rooms.set(code,room);}
    if(room.players.size>=MAX_PLAYERS)return reply?.({ok:false,error:'ห้องเต็มแล้ว (8 คน)'});
    const player={name:sanitize(data?.name,16)||'Survivor',x:0,y:0,z:0,rotation:0,walking:false,inventory:{wood:0,stone:0,food:0}};
    room.players.set(socket.id,player);socket.join(code);socket.data.room=code;
    reply?.({ok:true,id:socket.id,code,players:publicPlayers(room),resources:resources.filter(r=>!room.collected.has(r.id))});
    socket.to(code).emit('playerJoined',{id:socket.id,...player});
    io.to(code).emit('roomCount',room.players.size);
  });
  socket.on('move',data=>{
    const code=socket.data.room,room=getRoom(code),p=room?.players.get(socket.id);if(!p)return;
    const x=Number(data?.x),z=Number(data?.z),rotation=Number(data?.rotation);
    if(![x,z,rotation].every(Number.isFinite))return;
    const distance=Math.hypot(x-p.x,z-p.z);
    if(distance>3.5 || Math.hypot(x,z)>52)return;
    Object.assign(p,{x,z,rotation,walking:!!data.walking});socket.to(code).emit('playerMoved',{id:socket.id,x,z,rotation,walking:p.walking});
  });
  socket.on('collect',(id,reply)=>{
    const room=getRoom(socket.data.room),p=room?.players.get(socket.id),r=resources.find(x=>x.id===id);
    if(!room||!p||!r||room.collected.has(id)||Math.hypot(p.x-r.x,p.z-r.z)>4.5)return reply?.({ok:false});
    room.collected.add(id);p.inventory[r.type]++;io.to(socket.data.room).emit('resourceCollected',{id,by:socket.id,type:r.type});reply?.({ok:true,inventory:p.inventory});
  });
  socket.on('disconnect',()=>leave(socket));
});
const dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(dirname,'../dist')));
app.get('/health',(_req,res)=>res.json({ok:true,rooms:rooms.size}));
app.get('*',(_req,res)=>res.sendFile(path.join(dirname,'../dist/index.html')));
const PORT=process.env.PORT||3000;http.listen(PORT,'0.0.0.0',()=>console.log(`LOST ISLAND server on ${PORT}`));
