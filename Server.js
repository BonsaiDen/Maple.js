/**
  * Copyright (c) 2012 Ivo Wetzel.
  *
  * Permission is hereby granted, free of charge, to any person obtaining a copy
  * of this software and associated documentation files (the "Software"), to deal
  * in the Software without restriction, including without limitation the rights
  * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  * copies of the Software, and to permit persons to whom the Software is
  * furnished to do so, subject to the following conditions:
  *
  * The above copyright notice and this permission notice shall be included in
  * all copies or substantial portions of the Software.
  *
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  * THE SOFTWARE.
  */


// Imports --------------------------------------------------------------------
var BISON = require('./lib/bison'),
    Class = require('./lib/Class').Class,
    ObjectList = require('./lib/ObjectList'),
    WebSocketServer = require('./lib/WebSocket'),
    Maple = require('./Maple');


// Main Server ----------------------------------------------------------------
// ----------------------------------------------------------------------------
Maple.Server = Class(function(clientClass) {

    // Socket
    this._socket = new WebSocketServer();

    // Clients
    this._clients = new ObjectList();
    this._clientClass = clientClass || Maple.Server.Client;

    // Setup socket callbacks
    var that = this;
    this._socket.on('data', function(conn, raw, binary) {
        that._data(conn, raw);
    });

    this._socket.on('end', function(conn) {

        var client = that._clients.get(conn.clientId);
        if (client) {
            that._clients.remove(client);
            that.disconnected(client);
        }

    });

    this._socket.on('request', function(req, res) {
        that.requested(req, res);
    });

}, {

    $version: '0.1',

    /**
      * {Booelan} Starts the server in case it's not already running.
      *
      * Returns `true` on success.
      */
    start: function(options) {

        if (this.isRunning()) {
            return false;
        }

        this._bytesSend = 0;

        // Ticking
        this._tickTime = 0;
        this._tickRate = options.tickRate || 33;
        this._tickCount = 0;
        this._tickInterval = null;

        // Game Time
        this._startTime = -1;
        this._realTime = 0;
        this._frameTime = -1;

        // More logic stuff
        this._randomSeed = 500000 + Math.floor((Math.random() * 1000000));
        this._randomState = 0;
        this._logicRate = options.logicRate || 1; // Used for throttling logic ticks
        this._syncRate = options.syncRate || 30; // Send down tick count to clients every X updates

        this._isRunning = false;

        var that = this;
        this._tickInterval = setInterval(function() {
            that._update();

        }, this._tickRate);

        this._frameTime = Date.now();
        this._tickCount = 1;
        this._isRunning = true;

        this._socket.listen(options.port);

        return true;

    },

    /**
      * {Boolean} Returns whether the server is running or not.
      */
    isRunning: function() {
        return this._isRunning;
    },

    /**
      * Broadcase a message.
      */
    broadcast: function(type, data, clients, excluded) {

        // Add type and tick to the message, unless we're just sending a
        // single Number for tick syncing
        if (type !== null) {

            var msg = [type, this.getTick()];
            if (data !== undefined) {
                msg.push.apply(msg, data);
            }

            data = msg;

        }

        data = BISON.encode(data);

        // Fall back to everyone!
        if (!clients) {
            clients = this._clients;
        }

        this._clients.forEach(function(client) {

            if (!excluded || excluded.indexOf(client) === -1) {
                this._bytesSend += client.sendRaw(data);
            }

        }, this);

    },

    stop: function() {

        if (!this.isRunning()) {
            return false;
        }

        this._isRunning = false;
        clearInterval(this._tickInterval);

        this.broadcast(Maple.Message.STOP);
        this._clients.forEach(function(client) {
            client.close();
        });

        return true;

    },


    // Handling of incoming data and game logic -------------------------------
    _data: function(conn, raw) {

        // Do some basic filtering to prevent easy ways
        // of breaking the server
        var msg;
        try {
            msg = BISON.decode(raw);

        } catch(e) {
            this._error(conn, Maple.Error.INVALID_DATA);
            return;
        }

        if (msg.length < 2 || !(msg instanceof Array)) {
            this._error(conn, Maple.Error.MESSAGE_TOO_SHORT);
            return;
        }

        // Get message details
        var type = msg[0],
            tick = msg[1],
            data = msg.slice(2),
            client = this._clients.get(conn.clientId);

        // More checks for new connections
        if (type === Maple.Message.CONNECT) {

            if (!client) {

                // Throw up on unsupported version
                if (typeof data[0] !== 'string' || data[0] !== Maple.Server.$version) {
                    this._error(conn, Maple.Error.UNSUPPORTED_VERSION);

                // Add client to list and give the id to the connection
                } else {
                    client = new this._clientClass(this, conn);
                    conn.clientId = this._clients.add(client);

                    this._bytesSend += client.send(Maple.Message.START, [
                        this._tickRate,
                        this._logicRate,
                        this._syncRate,
                        this._randomSeed
                    ]);

                    this.connected(client);
                }

            } else {
                this._error(conn, Maple.Error.ALREADY_CONNECTED);
                this._clients.remove(client);
            }

        } else if (client) {

            // Handle time sync and ping detection
            // we simply echo back here
            if (type === Maple.Message.SYNC) {
                this._bytesSend += client.send(Maple.Message.SYNC, data);

            } else if (this.message(client, type, tick, data) !== true) {
                client.message(type, tick, data);
            }

        }

    },

    _error: function(conn, type) {
        this._bytesSend += conn.send(BISON.encode([Maple.Message.ERROR, 0, type]));
        conn.close();
    },

    _update: function() {

        var now = Date.now();

        this._realTime += (now - this._frameTime);
        while(this._tickTime < this._realTime && this.isRunning()) {

            if (this._startTime === -1) {
                this._startTime = Date.now();
                this.started();
            }

            // Sync clients tick count
            if (this._tickCount % this._syncRate === 0) {
                this.broadcast(null, this._tickCount % 250, this._players);
            }

            if (this._tickCount % this._logicRate === 0) {
                this.update(this._tickTime, this._tickCount);
            }

            this._tickCount++;
            this._randomState = this._tickCount;
            this._tickTime += this._tickRate;

        }

        this._frameTime = now;

    },


    // Abstract methods -------------------------------------------------------

    /**
      * Callback for when the "game" is started.
      */
    started: function() {

    },

    /**
      * The game update callback.
      *
      * @t {Integer} is the current game time.
      * @tick {Integer} is the current tick count.
      */
    update: function(time, tick) {

    },

    /**
      * Callback for when the "game" is stopped.
      */
    stopped: function() {

    },

    /**
      * Callback for when a client connects to the server.
      *
      * @client {Server.Client}
      */
    connected: function(client) {

    },

    /**
      * Callback for when a client disconnects from the server.
      *
      * @client {Server.Client}
      */
    disconnected: function(client) {

    },

    /**
      * {Boolean} Callback for any messages received from a @client.
      *
      * @client {Server.Client} The client
      * @type {Integer} Message type
      * @tick {Integer} Client side tick at which the message was send.
      * @data {Array} Message data
      *
      * Return `true` to indicate that the message was handled and prevent it
      * from being forwarded to {Maple.Client#message}.
      */
    message: function(client, type, tick, data) {

    },

    /**
      * Handler for HTTP Request which reach the server on the port its bound to.
      *
      * You can use this like the vanilla HTTP stuff in Node.
      */
    requested: function(req, res) {

    },


    // Getter -----------------------------------------------------------------

    /**
      * {Integer} Returns the "synced" game time in milliseconds.
      *
      * Please note that this is not 100% accurate and should only be used for
      * client side logic like drawing and effects.
      *
      * For synced actions between server and clinet always use the `tick` count.
      */
    getTime: function() {
        return this._tickTime;
    },

    /**
      * {Integer} Returns the number of synced game ticks that happend since the
      *           server was started.
      */
    getTick: function() {
        return this._tickCount;
    },

    /**
      * {ObjectList} Returns the list of currently connected clients.
      */
    getClients: function() {
        return this._clients;
    },

    /**
      * {Float} Returns a synced* random number between `0` and `1`.
      *
      * Note: This is only synced if the game code actual is the same on both sides.
      *
      * E.g: Doing 2 calls to this method on the client, but doing 3 on the server
      * will have the potential to unsync the RNG until the next tick.
      */
    getRandom: function() {
        this._randomState = (1103515245 * (this._randomState + this._randomSeed) + 12345) % 0x100000000;
        return this._randomState / 0x100000000;
    }

});


/**
  * {Maple.Server.Client} Simple client abstraction for the Maple Server.
  *
  * @conn {WebSocketConnection}
  */
Maple.Server.Client = Class(function(server, conn) {
    this.id = conn.id;
    this._conn = conn;
    this._server = server;
    this._messageArray = [0, 0];

}, {

    /**
      * Handler for messages received by the client which were not handled
      * by the server
      */
    message: function(type, tick, data) {

    },

    /**
      * Sends a @msg {Array} to the server, @type {Number}.
      */
    send: function(type, data) {

        // Add type and tick to the message
        this._messageArray.length = 2;
        this._messageArray[0] = type;
        this._messageArray[1] = this._server.getTick();

        if (data !== undefined) {
            this._messageArray.push.apply(this._messageArray, data);
        }

        // Make the message as small as possible and send it
        return this._conn.send(BISON.encode(this._messageArray));

    },

    /**
      * {Integer} Sends down the raw @data {String} to the client
      */
    sendRaw: function(data) {
        return this._conn.send(data);
    }

});

