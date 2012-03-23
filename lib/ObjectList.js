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

/**
  * {ObjectList} A general purpose list/map combination for managing objects.
  */
function ObjectList() {

    this._map = {};
    this._list = [];
    this._uid = '__HashList_' + (++ObjectList._uid) + '_' + Math.random();
    this._objId = 0;

    this.length = 0;

}

ObjectList._uid = 0;

ObjectList.prototype = {

    // General utility --------------------------------------------------------
    clear: function() {

        for(var i = 0, l = this._list.length; i < l; i++) {
            this._remove(this._list[i]);
        }

        this._list.length = 0;

    },

    has: function(item) {
        return item.hasOwnProperty(this._uid);
    },

    id: function(item) {

        if (this.has(item)) {
            return item[this._uid];

        } else {
            return null;
        }

    },

    // Array based methods ----------------------------------------------------
    indexOf: function(item) {
        return this._list.indexOf(item);
    },

    addAt: function(index, item) {

        console.log(index, this.length);
        if (index < 0 || index > this.length) {
            throw new Error('Index out of range.');
        }

        this._list.splice(index, 0, item);
        return this._add(item, false);

    },

    getAt: function(index) {

        if (index < 0 || index > this.length - 1) {
            return null;

        } else  {
            return this._list[index];
        }

    },

    removeAt: function(index) {

        if (index < 0 || index > this.length - 1) {
            throw new Error('Index out of range.');
        }

        return this._remove(this._list.splice(index, 1)[0], false);

    },

    sort: function(cmp) {
        this._list.sort(cmp);
    },

    reverse: function() {
        this._list.reverse();
    },


    // Object based methods ---------------------------------------------------
    add: function(item) {
        return this._add(item, true);
    },

    get: function(id) {

        if (this._map.hasOwnProperty(id)) {
            return this._map[id];

        } else {
            return null;
        }

    },

    remove: function(item) {
        return this._remove(item, true);
    },


    // Iteration --------------------------------------------------------------
    forEach: function(callback, scope) {

        for(var i = 0; i < this.length; i++) {

            var oldLength = this.length,
                item = this._list[i];

            callback.call(scope || item, item);

            if (this.length < oldLength) {
                i--;
            }

        }

    },


    // Low level utility ------------------------------------------------------
    _add: function(item, toList) {

        if (typeof item !== 'object') {
            throw new Error('Object to be added is not an object.');

        } else if (item.hasOwnProperty(this._uid)) {
            throw new Error('Object to be added is already in list.');

        } else {

            this._objId++;

            Object.defineProperty(item, this._uid, {
                value: this._objId,
                configurable: true,
                enumerable: false
            });

            this.length++;

            this._map[this._objId] = item;
            if (toList) {
                this._list.push(item);
            }

            return this._objId;

        }

    },

    _remove: function(item, fromList) {

        if (typeof item !== 'object') {
            throw new Error('Object to be removed is not an object.');

        } else if (!item.hasOwnProperty(this._uid)) {
            throw new Error('Object to be remove is not list.');

        } else {

            if (fromList) {
                this._list.splice(this._list.indexOf(item), 1);
            }

            this.length--;

            var objId = item[this._uid];
            delete this._map[objId];
            delete item[this._uid];

            return objId;

        }

    }

};


// Export
if (typeof window === 'undefined') {
    module.exports = ObjectList;
}

