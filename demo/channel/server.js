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
var Maple = require('../../Maple');


// Test -----------------------------------------------------------------------
var TestServer = Maple.Class(function() {

    Maple.Server(this, null, [ 'channel', 'message' ]);
    
    this.addChannel(new Maple.ServerChannel("channel1", this));
    this.addChannel(new Maple.ServerChannel("channel2", this));

}, Maple.Server, {
    
    assignChannel : function(client){
    	//default assign to channel 1
    	return this.getChannel("channel1");
    },
    
    message: function(client, type, tick, data) {
    	if(type == 'channel'){
    		console.log(data[0].channelId)
    		this.reassignChannel(client, data[0].channelId);
    		return;
    	}
    	this.broadcastChannel("message", data, client._conn.channelId);
    },
});



var srv = new TestServer();
srv.start({
    port: 4000,
    logicRate: 10 // only update logic every 10 ticks
});

