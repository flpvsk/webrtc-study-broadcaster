(async function() {
  window.play.addEventListener('click', () => {
    try {
      console.log('here');
      window.v.play();
      window.controls.classList.add('hidden');
    } catch (e) {
      console.error(e);
    }
  });

  const getRandomId = () => {
    return Math.floor(Math.random() * 10000);
  };

  const peerId = getRandomId();
  const peerType = 'screen';
  const connections = new Map();

  let ws;
  const getSocket = async (peerId, peerType) => {
    if (ws) return ws;

    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(`wss://${window.location.host}`);

        const onOpen = () => {
          ws.send(JSON.stringify({
            type: 'register',
            peerType,
            peerId,
          }));

          ws.removeEventListener('open', onOpen);
          resolve(ws);
        };

        ws.addEventListener('open', onOpen);
      } catch (e) {
        reject(e);
      }
    });
  };

  try {
    console.log('in screen');
    const socket = await getSocket(peerId, peerType);
    socket.addEventListener('message', async (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('msg', msg);

        if (msg.type === 'offer') {
          const peerConnection = new RTCPeerConnection();
          connections.set(msg.from, peerConnection);

          peerConnection.ontrack = (e) => {
            console.log('on track', e);
            window.v.srcObject = e.streams[0];
            window.wait.classList.add('hidden');
            window.controls.classList.remove('hidden');
          };

          await peerConnection.setRemoteDescription(msg.data);
          const sdp = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(sdp);

          console.log('sending answer');
          socket.send(JSON.stringify({
            to: msg.from,
            from: peerId,
            type: 'answer',
            data: peerConnection.localDescription
          }));
        }

        if (msg.type === 'disconnect') {
          const connection = connections.get(msg.from);
          if (connection) {
            console.log('Disconnecting from', msg.from);
            connection.close();
            connections.delete(msg.from);
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

  } catch (e) {
    console.error(e);
  }
})();

