const debug = require('debug');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const info = debug('app:server:info');
const warn = debug('app:server:warn');

const app = express();
app.use(express.static('public'));

const port = 3000;
const server = http.createServer(app);

const sockets = new Map();
const cameras = new Set();
const screens = new Set();
const setByType = {
  camera: cameras,
  screen: screens,
};

server.listen(
  port,
  () => info(`listening on port ${port}`)
);

const wsServer = new WebSocket.Server({ server });

wsServer.on('connection', (socket) => {
  let peerId;

  const onMessage = (e) => {
    const msg = JSON.parse(e);

    if (msg.type === 'register') {
      peerId = msg.peerId;
      const { peerType } = msg;

      info(`${peerType} registered, id: ${peerId}`);

      setByType[peerType].add(peerId);
      sockets.set(peerId, socket);

      if (peerType === 'camera') {
        socket.send(JSON.stringify({
          type: 'screens',
          screens: Array.from(screens),
        }));
      }

      if (peerType === 'screen') {
        for (let cameraId of cameras) {
          const cameraSocket = sockets.get(cameraId);
          cameraSocket.send(JSON.stringify({
            type: 'screens',
            screens: [ peerId ],
          }));
        }
      }
    }

    if (msg.type === 'offer') {
      info(`camera ${msg.from} sent offer to screen ${msg.to}`);
      if (!screens.has(msg.to)) {
        warn(`offer sent to screen ${msg.to} that's not registered`);
        return;
      }

      const socket = sockets.get(msg.to);
      socket.send(e);
    }

    if (msg.type === 'answer') {
      info(`screen ${msg.from} sent answer to camera ${msg.to}`);
      if (!cameras.has(msg.to)) {
        warn(`offer sent to camera ${msg.to} that's not registered`);
        return;
      }

      const socket = sockets.get(msg.to);
      socket.send(e);
    }

    if (msg.type === 'candidate') {
      info(`ice candidate from ${msg.from} to ${msg.to}`);
      const socketTo = sockets.get(msg.to);

      if (!socketTo) {
        warn(`candidate sent to ${msg.to}, that's not registered`);
        return;
      }

      socketTo.send(e);
    }
  };


  const onClose = () => {
    info(`socket closed ${peerId}`);

    let sendDisconnectTo;
    if (screens.has(peerId)) {
      sendDisconnectTo = cameras;
    }

    if (cameras.has(peerId)) {
      sendDisconnectTo = screens;
    }

    for (let targetId of sendDisconnectTo) {
      sockets.get(targetId).send(JSON.stringify({
        type: 'disconnect',
        from: peerId
      }));
    }

    socket.off('message', onMessage);
    socket.off('close', onClose);

    cameras.delete(peerId);
    screens.delete(peerId);
    sockets.delete(peerId);
  };

  socket.on('message', onMessage);
  socket.on('close', onClose);
});
