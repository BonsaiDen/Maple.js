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

/*global Class, Twist, BISON, MozWebSocket, Maple */

/**
  * {Maple.Client} A game client for synced multiplayer games.
  *
  * Maple is uses a tick based approach to syncing, it also handles client
  * side frame rate management.
  *
  * Params: @update {Integer} and @render {Integer} frame rates.
  */
Maple.Client = Class(function(update, render) {

    Twist(this, update, render);
    this._socket = null;

    this._tickRate = 0;
    this._tickCount = 0;
    this._tickSyncTime = -1;

    this._baseTick = 0;
    this._serverTick = 0;
    this._lastTick = 0;
    this._syncRate = 0;
    this._logicRate = 0;

    this._randomSeed = 0;
    this._randomState = 0;

    this._messageQueue = [];
    this._messageUid = 0;
    this._messageArray = [0, 0];

    this._ping = 0;
    this._lastPingTime = -2000;
    this._pingInterval = 500;

}, Twist, {

    $version: '0.1',

    /**
      * {Boolean|Null} Connects with the Maple server at (@host {String} : @port {Number})
      *
      * Returns `false` in the case that there is already an open connection.
      * Returns `null` in the case that WebSockets aren't supported.
      */
    connect: function(host, port) {

        if (this.isConnected()) {
            return false;
        }

        // Figure out which object to use
        var ws = typeof WebSocket !== 'undefined' ? WebSocket : MozWebSocket;

        // Setup the socket
        // If the connection get's rejected, this won't throw but instead
        // call `onclose()`
        try {
            this._socket = new ws('ws://' + host + (port !== undefined ? ':' + port : ''));

        } catch(e) {
            return null;
        }

        // Setup event handlers, also send intial message
        var that = this;
        this._socket.onopen = function() {
            that.send(Maple.Message.CONNECT, [Maple.Client.$version]);
        };

        this._socket.onmessage = function(msg) {
            that._message(BISON.decode(msg.data), true);
        };

        this._socket.onclose = function(msg) {
            that.closed(!msg.wasClean, msg.code);
            that._stop();
        };

        return true;

    },

    /**
      * {Boolean} Disconnects the client from the Maple server its currently connected to.
      *
      * Returns `false` in case there is no server to disconnect from.
      */
    disconnect: function() {

        if (!this.isConnected()) {
            return false;

        } else {
            this._socket.close();
            this._socket = null;
            return true;
        }

    },

    /**
      * {Boolean} Whether the client is currently connected to any server or not.
      */
    isConnected: function() {
        return !!this._socket;
    },

    /**
      * Sends a @data {Array} to the server, @type {Number}.
      */
    send: function(type, data) {

        // Add type and tick to the message
        this._messageArray.length = 2;
        this._messageArray[0] = type;
        this._messageArray[1] = this.getTick();
        if (data !== undefined) {
            this._messageArray.push.apply(this._messageArray, data);
        }

        // Make the message as small as possible and send it
        this._socket.send(BISON.encode(this._messageArray));

    },


    // Internal handling of synced update / rendering -------------------------
    _update: function() {

        // Grab current values
        var t = this.getTime(),
            tick = this.getTick();

        // Calculate passed difference in frames since last tick
        var ct = 0,
            diff = tick - this._lastTick,
            lt = this._lastTick || 0;

        // Run through all frames, calculate the intermediate tick
        // and check for logic ticks
        while(ct < diff) {

            tick = lt + ct;
            if (tick > this._lastTick && tick % this._logicRate === 0) {

                // Check all messages in the queue to see whether we've
                // got some for this tick
                this._processMessageQueue();

                // Re-seed random generator
                this._randomState = tick;

                this.update((tick * this._tickRate) - this._tickRate, tick);
                this._lastTick = tick;

            }

            ct++;

        }

        // Send out a ping
        var realTime = Twist.getTime(this, true);
        if (realTime - this._lastPingTime >= this._pingInterval) {
            this.send(Maple.Message.SYNC, [realTime]);
            this._lastPingTime = realTime;
            this._pingInterval = Math.min(this._pingInterval + 500, 8000);
        }

    },

    _stop: function() {
        this._socket = null;
        Twist.stop(this);
        this.stopped();
    },

    _render: function(t, dt, u) {
        this.render(this.getTime(), this.getTick(), dt, u);
    },

    _message: function(msg, initial, flush) {

        // Sync message consists of one plain Integer being send by the server
        // The int is one byte and wraps around every 250 ticks.
        if (typeof msg === 'number') {

            var diff = msg - this._serverTick;

            // Wrap around and increase base by 250
            if (diff < 0) {
                this._baseTick++;
            }

            this._serverTick = msg;
            this._tickSyncTime = Date.now();
            this._tickCount = this._baseTick * 250 + msg;

            return false;

        }

        // Real messages
        var type = msg[0],
            tick = msg[1],
            data = msg.slice(2);

        // Handle basic message which are not synced with tick counts
        var ret = this._handleMessage(type, tick, data);
        if (ret === false) {

            // Messages which need to be in sync with the tick count
            // these will be processed right before the next gam tick
            if (!flush && tick > 0 && tick > this._lastTick) {

                if (initial) {
                    msg.uid = ++this._messageUid;
                    this._messageQueue.push(msg);
                }

            } else {
                // this always returns true for now
                ret = this._handleSyncedMessage(type, tick, data);
            }

        }

        return ret;

    },

    /**
      * Handle messages which aren't bound to a given tick.
      */
    _handleMessage: function(type, tick, data) {

        switch(type) {

            case Maple.Message.START:

                this._tickRate = data[0];
                this._logicRate = data[1];
                this._syncRate = data[2];
                this._randomSeed = data[3];

                this._serverTick = 0;
                this._baseTick = Math.floor(tick / 250);

                this._tickSyncTime = Date.now();
                this._tickCount = tick;
                this._lastTick = this._tickCount;

                // Start game loop
                Twist.start(this);

                this.started();
                break;

            case Maple.Message.ERROR:
                this.error(data[0]);
                break;

            case Maple.Message.SYNC:
                this._ping = (Twist.getTime(this, true) - data[0]) / 2;
                break;

            default:
                return this.message(type, tick, data) || false;
        }

        // Return true in case we handled the message
        return true;

    },

    /**
      * Handles basic synced messages directly implements by Maple.
      *
      * Synced messages are messages which need to be handled at the exact
      * tick count they were send off at the server.
      */
    _handleSyncedMessage: function(type, tick, data) {

        switch(type) {

            case Maple.Message.STOP:
                this._stop();
                return true;

        }

        this.syncedMessage(type, tick, data);
        return true;

    },

    /**
      * Walk through all pending messages. This ensures that they're always
      * handled with the gametick they were send off at the server.
      */
    _processMessageQueue: function(flush) {

        // Sort messaged based on UID to ensure correct order
        this._messageQueue.sort(function(a, b) {
            return a.uid - b.uid;
        });

        for(var i = 0; i < this._messageQueue.length; i++) {

            if (this._message(this._messageQueue[i], false, flush)) {
                this._messageQueue.splice(i, 1);
                i--;
            }

        }

    },


    // Abstract Game Methods --------------------------------------------------

    /**
      * Callback for when the "game" is started.
      */
    started: function() {

    },

    /**
      * The update game callback.
      *
      * @t {Integer} is the current game time.
      * @tick {Integer} is the current tick count.
      */
    update: function(t, tick) {

    },

    /**
      * The game render callback.
      *
      * @t {Integer} is the current render time,
      * @tick {Integer} is the current tick count,
      * @dt {Integer} the time passed since the last call to {Maple.Client#update}
      * and @u {Float} is a represensation of @dt in the range of `0...1`
      */
    render: function(t, tick, dt, u) {

    },


    /**
      * Callback for when the "game" is stopped.
      */
    stopped: function() {

    },


    // Abstract Network Methods -----------------------------------------------

    /**
      * The callback for when the connection to the server is intially established.
      *
      * Note: This is not the same as the `onopen` callback of the WebSocket.
      *       This actually means that the server acknowledged us.
      */
    connected: function() {

    },

    /**
      * {Boolean} Callback for any messages received from the server.
      *
      * Due to the nature of the network, messages may arrive "Out of sync".
      * So you should only handle messages which are INDEPENDENT of the `tick`
      * count in this method.
      *
      * @type {Integer} Message type
      * @tick {Integer} Server side tick at which the message was send.
      * @data {Array} Message data
      *
      * Return `true` to indicate that the messag was handled.
      *
      */
    message: function(type, tick, data) {

    },

    /**
      * {Boolean} Callback for synced messages received from the server.
      *
      * Due to the nature of the network, messages may arrive "Out of sync".
      * So you should only handle messages which DEPEND of the `tick` count in
      * this method.
      *
      * @type {Integer} Message type
      * @tick {Integer} Server side tick at which the message was send.
      * @data {Array} Message data
      *
      * Return `true` to indicate that the messag was handled.
      *
      */
    syncedMessage: function(type, tick, data) {

    },

    /**
      * The callback for when an error occurs and the server terminates the
      * connection
      *
      * @type {Integer} The Error ID from {Maple.Error}
      */
    error: function(type) {

    },

    /**
      * The callback for when the connection to the server was closed.
      *
      * @byRemote {Boolean} is `true` in case the connect was closed *by* the server.
      * @errorCode {Integer}
      */
    closed: function(byRemote, errorCode) {

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
        return this._tickCount * this._tickRate + (Date.now() - this._tickSyncTime);
    },

    /**
      * {Integer} Returns the number of synced game ticks that happend since the
      *           server was started.
      */
    getTick: function() {

        // Ensure we don't return Infinite values here
        if (!this.isRunning()) {
            return 0;

        } else {

            var dt = (Date.now() - this._tickSyncTime),
                tick = this._tickCount + Math.round(dt / this._tickRate) || 0;

            return tick;
        }

    },

    /**
      * {Integer} Returns the ping to the server.
      */
    getPing: function() {
        return this._ping;
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

