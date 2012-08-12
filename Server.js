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
    ObjectList = require('./lib/ObjectList'),
    WebSocketServer = require('./lib/WebSocket'),
    Maple = require('./Maple');


// Main Server ----------------------------------------------------------------
// ----------------------------------------------------------------------------
Maple.Server = Maple.Class(function(clientClass, messageTypes) {

    // Clients
    this._socket = null;
    this._clients = new ObjectList();
    this._clientClass = clientClass || Maple.ServerClient;
    this._messageTypes = messageTypes || {};

}, {

    $version: '0.2',

    /**
      * {Booelan} Starts the server in case it's not already running.
      *
      * Returns `true` on success.
      */
    start: function(options) {

        if (this.isRunning()) {
            return false;
        }

        // Traffic
        this._oldBytesSend = 0;
        this._bytesSend = 0;
        this._bytesTime = Date.now();
        this._bytesStats = [];
        this._bytesStatId = 0;
        this._bytesSendPerSecond = 0;

        // Ticking
        this._tickTime = 0;
        this._tickRate = Math.floor(1000 / (options.tickRate || 30));
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

        if (options.socket !== false) {
            this._createSocket();
            this._socket.listen(options.port);
        }

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

            var msg = [this.messageTypeToId(type), this.getTick()];
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

        this._clients.each(function(client) {

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
        this._clients.each(function(client) {
            client.close();
        });

        if (this._socket) {
            this._socket.close();
        }

        return true;

    },

    _createSocket: function() {

        // Socket
        this._socket = new WebSocketServer();

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
                    client = new this._clientClass(this, conn, !!data[1]);
                    conn.clientId = this._clients.add(client);

                    this._bytesSend += client.send(Maple.Message.START, [
                        this._tickRate,
                        this._logicRate,
                        this._syncRate,
                        this._randomSeed,
                        this._messageTypes
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
            if (type === Maple.Message.PING) {
                client._ping = Math.ceil(data[1]);
                this._bytesSend += client.send(Maple.Message.PONG, [data[0]]);

            } else {

                type = this.messageTypeFromId(type);
                if (this.message(client, type, tick, data) !== true) {
                    client.message(type, tick, data);
                }

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

        if (now > this._bytesTime + 100) {

            this._bytesStats[this._bytesStatId] = this._bytesSend - this._oldBytesSend;
            this._oldBytesSend = this._bytesSend;
            this._bytesStatId++;
            this._bytesStatId = this._bytesStatId % 10;

            this._bytesSendPerSecond = this._bytesStats.reduce(function(p, c) {
                return p + c;
            }) / 10;

            this._bytesTime = now;

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
      * - @t {Integer} is the current game time.
      * - @tick {Integer} is the current tick count.
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
      * - @client {Server.Client} The client
      * - @type {Integer} Message type
      * - @tick {Integer} Client side tick at which the message was send.
      * - @data {Array} Message data
      *
      * Return `true` to indicate that the message was handled and prevent it
      * from being forwarded to {Maple.Client#message}.
      */
    message: function(client, type, tick, data) {

    },

    /**
      * Handler for HTTP Request which reach the server on the port its bound to.
      *
      * You can use this like the vanilla HTTP interface from Node.
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
    },


    // Conversions ------------------------------------------------------------

    /**
      * {Integer} Converts the message @type {String|Integer} into a integer ID representing for network transmission.
      */
    messageTypeToId: function(type) {

        if (typeof type === 'string') {
            var id = this._messageTypes.indexOf(type);
            if (id === -1) {
                this.logError('Undefined type id for "' + type + '"');
            }

            return id;

        } else if (typeof type === 'number') {
            return type;

        } else {
            this.logError('Invalid type value: "' + type + '"');
        }

    },

    /**
      * {String} Converts the message @id {Integer} into the corresponding message type string.
      */
    messageTypeFromId: function(id) {

        if (id >= 0 && id < this._messageTypes.length) {
            return this._messageTypes[id];

        } else {
            this.logError('Undefined type string for "' + id + '"');
        }

    },


    // Helpers ----------------------------------------------------------------

    /**
      * {var[]} A wrapper for `console.log()` which also gives information about the current state of the server.
      */
    log: function() {
        console.log.apply(console, this._log(arguments));
    },

    /**
      * {var[]} A wrapper for `console.error()` which also gives information about the current state of the server.
      */
    logError: function() {
        console.error.apply(console, this._log(arguments));
    },

    /**
      * {var[]} A wrapper for `console.warn()` which also gives information about the current state of the server.
      */
    logWarning: function() {
        console.warn.apply(console, this._log(arguments));
    },

    _log: function(args) {
        var parts = Array.prototype.slice.call(args),
            info = '[Cc: ' + this.getClients().length
                    + '  T: ' + this.getTime()
                    + '  I: ' + this.getTick()
                    + '  R: ' + this.getRandom() + ']\n';

        parts.unshift(info);
        parts.push('\n');
        return parts;
    }

});


/**
  * {Maple.Server.Client} Simple client abstraction for the Maple Server.
  *
  * @conn {WebSocketConnection}
  */
Maple.ServerClient = Maple.Class(function(server, conn, isBinary) {

    this.id = conn.id;
    this.clientId = -1;
    this._conn = conn;
    this._ping = 0;
    this.server = server;
    this.isBinary = isBinary || false;
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
        this._messageArray[0] = this.server.messageTypeToId(type);
        this._messageArray[1] = this.server.getTick();

        if (data !== undefined) {
            this._messageArray.push.apply(this._messageArray, data);
        }

        // Make the message as small as possible and send it
        return this._conn.send(BISON.encode(this._messageArray), this.isBinary);

    },

    /**
      * {Integer} Sends down the raw @data {String} to the client
      */
    sendRaw: function(data) {
        return this._conn.send(data, this.isBinary);
    },

    /**
      * {Integer} Returns the ping to the server.
      */
    getPing: function() {
        return this._ping;
    }

});

