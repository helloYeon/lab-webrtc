/** @format */

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const socket = new WebSocket("ws://localhost:8765");
const peer = new RTCPeerConnection();

navigator.mediaDevices
  .getUserMedia({ video: true, audio: false })
  .then((stream) => {
    localVideo.srcObject = stream;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
  });

peer.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

peer.onicecandidate = (event) => {
  if (event.candidate) {
    socket.send(
      JSON.stringify({ type: "candidate", candidate: event.candidate })
    );
  }
};

socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer") {
    await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === "candidate") {
    try {
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Error adding received ice candidate", e);
    }
  }
};

socket.onopen = async () => {
  // 自分が先に開いた場合にoffer送信
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", offer }));
};
