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
(function() {

    // Maple itself will always use negative numbers
    // So games are free to make use of any positive value they like
    var Message = {
        CONNECT: -1,
        START: -2,
        STOP: -3,
        ERROR: -4,
        SYNC: -5
    };

    var Error = {
        INVALID_DATA: -1,
        MESSAGE_TOO_SHORT: -2,
        ALREADY_CONNECTED: -3,
        UNSUPPORTED_VERSION: -4
    };

    // Switch between Server and Client
    if (typeof window === 'undefined') {

        module.exports = {
            Server: null,
            Message: Message,
            Error: Error
        };

        module.exports.ObjectList = require('./lib/ObjectList');
        module.exports.Class = require('./lib/Class').Class;
        require('./Server');

    } else {
        window.Maple = {
            Message: Message,
            Error: Error
        };
    }

})();

