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
    net = require('net'),
    crypto = require('crypto'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;


// WebSocket Connection -------------------------------------------------------
// ----------------------------------------------------------------------------
function Connection(req, socket, upgradeHeader) {

    EventEmitter.call(this);

    var headers = this.headers = this.request(req);
    this.version = -1;
    this._socket = socket;
    this._connected = false;

    this.bytesSend = 0;
    this.bytesReceived = 0;
    this.rawBytesSend = 0;
    this.rawBytesReceived = 0;

    // Newer drafts
    if ('version' in headers && 'origin' in headers) {

        if (this.headers.version >= 8) {

            var accept = crypto.createHash('sha1');
            accept.update(headers.key
                          + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');

            this._response({
                'Sec-WebSocket-Version': this.headers.version,
                'Sec-WebSocket-Origin': headers.origin,
                'Sec-WebSocket-Accept': accept.digest('base64')
            });

            this.version = 8;

        }

    // Draft 76
    } else if ('key1' in headers && 'key2' in headers) {

        var key1 = headers.key1,
            key2 = headers.key2;

        var num1 = parseInt(key1.replace(/[^\d]/g, ''), 10),
            num2 = parseInt(key2.replace(/[^\d]/g, ''), 10);

        var spaces1 = key1.replace(/[^\ ]/g, '').length,
            spaces2 = key2.replace(/[^\ ]/g, '').length;

        // Security check
        if (!(spaces1 === 0 || spaces2 === 0
            || num1 % spaces1 !== 0 || num2 % spaces2 !== 0)) {

            var hash = crypto.createHash('md5');
            hash.update(Connection.pack32(parseInt(num1 / spaces1, 10)));
            hash.update(Connection.pack32(parseInt(num2 / spaces2, 10)));
            hash.update(upgradeHeader.toString('binary'));

            this._response({
                'Sec-WebSocket-Origin': headers.origin,
                'Sec-WebSocket-Location': 'ws://' + headers.host + '/'

            }, hash.digest('binary'));

            this.version = 76;

        }

    // Draft 75
    } else {

        this._response({
            'WebSocket-Origin': headers.origin,
            'WebSocket-Location': 'ws://' + headers.host + '/'

        }, hash.digest('binary'));

        this.version = 75;

    }

    this.id = socket.remoteAddress + ':' + socket.remotePort;

    if (Connection.protocol.hasOwnProperty(this.version)) {

        Connection.protocol[this.version].call(this);

        // Events
        var that = this;
        socket.on('data', function(data) {

            if (that._connected) {
                that.read(data);
            }

        });

        socket.on('end', function(e) {
            that.__end();
        });

        socket.on('error', function(err) {
            that.__end();
        });

        this.__end = function(remote) {

            if (that._connected) {
                that._connected = false;
                socket.end();
                socket.destroy();
                that.emit('end', remote || false);
            }

        };

        that._connected = true;

    } else {
        socket.end();
        socket.destroy();
    }

}

Connection.MAX_MESSAGE_LENGTH = 4096;

util.inherits(Connection, EventEmitter);

Connection.prototype.request = function(req) {

    var httpHeaders = req.headers,
        headers = {};

    // HTTP
    headers.host = httpHeaders.host;

    // Origin will be overriden by the sec-websocket version
    // in newer drafts
    headers.origin = httpHeaders.origin;

    for(var i in httpHeaders) {
        if (i.substring(0, 14) === 'sec-websocket-') {
            headers[i.substring(14)] = httpHeaders[i];
        }
    }

    if (headers.hasOwnProperty('version')) {
        headers.version = +headers.version;
    }

    return headers;

};

Connection.prototype._response = function(headers, body) {

    var data = 'HTTP/1.1 101 WebSocket Protocol Handshake\r\n'
            + 'Upgrade: WebSocket\r\n'
            + 'Connection: Upgrade\r\n';

    for(var i in headers) {
        data += i + ': ' + headers[i] + '\r\n';
    }

    data += '\r\n';
    if (body !== undefined) {
        data += body;
    }

    this._socket.write(data, 'ascii');

};

Connection.pack32 = function(num) {

    return String.fromCharCode(num >> 24 & 0xFF)
           + String.fromCharCode(num >> 16 & 0xFF)
           + String.fromCharCode(num >> 8 & 0xFF)
           + String.fromCharCode(num & 0xFF);

};

Connection.protocol = {};

Connection.protocol[8] = function() {

    var that = this,
        buffer = new Buffer(0),
        bufferPos = 0,
        b,
        state = 0,
        frameFin = false,
        frameR1 = false,
        frameR2 = false,
        frameR3 = false,
        frameOp = 0,
        frameMasked = false,
        frameMaskOffset = 0,
        frameLength = 0;

    function parse(length) {

        var bytes = length - bufferPos;
        if (state === 0 && bytes >= 1) {

            b = buffer[bufferPos++];
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
            } else if (frameOp === 10) {
                state = 1;

            // Unused op codes
            } else if (frameOp !== 1 && frameOp !== 2
                       && frameOp !== 9) {

                state = -1;

            } else {
                state = 1;
            }

        } else if (state === 1 && bytes >= 1) {

            b = buffer[bufferPos++];

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

            frameLength = buffer[bufferPos + 1] + (buffer[bufferPos] << 8);
            bufferPos += 2;
            state = frameMasked ? 4 : 5;

        // Read 64 bit length
        } else if (state === 3 && bytes >= 8) {

            var hi = (buffer[bufferPos + 0] << 24)
                    + (buffer[bufferPos + 1] << 16)
                    + (buffer[bufferPos + 2] << 8)
                    + buffer[bufferPos + 3],

                low = (buffer[bufferPos + 4] << 24)
                    + (buffer[bufferPos + 5] << 16)
                    + (buffer[bufferPos + 6] << 8)
                    + buffer[bufferPos + 7];

            frameLength = (hi * 4294967296) + low;
            bufferPos += 8;
            state = frameMasked ? 4 : 5;

        // Read mask
        } else if (state === 4 && bytes >= 4) {

            frameMaskOffset = bufferPos;
            bufferPos += 4;
            state = 5;

        // Read frame data
        } else if (state === 5 && bytes >= frameLength)  {

            var message,
                binary = frameOp === 2;

            if (frameLength > 0) {

                if (frameMasked) {

                    var i = 0;
                    while(i < frameLength) {
                        buffer[bufferPos + i] ^= buffer[frameMaskOffset + (i % 4)];
                        i++;
                    }

                }

                that.bytesReceived += frameLength;
                message = buffer.toString(binary ? 'binary' : 'utf8',
                                          bufferPos, bufferPos + frameLength);

            } else {
                message = '';
            }

            state = 0;
            bufferPos += frameLength;
            that.rawBytesReceived += bufferPos;

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
            that.__end(true);
            return false;
        }

    }

    this.read = function(data) {

        var newLength = buffer.length + data.length;
        if (newLength > Connection.MAX_MESSAGE_LENGTH) {
            this.close();
            return;
        }

        var tmp = new Buffer(newLength);
        buffer.copy(tmp);
        data.copy(tmp, buffer.length);
        buffer = tmp;

        var length = buffer.length;
        while(length > 0) {

            var lastPos = bufferPos,
                result = parse(length);

            if (result === false || !that._connected) {
                break;

            } else if (result === true) {

                length = buffer.length - bufferPos;
                tmp = new Buffer(length);
                buffer.copy(tmp, 0, bufferPos);
                buffer = tmp;
                bufferPos = 0;
            }

        }

    };

    this.send = function(data, binary) {

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

        if (that._socket.writable) {

            dataBuffer.write(data, rawBytesSend, enc);
            this._socket.write(dataBuffer);

            that.rawBytesSend += rawBytesSend + dataLength;
            that.bytesSend += dataLength;

        } else {
            this.__end(true);
        }

        return rawBytesSend + dataLength;

    };

    this.close = function() {

        buffer = null;
        if (that._socket.writable) {
            that._socket.write('\x88', 'binary');
        }
        that.__end(false);

    };

};


Connection.protocol[76] = function() {

    var that = this,
        frame = [],
        frameLength = 0,
        state = 0;

    this.read = function(data) {

        if (data.length > Connection.MAX_MESSAGE_LENGTH) {
            this.close();
            return;
        }

        for(var i = 0, l = data.length; i < l; i++) {

            var b = data[i];
            if (state === 0) {

                if ((b & 0x80) === 0x80) {
                    state = 2;

                } else {
                    state = 1;
                }

                that.rawBytesReceived += 1;

            // Low
            } else if (state === 1) {

                if (b === 0xff) {

                    var buffer = new Buffer(frame);

                    frame = [];
                    state = 0;
                    that.bytesReceived += frameLength;
                    that.rawBytesReceived += 1 + frameLength;
                    frameLength = 0;

                    that.emit('data', buffer.toString('utf8'), false);

                } else {
                    frame.push(b);
                    frameLength++;
                }

            // High
            } else if (state === 2) {
                if (b === 0x00) {
                    that.close(true);
                }
            }

        }

    };

    function write(data) {

        var rawBytesSend = 0;
        if (that._socket.writable) {

            try {

                that._socket.write('\x00', 'ascii');

                if (data !== null) {

                    var dataLength = Buffer.byteLength(data);
                    that._socket.write(data, 'utf8');
                    rawBytesSend += dataLength;
                    that.bytesSend += dataLength;
                }

                that._socket.write('\xff', 'ascii');
                rawBytesSend += 2;
                that.rawBytesSend += rawBytesSend;

            } catch(e) {

            }

        }

        return rawBytesSend;

    }

    this.send = function(data, binary) {
        return write(data, binary);
    };

    this.close = function(remote) {
        write(null);
        that.end(remote);
    };

};


// WebSocket Server -----------------------------------------------------------
// ----------------------------------------------------------------------------
function Server() {

    EventEmitter.call(this);

    var that = this,
        connections = {};

    var server = new http.Server();

    server.on('request', function(req, res) {

        if (!('upgrade' in req.headers)) {
            that.emit('request', req, res);
        }

    });

    function connection(conn, req) {

        connections[conn.id] = conn;
        that.emit('connection', conn, req);

        conn.on('data', function(data, binary) {
            that.emit('data', conn, data, binary);
        });

        conn.on('end', function(remote) {
            delete connections[conn.id];
            that.emit('end', conn, remote);
        });

    }

    server.on('upgrade', function(req, socket, upgradeHeader) {

        var headers = req.headers;

        if (req.method === 'GET'
            && 'upgrade' in headers && 'connection' in headers
            && headers.upgrade.toLowerCase() === 'websocket'
            && headers.connection.toLowerCase().indexOf('upgrade') !== -1 ) {

            // Setup connection
            socket.setTimeout(0);
            socket.setNoDelay(true);
            socket.setKeepAlive(true, 0);

            // Hack to prevent Node <= 6.6 from timing out
            // the upgraded HTTP request
            socket.removeAllListeners('timeout');

            var conn = new Connection(req, socket, upgradeHeader);
            if (conn._connected) {
                connection(conn, req);
            }

        } else {
            socket.end();
            socket.destroy();
        }

    });

    this.broadcast = function(data, binary) {

        var bytes = 0;
        for(var c in connections) {
            bytes += connections[c].send(data, binary);
        }

        return bytes;

    };

    this.listen = function(port) {
        server.listen(port);
    };

}

util.inherits(Server, EventEmitter);

module.exports = Server;

