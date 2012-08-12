/**
  * Copyright (c) 2011-2012 Ivo Wetzel.
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
var http = require('http'),
    Class = require('./Class').Class,
    net = require('net'),
    crypto = require('crypto'),
    EventEmitter = require('events').EventEmitter;

// Wrap Node's event emitter into a class
var Emitter = Class(EventEmitter, EventEmitter.prototype);


/**
  * {Connection} A abstract WebSocket connection base.
  */
var Connection = Class(function(socket, maxMessageLength) {

    Emitter(this);

    this._maxMessageLength = maxMessageLength;
    this._socket = socket;
    this._connected = true;

    this.id = socket.remoteAddress + ':' + socket.remotePort;
    this.bytes = {
        send: 0,
        sendRaw: 0,
        received: 0,
        receivedRaw: 0
    };

    // Bind Socket Events
    var that = this;
    socket.on('data', function(data) {
        if (that._connected) {
            that._read(data);
        }
    });

    socket.on('end', function(e) {
        that._close();
    });

    socket.on('error', function(err) {
        that._close();
    });

}, Emitter, {

    /**
      * Ends the web socket connection and closes the corresponding socket.
      */
    _close: function(remote) {

        if (this._connected) {
            this._connected = false;
            this._socket.end();
            this._socket.destroy();
            this.emit('end', remote || false);
        }

    }

});


/**
  * {Protocol8} Implementation of the latest WebSocket protocol.
  */
var Protocol8 = Class(function(socket, maxMessageLength) {

    Connection(this, socket, maxMessageLength);
    this._buffer = new Buffer(0);
    this._offset = 0;

    // Parser closure
    var b,
        state = 0,
        frameFin = false,
        frameR1 = false,
        frameR2 = false,
        frameR3 = false,
        frameOp = 0,
        frameMasked = false,
        frameMaskOffset = 0,
        frameLength = 0,
        that = this;

    /**
      * Parses @length {Integer} bytes starting at the current buffer offset
      */
    this.parse = function(length) {

        var bytes = length - that._offset,
            buffer = this._buffer;

        if (state === 0 && bytes >= 1) {

            b = buffer[that._offset++];
            frameFin = (b & 1) === 1;
            frameOp = b & 15;
            b &= 240;

            // Reserved frame check
            if ((b & 2) === 2 || (b & 4) === 4 || (b & 8) === 8) {
                state = -1;

            // Closing frame
            } else if (frameOp === 8) {
                state = -1;

            // Ping frame
            } else if (frameOp === 9) {
                console.log('got ping');
                state = 1;

            // Pong frame
            } else if (frameOp === 10) {
                console.log('got pong');
                state = 1;

            // Unused op codes
            } else if (frameOp !== 1 && frameOp !== 2
                       && frameOp !== 9) {

                state = -1;

            } else {
                state = 1;
            }

        } else if (state === 1 && bytes >= 1) {

            b = buffer[that._offset++];

            // Clients ALWAYS MASK, although they don't care to tell you
            frameMasked = frameOp !== 10 ? ((b & 1) === 1  || true) : false;
            frameLength = b & 127;

            if (frameLength <= 125) {
                state = frameMasked ? 4 : 5;

            } else if (frameLength === 126) {
                frameLength = 0;
                state = 2;

            } else if (frameLength === 127) {
                frameLength = 0;
                state = 3;

            } else {
                state = -1;
            }

        // Read 16 bit length
        } else if (state === 2 && bytes >= 2) {

            frameLength = buffer[that._offset + 1] + (buffer[that._offset] << 8);
            that._offset += 2;
            state = frameMasked ? 4 : 5;

        // Read 64 bit length
        } else if (state === 3 && bytes >= 8) {

            var hi = (buffer[that._offset + 0] << 24)
                    + (buffer[that._offset + 1] << 16)
                    + (buffer[that._offset + 2] << 8)
                    + buffer[that._offset + 3],

                low = (buffer[that._offset + 4] << 24)
                    + (buffer[that._offset + 5] << 16)
                    + (buffer[that._offset + 6] << 8)
                    + buffer[that._offset + 7];

            frameLength = (hi * 4294967296) + low;
            that._offset += 8;
            state = frameMasked ? 4 : 5;

        // Read mask
        } else if (state === 4 && bytes >= 4) {

            frameMaskOffset = that._offset;
            that._offset += 4;
            state = 5;

        // Read frame data
        } else if (state === 5 && bytes >= frameLength)  {

            var message,
                binary = frameOp === 2;

            if (frameLength > 0) {

                if (frameMasked) {

                    var i = 0;
                    while(i < frameLength) {
                        buffer[that._offset + i] ^= buffer[frameMaskOffset + (i % 4)];
                        i++;
                    }

                }

                that.bytes.received += frameLength;
                message = buffer.toString(binary ? 'binary' : 'utf8',
                                          that._offset, that._offset + frameLength);

            } else {
                message = '';
            }

            state = 0;
            that._offset += frameLength;
            that.bytes.receivedRaw += that._offset;

            // Ping
            if (frameOp === 9) {
                that.send(message);

            // Message
            } else if (frameOp !== 10) {
                that.emit('data', message, binary);
            }

            return true;

        } else {
            return false;
        }

        if (state === -1) {
            that._close(true);
            return false;
        }

    };

}, Connection, {

    _read: function(data) {

        // Make sure we prevent some basic DoS attacks by limiting the frame size
        var newLength = this._buffer.length + data.length;
        if (newLength > this._maxMessageLength) {
            this.close();
            return;
        }

        // Create a temporay buffer for reading
        var tmp = new Buffer(newLength);
        this._buffer.copy(tmp);
        data.copy(tmp, this._buffer.length);

        this._buffer = tmp;

        var length = this._buffer.length;
        while(length > 0) {

            // Parse the available data for a message frame
            var lastPos = this._offset,
                result = this.parse(length);

            if (result === false || !this._connected) {
                break;

            // If we read a message, re-size the buffer and reset the offset
            } else if (result === true) {

                length = this._buffer.length - this._offset;
                tmp = new Buffer(length);
                this._buffer.copy(tmp, 0, this._offset);
                this._buffer = tmp;
                this._offset = 0;
            }

        }

    },

    _write: function(data, binary) {

        var enc = binary ? 'binary' : 'utf8',
            dataLength = Buffer.byteLength(data, enc),
            dataBuffer,
            rawBytesSend = 2;

        // 64 Bit
        if (dataLength > 65535) {

            dataBuffer = new Buffer(10 + dataLength);
            dataBuffer[1] = 127;

            // This... uh... should work I guess
            var low = dataLength | 0,
                hi = (dataLength - low) / 4294967296;

            dataBuffer[2] = (hi >> 24) & 255;
            dataBuffer[3] = (hi >> 16) & 255;
            dataBuffer[4] = (hi >> 8) & 255;
            dataBuffer[5] = hi & 255;

            dataBuffer[6] = (low >> 24) & 255;
            dataBuffer[7] = (low >> 16) & 255;
            dataBuffer[8] = (low >> 8) & 255;
            dataBuffer[9] = low & 255;

            rawBytesSend += 8;

        // 16 Bit
        } else if (dataLength > 125) {
            dataBuffer = new Buffer(4 + dataLength);
            dataBuffer[1] = 126;
            dataBuffer[2] = (dataLength >> 8) & 255;
            dataBuffer[3] = dataLength & 255;
            rawBytesSend += 2;

        } else {
            dataBuffer = new Buffer(2 + dataLength);
            dataBuffer[1] = dataLength;
        }

        // Set op and fin
        dataBuffer[0] = 128 + (binary ? 2 : 1);

        // Clear masking bit
        dataBuffer[1] &= ~128;

        if (this._socket.writable) {

            dataBuffer.write(data, rawBytesSend, enc);
            this._socket.write(dataBuffer);

            this.bytes.sendRaw += rawBytesSend + dataLength;
            this.bytes.send += dataLength;

        } else {
            this._close(true);
        }

        return rawBytesSend + dataLength;

    },

    send: function(data, binary) {
        this._write(data, binary);
    },

    close: function() {

        this._buffer = null;
        if (this._socket.writable) {
            this._socket.write('\x88', 'binary');
        }

        this._close(false);

    }

});


/**
  * {Protocol76} Protocol 75/76 implementation of a WebSocket connection
  */
var Protocol76 = Class(function(socket, maxMessageLength) {

    Connection(this, socket, maxMessageLength);

    this._frame = [];
    this._frameLength = 0;
    this._state = 0;

}, Connection, {

    _read: function(data) {

        if (data.length > this._maxMessageLength) {
            this.close();
            return;
        }

        for(var i = 0, l = data.length; i < l; i++) {

            var b = data[i];
            if (this._state === 0) {

                if ((b & 0x80) === 0x80) {
                    this._state = 2;

                } else {
                    this._state = 1;
                }

                this.bytes.receivedRaw += 1;

            // Low
            } else if (this._state === 1) {

                if (b === 0xff) {

                    var buffer = new Buffer(this._frame);

                    this._frame.length = 0;
                    this._state = 0;
                    this.bytes.received += this._frameLength;
                    this.bytes.receivedRaw += 1 + this._frameLength;
                    this._frameLength = 0;

                    this.emit('data', buffer.toString('utf8'), false);

                } else {
                    this._frame.push(b);
                    this._frameLength++;
                }

            // High
            } else if (this._state === 2) {
                if (b === 0x00) {
                    this.close(true);
                }
            }

        }

    },

    send: function(data, binary) {
        return this._write(data, binary);
    },

    close: function(remote) {
        this._write(null);
        this.end(remote);
    },

    _write: function(data) {

        var rawBytesSend = 0;
        if (this._socket.writable) {

            try {

                this._socket.write('\x00', 'ascii');

                if (data !== null) {

                    var dataLength = Buffer.byteLength(data);
                    this._socket.write(data, 'utf8');
                    this.bytes.send += dataLength;
                    rawBytesSend += dataLength;
                }

                this._socket.write('\xff', 'ascii');
                this.bytes.sendRaw += rawBytesSend + 2;

            } catch(e) {

            }

        }

        return rawBytesSend;

    }

});


/**
  * WebSocket server.
  */
var Server = Class(function(maxMessageLength) {

    Emitter(this);

    this._maxMessageLength = maxMessageLength || Server.$MAX_MESSAGE_LENGTH;
    this._server = new http.Server();
    this._peers = {};

    var that = this;
    this._server.on('request', function(req, res) {
        that._handleRequest(req, res);
    });

    this._server.on('upgrade', function(req, socket, upgradeHeader) {
        that._handleUpgrade(req, socket, upgradeHeader);
    });

}, Emitter, {

    /**
      * Maximum length of a message before the client is disconnected.
      */
    $MAX_MESSAGE_LENGTH: 32768,

    $protocols: {
        8: Protocol8,
        75: Protocol76,
        76: Protocol76
    },

    /**
      * Makes the server listen on the specified port.
      */
    listen: function(port) {
        this._server.listen(port);
    },

    /**
      * Shuts down the server.
      */
    close: function() {

        this._server.close();

        for(var i in this._peers) {
            if (this._peers.hasOwnProperty(i)) {
                this._peers[i].close();
            }
        }

    },

    /**
      * Broadcasts a message to all connected peers.
      *
      * Returns the number of raw bytes send.
      */
    broadcast: function(data, binary) {

        var bytes = 0;
        for(var i in this._peers) {
            if (this._peers.hasOwnProperty(i)) {
                bytes += this._peers[i].send(data, binary);
            }
        }

        return bytes;

    },

    _handleRequest: function(req, res) {

        if (!req.headers.hasOwnProperty('upgrade')) {
            this.emit('request', req, res);
        }

    },

    /**
      * Handles a HTTP Upgrade requests by determining whether it is a WebSocket
      * connection and performing the correct handshake in that case.
      */
    _handleUpgrade: function(req, socket, upgradeHeader) {

        // Check the headers to see whether this might work out
        var headers = req.headers;
        if (req.method === 'GET'
            && headers.hasOwnProperty('upgrade')
            && headers.hasOwnProperty('connection')
            && headers.upgrade.toLowerCase() === 'websocket'
            && headers.connection.toLowerCase().indexOf('upgrade') !== -1) {


            // Determine version and perform handshake
            var handshake = this._determineProtocol(req, upgradeHeader);
            if (handshake.version !== -1 && Server.$protocols.hasOwnProperty(handshake.version)) {

                socket.setTimeout(0); // No timeouts please
                socket.setNoDelay(true); // Send data immediately
                socket.setKeepAlive(true, 0); // Take care of keep alives
                socket.removeAllListeners('timeout'); // prevents Node <= 6.6 from timing out the upgraded HTTP request

                this._handleConnection(handshake, req, socket);
                return true;
            }

        }

        socket.end();
        socket.destroy();

    },

    /**
      * Handles a incoming WebSocket connection.
      */
    _handleConnection: function(handshake, request, socket) {

        // Fully establish the connection
        this._sendHandshake(handshake, socket);

        // Create connection instance
        var type = Server.$protocols[handshake.version],
            connection = new type(socket, this._maxMessageLength);

        this._peers[connection.id] = connection;

        // Emit and bind server events
        this.emit('connection', connection, request);

        var that = this;
        connection.on('data', function(data, binary) {
            that.emit('data', connection, data, binary);
        });

        connection.on('end', function(remote) {
            delete that._peers[connection.id];
            that.emit('end', connection, remote);
        });

    },

    /**
      * {Object} Determines the protocol version of the WebSocket connection.
      *
      * Returns an object containing the both the version of the connection as
      * well as the data required to complete the handshake.
      */
    _determineProtocol: function(request, upgradeHeader) {

        var version = -1,
            handshakeBody = null,
            handshakeHeaders = null,
            headers = this._parseHeaders(request);

        // Newer drafts
        if ('version' in headers && 'origin' in headers) {

            if (headers.version >= 8) {

                var accept = crypto.createHash('sha1');
                accept.update(headers.key
                              + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');

                version = 8;
                handshakeHeaders = {
                    'Sec-WebSocket-Version': headers.version,
                    'Sec-WebSocket-Origin': headers.origin,
                    'Sec-WebSocket-Accept': accept.digest('base64')
                };

            }

        // Draft 76
        } else if ('key1' in headers && 'key2' in headers) {

            var key1 = headers.key1,
                key2 = headers.key2,
                num1 = parseInt(key1.replace(/[^\d]/g, ''), 10),
                num2 = parseInt(key2.replace(/[^\d]/g, ''), 10),
                spaces1 = key1.replace(/[^\ ]/g, '').length,
                spaces2 = key2.replace(/[^\ ]/g, '').length;

            if (!(spaces1 === 0 || spaces2 === 0
                || num1 % spaces1 !== 0 || num2 % spaces2 !== 0)) {

                var hash = crypto.createHash('md5');
                hash.update(Server.$pack32(parseInt(num1 / spaces1, 10)));
                hash.update(Server.$pack32(parseInt(num2 / spaces2, 10)));
                hash.update(upgradeHeader.toString('binary'));

                version = 76;
                handshakeBody = hash.digest('binary');
                headers = {
                    'Sec-WebSocket-Origin': headers.origin,
                    'Sec-WebSocket-Location': 'ws://' + headers.host + '/'
                };

            }

        // Draft 75
        } else {
            version = 75;
            handshakeBody = hash.digest('binary');
            headers = {
                'WebSocket-Origin': headers.origin,
                'WebSocket-Location': 'ws://' + headers.host + '/'
            };
        }

        // Return -1 in case we couldn't determine the version of the protocol
        // in use by the client
        return {
            version: version,
            headers: handshakeHeaders,
            body: handshakeBody
        };

    },

    /**
      * {Object} Parses the headers from the incoming @request {Object}.
      */
    _parseHeaders: function(request) {

        var httpHeaders = request.headers,
            headers = {};

        // HTTP
        headers.host = httpHeaders.host;

        // Origin will be overriden by the sec-websocket version
        // in newer drafts(?)
        headers.origin = httpHeaders.origin;

        for(var i in httpHeaders) {
            if (httpHeaders.hasOwnProperty(i)
                && i.substring(0, 14) === 'sec-websocket-') {

                headers[i.substring(14)] = httpHeaders[i];
            }
        }

        if (headers.hasOwnProperty('version')) {
            headers.version = +headers.version;
        }

        return headers;

    },

    /**
      * Sends out a handshake to the client.
      */
    _sendHandshake: function(handshake, socket) {

        var data = 'HTTP/1.1 101 WebSocket Protocol Handshake\r\n'
                + 'Upgrade: WebSocket\r\n'
                + 'Connection: Upgrade\r\n';

        for(var i in handshake.headers) {
            if (handshake.headers.hasOwnProperty(i)) {
                data += i + ': ' + handshake.headers[i] + '\r\n';
            }
        }

        data += '\r\n';
        if (handshake.body !== null) {
            data += handshake.body;
        }

        socket.write(data, 'ascii');

    },

    $pack32: function(value) {
        return String.fromCharCode(value >> 24 & 0xFF)
               + String.fromCharCode(value >> 16 & 0xFF)
               + String.fromCharCode(value >> 8 & 0xFF)
               + String.fromCharCode(value & 0xFF);
    }

});

module.exports = Server;

