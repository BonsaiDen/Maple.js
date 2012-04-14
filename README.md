Maple - Simple, event based Multiplayer for Node.js
===================================================

__Maple.js__ aims to provide a simple way to write a event based, realtime multiplayer 
game running in the Browser.

Maple is best suited for games with low requirements on latency and high requirments 
on synced state. It ensures synced time and random number values for both server 
and client on every frame\*.

Any kind of Realtime/Round based strategy game should be do able with Maple.js.

> \* Random numbers require identical calls on both sides to stay in sync during a frame.


## Demo

A straigtforward demo which puts out some messages, as well as other debug infos 
can be found in the `demo` directory.

Running it is as easy as __1, 2, 3__:

1. `$ node demo/server.js`
2. Open `demo/index.html` in a Browser with WebSocket support
3. Check the Browser Console 


## API



## TODO

- Finish documentation
- Unit tests
- More inline comments around the guts of the system

