/** @format */

const socket = io();

document.addEventListener("DOMContentLoaded", () => {
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");

  let device;
  let localStream;

  socket.on("connect", () => {
    console.log("Connected to SFU signaling server");

    // Step 1: Get RTP Capabilities from server
    socket.emit("getRouterRtpCapabilities", async (rtpCapabilities) => {
      console.log("Router RTP Capabilities:", rtpCapabilities);

      try {
        // Step 2: Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        localVideo.srcObject = localStream;
        await localVideo.play();
        console.log("Local video stream started");
      } catch (err) {
        console.error("Failed to access camera:", err);
        return;
      }

      // Step 3: Initialize Device
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log("Device loaded with router RTP capabilities");

      // Step 4: Request SFU to create sendTransport
      socket.emit("createWebRtcTransport", (response) => {
        if (response.error) {
          console.error("Failed to create transport:", response.error);
          return;
        }

        const params = response.params;
        const sendTransport = device.createSendTransport(params);

        sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
          socket.emit("connectTransport", {
            transportId: sendTransport.id,
            dtlsParameters,
          });
          callback();
        });

        sendTransport.on(
          "produce",
          ({ kind, rtpParameters }, callback, errback) => {
            socket.emit(
              "produce",
              {
                transportId: sendTransport.id,
                kind,
                rtpParameters,
              },
              ({ id }) => {
                callback({ id });
              }
            );
          }
        );

        // Step 5: Produce local camera video
        const videoTrack = localStream.getVideoTracks()[0];
        sendTransport
          .produce({ track: videoTrack })
          .then(async (producer) => {
            console.log("Producer created:", producer.id);

            // Step 8: Consume remote stream
            socket.emit(
              "consume",
              { rtpCapabilities: device.rtpCapabilities },
              async (response) => {
                if (response.error) {
                  console.error("Failed to consume:", response.error);
                  return;
                }

                const { params } = response;

                const recvTransport = device.createRecvTransport({
                  id: params.id,
                  iceParameters: params.iceParameters,
                  iceCandidates: params.iceCandidates,
                  dtlsParameters: params.rtpParameters.dtlsParameters,
                });

                recvTransport.on(
                  "connect",
                  ({ dtlsParameters }, callback, errback) => {
                    socket.emit("connectTransport", {
                      transportId: recvTransport.id,
                      dtlsParameters,
                    });
                    callback();
                  }
                );

                const consumer = await recvTransport.consume({
                  id: params.id,
                  producerId: params.producerId,
                  kind: params.kind,
                  rtpParameters: params.rtpParameters,
                });

                const remoteStream = new MediaStream([consumer.track]);
                remoteVideo.srcObject = remoteStream;
                await remoteVideo.play();
                console.log("Remote video stream started");
              }
            );
          })
          .catch((err) => console.error("Produce error:", err));
      });
    });
  });
});
