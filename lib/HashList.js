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
function HashList(max) {
    this.maximum = max || -1;
    this.clear();
}


HashList.prototype = {

    // General Methods ---------------------------------------------------------
    clear: function() {
        this.hash = {};
        this.items = [];
        this.length = 0;
    },

    full: function() {
        return this.maximum === -1 ? false : this.length === this.maximum;
    },

    // Index based Methods -----------------------------------------------------
    contains: function(item) {
        return this.items.indexOf(item) !== -1;
    },

    indexOf: function(item) {
        return this.items.indexOf(item);
    },

    at: function(index) {
        return this.items[index];
    },

    // ID based methods --------------------------------------------------------
    has: function(obj) {

        if (typeof obj !== 'object') {
            return obj in this.hash;

        } else {
            return obj.id in this.hash;
        }

    },

    get: function(obj) {

        if (typeof obj !== 'object') {
            return this.hash[obj];

        } else {
            return this.hash[obj.id];
        }

    },

    add: function(obj) {

        if (!this.has(obj) && !this.full()) {

            this.hash[obj.id] = obj;
            this.items.push(obj);
            this.length++;
            return true;

        } else {
            return false;
        }

    },

    put: function(id, obj) {

        if (!this.has(id) && !this.full()) {

            this.hash[id] = obj;
            this.items.push(obj);
            this.length++;
            return true;

        } else {
            return false;
        }

    },

    remove: function(obj) {

        if (this.has(obj)) {

            this.items.splice(this.items.indexOf(this.hash[obj.id]), 1);
            delete this.hash[obj.id];
            this.length--;
            return true;

        } else {
            return false;
        }

    },

    // Sorting -----------------------------------------------------------------
    sort: function(func) {
        this.items.sort(func);
        return this;
    },

    // Iteration ---------------------------------------------------------------
    each: function(cb, scope) {

        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this.items[i];

            if (cb.call(scope || item, item)) {
                return true;
            }

            if (this.length < oldLength) {
                i--;
            }

        }

    },

    map: function(cb, scope) {

        var result = [];
        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this.items[i];

            result.push(cb.call(scope || item, item));

            if (this.length < oldLength) {
                i--;
            }

        }

        return result;

    },

    eachIn: function(items, cb, scope) {

        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this.items[i];

            if (items.indexOf(item) !== -1) {

                if (cb.call(scope || item, item)) {
                    return true;
                }

                if (this.length < oldLength) {
                    i--;
                }

            }

        }

    },

    eachNot: function(items, cb, scope) {

        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this.items[i];

            if (items.indexOf(item) === -1) {

                if (cb.call(scope || item, item)) {
                    return true;
                }

                if (this.length < oldLength) {
                    i--;
                }

            }
        }

    },

    eachCall: function(method) {

        for(var i = 0; i < this.length; i++) {
            this.items[i][method]();
        }

    },

    eachEach: function(check, func, after, scope) {

        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this.items[i];

            if (check.call(scope || item, item)) {

                for(var e = i + 1;; e++) {

                    var oldLengthInner = this.length;
                    if (e === this.length) {
                        e = 0;
                    }
                    if (e === i) {
                        break;
                    }

                    var itemInner = this.items[e];
                    if (func.call(scope || itemInner, item, itemInner)) {
                        break;
                    }
                    if (this.length < oldLengthInner) {
                        e--;
                    }
                }

                after.call(scope || item, item);
            }

            if (this.length < oldLength) {
                i--;
            }

        }

    },

    toString: function() {

        var list = [];
        for(var i = 0; i < this.length; i++) {
            list.push('[' + this.items[i].id + ']');
        }

        return list.join(', ');

    }

};

// Export
if (typeof window === 'undefined') {
    module.exports = HashList;
}

