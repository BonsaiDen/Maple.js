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
(this.window || exports).Class = function BaseClass(ctor) {

    var c = 'constructor',
        func = BaseClass[c],
        call = BaseClass.call,
        i = 0, key,
        p, value,
        basic;

    // Class constructor
    // Using new creates a new instance as usual
    // omitting it will act like a Super() constructor where the first
    // argument is the instance of the subclass
    var clas = function() {

        // figure out whether ctor is another class or a function
        i = (value = ctor && ctor[c]) == BaseClass;
        if (value == func || i) {
            // check the context of the call:
            // i = true, it's either a new call or a unbound call to a parent class constructor
            // i = false, unbound ctor call
            i = this[c] == BaseClass || i;
            (i ? ctor : call).apply(i ? this : ctor, arguments);
        }

    };

    // Makes the instanceof check below... work...
    // evil trickery to get rid of another global Function for the
    // "base" class of all classes
    var proto = clas.prototype,
        $proto = clas.$$ = {};

    // set prototype constructor to BaseClass this way we can identify classes
    clas[c] = proto[c] = BaseClass;

    // Extend with members and base classes
    while((p = arguments[i++])) {

        // Here we go... this stuff can't be inlined automatically
        for(key in (value = p.prototype)
                    && value[c] == BaseClass ? p = p.$$ : p) {

            value = $proto[key] = p[key];

            // $ prefixed stuff is static
            // re-use p here to save a few more bytes
            basic = key[0] != '$' && (proto[key] = value);

            // Create unbound versions of the methods
            clas[key] = (value[c] == func)

                    ? (function(context, callee) {
                        return function() {
                            return callee.apply(context, arguments);
                        };

                    }(basic ? value : clas, basic ? call : value))

                : value;

        }

    }

    return clas;

};

