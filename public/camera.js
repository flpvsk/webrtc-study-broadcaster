(async function() {
  const config = {
    iceServers: [{
      urls: ['stun:stun.l.google.com:19302']
    }]
  };

  const getRandomId = () => {
    return Math.floor(Math.random() * 10000);
  };

  const peerId = getRandomId();
  const peerType = 'camera';
  const connections = new Map();

  let ws;
  const getSocket = async (peerId, peerType) => {
    if (ws) return ws;

    return new Promise((resolve, reject) => {
      try {
        const protocol = (
          window.location.protocol === 'https:' ?
            'wss:' :
            'ws:'
        );
        ws = new WebSocket(`${protocol}//${window.location.host}`);

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
    console.log('in camera');

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    window.v.srcObject = mediaStream;

    const socket = await getSocket(peerId, peerType);
    socket.addEventListener('message', async (e) => {
      const msg = JSON.parse(e.data);
      console.log('msg', msg);

      if (msg.type === 'screens') {
        for (let screen of msg.screens) {
          const peerConnection = new RTCPeerConnection(config);
          connections.set(screen, peerConnection);

          peerConnection.addStream(window.v.srcObject);

          const sdp = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(sdp);

          peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
              socket.send(JSON.stringify({
                type: 'candidate',
                from: peerId,
                to: screen,
                data: e.candidate,
              }));
            }
          };

          socket.send(JSON.stringify({
            type: 'offer',
            to: screen,
            from: peerId,
            data: peerConnection.localDescription,
          }));
        }
      }

      if (msg.type === 'answer') {
        const peerConnection = connections.get(msg.from);
        peerConnection.setRemoteDescription(msg.data);
      }

      if (msg.type === 'disconnect') {
        const connection = connections.get(msg.from);
        if (connection) {
          console.log('Disconnecting from', msg.from);
          connection.close();
          connections.delete(msg.from);
        }
      }

      if (msg.type === 'candidate') {
        const connection = connections.get(msg.from);
        if (connection) {
          console.log('Adding candidate to', msg.from);
          connection.addIceCandidate(new RTCIceCandidate(
            msg.data
          ));
        }
      }
    });

  } catch (e) {
    console.error(e);
  }
})();
