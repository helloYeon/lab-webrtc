/** @format */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const mediasoupConfig = require("./mediasoup-config");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let worker;
let router;

(async () => {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: mediasoupConfig.mediaCodecs,
  });
  console.log("Mediasoup worker and router initialized");
})();

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });

  socket.on("getRouterRtpCapabilities", (cb) => {
    cb(router.rtpCapabilities);
  });

  // 👇 追加ここから
  const transportOptions = {
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  };

  socket.on("createWebRtcTransport", async (callback) => {
    try {
      const transport = await router.createWebRtcTransport(transportOptions);
      console.log(`Created WebRtcTransport id=${transport.id}`);

      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });

      socket.transport = transport;
    } catch (err) {
      console.error("Failed to create WebRtcTransport:", err);
      callback({ error: err.message });
    }
  });

  // Step 6: Handle connectTransport for both send and receive transports
  socket.on("connectTransport", async ({ transportId, dtlsParameters }) => {
    let transport =
      socket.transport?.id === transportId
        ? socket.transport
        : socket.consumerTransport?.id === transportId
        ? socket.consumerTransport
        : null;

    if (!transport) {
      console.error("Transport not found or mismatched");
      return;
    }

    try {
      await transport.connect({ dtlsParameters });
      console.log(`Transport ${transportId} connected`);
    } catch (err) {
      console.error("Failed to connect transport:", err);
    }
  });

  socket.on(
    "produce",
    async ({ transportId, kind, rtpParameters }, callback) => {
      const transport = socket.transport;
      if (!transport || transport.id !== transportId) {
        console.error("Invalid transport ID for produce");
        callback({ error: "Invalid transport" });
        return;
      }

      const producer = await transport.produce({ kind, rtpParameters });
      console.log(`Producer created with id: ${producer.id}`);
      callback({ id: producer.id });

      // Optional: Store producer on socket for future consume
      socket.producer = producer;
    }
  );

  // Step 7: Handle consume event
  socket.on("consume", async ({ rtpCapabilities }, callback) => {
    try {
      // Find a producer from other sockets (or this socket if only one)
      const producer = [...io.sockets.sockets.values()]
        .map((s) => s.producer)
        .find((p) => p);

      if (!producer) {
        console.warn("No producer found");
        return callback({ error: "No producer" });
      }

      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.error("Cannot consume");
        return callback({ error: "Cannot consume" });
      }

      const consumerTransport = await router.createWebRtcTransport(
        transportOptions
      );
      await consumerTransport.connect({
        dtlsParameters: rtpCapabilities.dtlsParameters,
      });

      const consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
      });

      socket.consumerTransport = consumerTransport;
      socket.consumer = consumer;

      callback({
        params: {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
        },
      });
    } catch (err) {
      console.error("Error during consume:", err);
      callback({ error: err.message });
    }
  });
});

server.listen(3000, () => {
  console.log("SFU server running at http://localhost:3000");
});
