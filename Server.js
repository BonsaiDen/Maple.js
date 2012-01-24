/**
  * Copyright (c) 2011 Ivo Wetzel.
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
    Class = require('./lib/Class'),
    WebSocketServer = require('./lib/WebSocket'),
    Maple = require('./Maple');


// Main Server ----------------------------------------------------------------
// ----------------------------------------------------------------------------
var Server = Class(function(clientClass) {

    // Socket
    this._socket = new WebSocketServer();
    this._version = '0.1';

    // Clients
    this._clients = {};
    this._clientClass = clientClass || Server.Client;

    // Setup socket callbacks
    var that = this;
    //this._socket.on('connection', function(conn, req) {
        //that.connected(conn, req);
    //});

    this._socket.on('data', function(conn, raw, binary) {

        // Do some basic filtering
        var msg;
        try {
            msg = BISON.decode(raw);

        } catch(e) {
            console.log('ERROR: Invalid BISON Message.');
            conn.close();
            return;
        }

        console.log(msg);
        if (msg.length < 2 || !(msg instanceof Array)) {
            console.log('ERROR: Message too short.');
            conn.close();
            return;
        }

        // Get message Details
        var type = msg[0],
            tick = msg[1],
            data = msg.slice(2),
            id = conn.id,
            client = that._clients.hasOwnProperty(id);

        if (type === Maple.Message.CONNECT) {

            if (!client) {

                that._clients[id] = new that._clientClass(that, conn);
                that._clients[id].send(Maple.Message.START, [
                    that._tickRate,
                    that._logicRate,
                    that._syncRate,
                    that._randomSeed
                ]);

                that.connected(that._clients[id]);

            } else {
                delete that._clients[id];
                conn.close();
            }

        } else if (client) {
            // TODO if this doesn't handle it, delegate to client
            that.message(client, type, tick, data);
        }

    });

    this._socket.on('end', function(conn) {

        var id = conn.id;
        if (that._clients.hasOwnProperty(id)) {
            that.disconnected(that._clients[id]);
            delete that._clients[id];
        }

    });

    this._socket.on('request', function(req, res) {
        that.requested(req, res);
    });

}, {

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
        this._logicRate = options.logicRate || 2;
        this._syncRate = options.syncRate || 30;

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

        for(var i in clients) {

            var client = this._clients[i];
            if (!excluded || excluded.indexOf(client) === -1) {
                this._bytesSend += client.sendRaw(data);
            }

        }

    },

    stop: function() {

        if (!this.isRunning()) {
            return false;
        }

        this._isRunning = false;
        clearInterval(this._tickInterval);

        return true;

    },


    // Internal handling of update logic --------------------------------------
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
      * {Boolean} Callback for any messages received from a @client.
      *
      * @client {Server.Client} The client
      * @type {Integer} Message type
      * @tick {Integer} Client side tick at which the message was send.
      * @data {Array} Message data
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
  * {Server.Client} Simple client abstraction for the Maple Server.
  *
  * @conn {WebSocketConnection}
  */
Server.Client = Class(function(server, conn) {
    this.id = conn.id;
    this._conn = conn;
    this._server = server;

}, {

    /**
      * Sends a @msg {Array} to the server, @type {Number}.
      */
    send: function(type, data) {

        // Add type and tick to the message
        var msg = [type, this._server.getTick()];
        if (data !== undefined) {
            msg.push.apply(msg, data);
        }

        // Make the message as small as possible and send it
        this._conn.send(BISON.encode(msg));

    },

    /**
      * TODO: Add Description
      */
    sendRaw: function(data) {
        return this._conn.send(data);
    }

});

module.exports = Server;

