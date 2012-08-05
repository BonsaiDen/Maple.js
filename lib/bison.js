/**
  * Copyright (c) 2009-2011 Ivo Wetzel.
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
(function(Array, undefined) {
    "use strict";

    var BitStream = (function() {

        // Some lookup tables
        var chrTable = new Array(255);
        for(var i = 0; i < 256; i++) {
            chrTable[i] = String.fromCharCode(i);
        }

        var maskTable = new Array(9),
            powTable = new Array(9);

        for(var f = 0; f < 9; f++) {
            maskTable[f] = ~((powTable[f] = Math.pow(2, f) - 1) ^ 0xFF);
        }

        var stream = null,
            value = 0,
            left = 8,
            readIndex = 0,
            streamLength = 0;

        return {

            open: function(data) {

                left = 8;

                // Reading
                if (data !== undefined) {
                    streamLength = data.length;
                    readIndex = 0;
                    stream = data;
                    value = stream.charCodeAt(readIndex);

                // Writing
                } else {
                    value = 0;
                    stream = '';
                }

            },

            close: function() {

                if (value > 0) {
                    stream += chrTable[value];
                }

                return stream;

            },

            write: function write(val, count) {

                var overflow = count - left,
                    use = left < count ? left : count,
                    shift = left - use;

                if (overflow > 0) {
                    value += val >> overflow << shift;

                } else {
                    value += val << shift;
                }

                left -= use;

                if (left === 0) {

                    stream += chrTable[value];
                    left = 8;
                    value = 0;

                    if (overflow > 0) {
                        write(val & powTable[overflow], overflow);
                    }

                }

            },

            writeRaw: function(raw) {

                if (left !== 8) {
                    stream += chrTable[value];
                    value = 0;
                    left = 8;
                }

                stream += raw;
            },

            read: function read(count) {

                if (readIndex >= streamLength) {
                    return null;
                }

                var overflow = count - left,
                    use = left < count ? left : count,
                    shift = left - use;

                // Wrap bits over to next byte
                var val = (value & maskTable[left]) >> shift;
                left -= use;

                if (left === 0) {

                    value = stream.charCodeAt(++readIndex);
                    left = 8;

                    if (overflow > 0) {
                        val = val << overflow | read(overflow);
                    }

                }

                return val;

            },

            readRaw: function(count) {

                if (left !== 8) {
                    readIndex++;
                    value = 0;
                    left = 8;
                }

                var data = stream.substr(readIndex, count);

                readIndex += count;
                value = stream.charCodeAt(readIndex);
                return data;

            }

        };

    })();

    // Shorthands
    var write = BitStream.write,
        read = BitStream.read,
        writeRaw = BitStream.writeRaw,
        readRaw = BitStream.readRaw,
        open = BitStream.open,
        close = BitStream.close;

    // Encoder ----------------------------------------------------------------
    function _encode(value, top) {

        // Numbers
        if (typeof value === 'number') {

            var type = value !== (value | 0),
                sign = 0;

            if (value < 0) {
                value = -value;
                sign = 1;
            }

            write(1 + type, 3);

            // Float
            if (type) {

                // Figure out how much we left shift we need
                // to get a integer
                var shift = 1,
                    step = 10;

                while(step <= value) {
                    shift++;
                    step *= 10;
                }

                // Make sure that we don't lose precision
                shift = (8 - shift) + 1;
                value = Math.round(value * (1000000000 / step));

                // Figure out the smallest exp for value
                while(value / 10 === ((value  / 10) | 0)) {
                    value /= 10;
                    shift--;
                }

            }

            // 2 size 0-3: 0 = < 16 1 = < 256 2 = < 65536 3 >
            if (value < 2) {
                write(value, 4);

            } else if (value < 16) {
                write(1, 3);
                write(value, 4);

            } else if (value < 256) {
                write(2, 3);
                write(value, 8);

            } else if (value < 4096) {
                write(3, 3);
                write(value >> 8 & 0xff, 4);
                write(value & 0xff, 8);

            } else if (value < 65536) {
                write(4, 3);
                write(value >> 8 & 0xff, 8);
                write(value & 0xff, 8);

            } else if (value < 1048576) {
                write(5, 3);
                write(value >> 16 & 0xff, 4);
                write(value >> 8 & 0xff, 8);
                write(value & 0xff, 8);

            } else if (value < 16777216) {
                write(6, 3);
                write(value >> 16 & 0xff, 8);
                write(value >> 8 & 0xff, 8);
                write(value & 0xff, 8);

            } else {
                write(7, 3);
                write(value >> 24 & 0xff, 8);
                write(value >> 16 & 0xff, 8);
                write(value >> 8 & 0xff, 8);
                write(value & 0xff, 8);
            }

            write(sign, 1);

            if (type) {
                write(shift, 4);
            }

        // Strings
        } else if (typeof value === 'string') {

            var len = value.length;
            write(3, 3);

            if (len > 65535) {
                write(31, 5);
                write(len >> 24 & 0xff, 8);
                write(len >> 16 & 0xff, 8);
                write(len >> 8 & 0xff, 8);
                write(len & 0xff, 8);

            } else if (len > 255) {
                write(30, 5);
                write(len >> 8 & 0xff, 8);
                write(len & 0xff, 8);

            } else if (len > 28) {
                write(29, 5);
                write(len, 8);

            } else {
                write(len, 5);
            }

            writeRaw(value);

        // Booleans
        } else if (typeof value === 'boolean') {
            write(+value, 4);

        // Null
        } else if (value === null) {
            write(7, 3);
            write(0, 1);

        // Arrays
        } else if (value instanceof Array) {

            write(4, 3);
            for(var i = 0, l = value.length; i < l; i++) {
                _encode(value[i]);
            }

            if (!top) {
                write(6, 3);
            }

        // Object
        } else {

            write(5, 3);
            for(var e in value) {
                _encode(e);
                _encode(value[e]);
            }

            if (!top) {
                write(6, 3);
            }

        }

    }

    function encode(value) {
        open();
        _encode(value, true);
        write(7, 3);
        write(1, 1);
        return close();
    }

    // Another lookup table
    var powTable = new Array(16);
    for(var i = 0; i < 16; i++) {
        powTable[i] = Math.pow(10, i);
    }


    // Decoder ----------------------------------------------------------------
    function decode(string) {

        var stack = [], i = -1, decoded,
            type, top, value,
            obj, getKey = false, key, isObj;

        open(string);
        while(true) {

            // Grab type
            type = read(3);

            switch(type) {

            // Bool
            case 0:
                value = read(1);
                break;

            // Null / EOS
            case 7:
                if (read(1)) {
                    return decoded;

                } else {
                    value = null;
                }

                break;

            // Integer / Float
            case 1:
            case 2:
                switch(read(3)) {
                    case 0:
                        value = read(1);
                        break;

                    case 1:
                        value = read(4);
                        break;

                    case 2:
                        value = read(8);
                        break;

                    case 3:
                        value = (read(4) << 8)
                                + read(8);

                        break;

                    case 4:
                        value = (read(8) << 8)
                                + read(8);

                        break;

                    case 5:
                        value = (read(4) << 16)
                                + (read(8) << 8)
                                + read(8);

                        break;

                    case 6:
                        value = (read(8) << 16)
                                + (read(8) << 8)
                                + read(8);

                        break;

                    case 7:
                        value = (read(8) << 24)
                                + (read(8) << 16)
                                + (read(8) << 8)
                                + read(8);

                        break;
                }

                if (read(1)) {
                    value = -value;
                }

                if (type === 2) {
                    value /= powTable[read(4)];
                }

                break;

            // String
            case 3:

                var size = read(5);
                switch(size) {
                    case 31:
                        size = (read(8) << 24)
                               + (read(8) << 16)
                               + (read(8) << 8)
                               + read(8);

                        break;

                    case 30:
                        size = (read(8) << 8)
                               + read(8);

                        break;

                    case 29:
                        size = read(8);
                        break;

                }

                value = readRaw(size);

                if (getKey) {
                    key = value;
                    getKey = false;
                    continue;
                }

                break;

            // Open Array / Objects
            case 4:
            case 5:
                getKey = type === 5;
                value = getKey ? {} : [];

                if (decoded === undefined) {
                    decoded = value;

                } else {

                    if (isObj) {
                        top[key] = value;

                    } else {
                        top.push(value);
                    }
                }

                top = stack[++i] = value;
                isObj = !(top instanceof Array);
                continue;

            // Close Array / Object
            case 6:
                top = stack[--i];
                getKey = isObj = !(top instanceof Array);
                continue;
            }

            // Assign value to top of stack or return value
            if (isObj) {
                top[key] = value;
                getKey = true;

            } else if (top !== undefined) {
                top.push(value);

            } else {
                return value;
            }

        }

    }

    // Exports
    if (typeof window === 'undefined') {
        exports.encode = encode;
        exports.decode = decode;

    } else {
        window.BISON = {
            encode: encode,
            decode: decode
        };
    }

})(Array);

