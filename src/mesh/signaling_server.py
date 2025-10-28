# signaling_server.py
import asyncio
import websockets

connected = set()

async def handler(websocket):
    print("New client connected")
    connected.add(websocket)
    try:
        async for message in websocket:
            # 他のクライアントにブロードキャスト
            for conn in connected:
                if conn != websocket:
                    await conn.send(message)
    finally:
        connected.remove(websocket)
        print("Client disconnected")

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("Signaling server running at ws://localhost:8765")
        await asyncio.Future()  # 永久待機

if __name__ == "__main__":
    asyncio.run(main())