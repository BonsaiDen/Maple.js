Maple - Synced Multiplayer Gaming with Node and Websockets
==========================================================

Maple is a straigtforward implementation of a basic, tick synced multiplayer architecture.

It's lightweight and easy to use as well as extendable.

For a demo run `node run.js` and open `index.html` in a Browser with WebSocket support and watch your consoles.

**ALPHA STAGE SOFTWARE**

I extracted and refactored this from a few other multiplayer tests I recently wrote.
There might be some obvious bugs in here, which I'll sure find within the next few days when I port over one of the demo to Maple :)

Most of the public API is documented, there a few things on the server side which will need cleanup but I need some sleep now :D

## Features

- Synced tick count, game time as well as Pseudo RNG
- Awesome implementation of a JavaScript Game/Render Loop, just set the frame rates!
- Client side message queue based on tick count to ensure messages are process in the correct order
- WebSocket support for Draft 75 up to 13!
- Works with Node.js `>= v0.4`
- [BiSON](https://github.com/BonsaiDen/BiSON.js) encoding for messages for low bandwidth ^.^"
- [Neko.js](https://github.com/BonsaiDen/neko.js) for easy classes


## TODO

- Document all Public APIS
- Add unit tests
- Add more inline comments for syncing logic
- Add more awesomeness and kittens!

