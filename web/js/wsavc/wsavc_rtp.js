function WSAvcPlayer(canvas, canvastype, packets, delay) {
	this.canvas = canvas;
	this.packets = packets;
	this.delay = delay;
	// AVC codec initialization
	this.avc = new Avc();
	this.avc.configure({
		filter: "original",
		filterHorLuma: "optimized",
		filterVerLumaEdge: "optimized",
		getBoundaryStrengthsA: "optimized"
	});
	if (canvastype == "webgl") {
		this.webGLCanvas = new YUVWebGLCanvas(this.canvas, new Size(canvas.width, canvas.height));
		this.avc.onPictureDecoded = onPictureDecodedWebGL.bind(this);
	}
	else if (canvastype == "canvas") {
		this.avc.onPictureDecoded = onPictureDecodedCanvas.bind(this);
		this.canvasCtx = this.canvas.getContext("2d");
		this.canvasBuffer = this.canvasCtx.createImageData(this.canvas.width, this.canvas.height);
	}
	//WebSocket variables
	this.ws;
	this.pktnum = 0;
	this.rcvtime;
	// Buffer the previous frame just in case for resend
	this.prevframe;
	// RTP variables
	this.bufferpos = 0;
	this.nalcount = 0;
	this.nalpos = new Array();
	this.rtpbuffer = new CircularBuffer(this.packets * 100000);
	this.rtpbuffer.onwrite = function() {
		var data = this.rtpbuffer.peek(this.rtpbuffer.getLength());
		// Check for the first two NAL headers and push them to an array
		for (; this.bufferpos < data.length; this.bufferpos++) {
			if (this.nalcount < 3 && data[this.bufferpos] == 0) {
				this.nalcount++;
			}
			else if (this.nalcount == 3 && data[this.bufferpos] == 1) {
				this.nalcount++;
			}
			else {
				this.nalcount = 0;
			}
			if (this.nalcount == 4) {
				// Push NAL position to array if we detect a NAL
				this.nalpos.push(this.bufferpos - 3);
				this.nalcount = 0;
			}
			if (this.nalpos.length == 2) {
				// Discard all garbage data before NAL start
				this.rtpbuffer.discard(this.nalpos[0]);
				// Grab all NAL data after NAL start until the next NAL header
				this.decode(this.rtpbuffer.read(this.nalpos[1] - this.nalpos[0]));
				// Reset buffer position and NAL position array because we have
				// extracted data from buffer already. Get new data array using peek
				this.bufferpos = -1;
				this.nalpos.splice(0);
				data = this.rtpbuffer.peek(this.rtpbuffer.getLength());
			}
		}
		
	}.bind(this);
	
	function onPictureDecodedWebGL(buffer, width, height) {
		if (!buffer) {
			return;
		}
		var lumaSize = width * height;
		var chromaSize = lumaSize >> 2;

		this.webGLCanvas.YTexture.fill(buffer.subarray(0, lumaSize));
		this.webGLCanvas.UTexture.fill(buffer.subarray(lumaSize, lumaSize + chromaSize));
		this.webGLCanvas.VTexture.fill(buffer.subarray(lumaSize + chromaSize, lumaSize + 2 * chromaSize));
		this.webGLCanvas.drawScene();
		
		var date = new Date();
		console.log("WSAvcPlayer: Decode time: " + (date.getTime() - this.rcvtime) + " ms");
	}
	
	function onPictureDecodedCanvas(buffer, width, height) {
		if (!buffer) {
			return;
		}
		var lumaSize = width * height;
		var chromaSize = lumaSize >> 2;
		
		var ybuf = buffer.subarray(0, lumaSize);
		var ubuf = buffer.subarray(lumaSize, lumaSize + chromaSize);
		var vbuf = buffer.subarray(lumaSize + chromaSize, lumaSize + 2 * chromaSize);
		
		for (var y = 0; y < height; y++) {
			for (var x = 0; x < width; x++) {
				var yIndex = x + y * width;
				var uIndex = ~~(y / 2) * ~~(width / 2) + ~~(x / 2);
				var vIndex = ~~(y / 2) * ~~(width / 2) + ~~(x / 2);
				var R = 1.164 * (ybuf[yIndex] - 16) + 1.596 * (vbuf[vIndex] - 128);
				var G = 1.164 * (ybuf[yIndex] - 16) - 0.813 * (vbuf[vIndex] - 128) - 0.391 * (ubuf[uIndex] - 128);
				var B = 1.164 * (ybuf[yIndex] - 16) + 2.018 * (ubuf[uIndex] - 128);
				
				var rgbIndex = yIndex * 4;
				this.canvasBuffer.data[rgbIndex+0] = R;
				this.canvasBuffer.data[rgbIndex+1] = G;
				this.canvasBuffer.data[rgbIndex+2] = B;
				this.canvasBuffer.data[rgbIndex+3] = 0xff;
			}
		}
		
		this.canvasCtx.putImageData(this.canvasBuffer, 0, 0);
		
		//var date = new Date();
		//console.log("WSAvcPlayer: Decode time: " + (date.getTime() - this.rcvtime) + " ms");
	}

	this.decode = function(data) {
		var naltype = "invalid frame";
		if (data.length > 4) {
			if (data[4] == 0x65) {
				naltype = "I frame";
			}
			else if (data[4] == 0x41) {
				naltype = "P frame";
			}
			else if (data[4] == 0x67) {
				naltype = "SPS";
			}
			else if (data[4] == 0x68) {
				naltype = "PPS";
			}
		}
		console.log("WSAvcPlayer: Passed a " + data.length + " byte " + naltype + " to decoder");
		/* Decode Pictures */
		this.avc.decode(data);
		this.ws.send(data.buffer.slice(data.byteOffset, data.length));
	};
	
	this.connect = function(url) {		
		// Websocket initialization
		if (this.ws != undefined) {
			this.ws.close();
			delete this.ws;
		}
		this.ws = new WebSocket(url);
		this.ws.binaryType = "arraybuffer";
		this.ws.onopen = function() {
			console.log("WSAvcPlayer: Connected to " + url);
		}.bind(this);
		this.ws.onmessage = function(evt) {
			this.pktnum++;
			// Set time variable for checking decoding speed
			var date = new Date();
			this.rcvtime = date.getTime();
			var rtp = parseRTP(new Uint8Array(evt.data))
			var h264payload = parseH264(rtp.payload);
			
			//this.rtpbuffer.write(rtp.payload);
			
			console.log("WSAvcPlayer: [Pkt " + this.pktnum + " (" + evt.data.byteLength + " bytes)]");			
		}.bind(this);
		this.ws.onclose = function()	{ 
			// websocket is closed.
			console.log("WSAvcPlayer: Connection closed")
		};
	};
	
	this.disconnect = function() {
		this.ws.close();
	};
	
	this.playStream = function() {
		var message = "REQUESTSTREAM " + this.packets + "RTP " + this.delay + "MS";
		this.ws.send(message);
		console.log("WSAvcPlayer: Sent " + message);
	};
	
	this.stopStream = function() {
		this.ws.send("STOPSTREAM");
		console.log("WSAvcPlayer: Sent STOPSTREAM");
	}
	
	this.playChunk = function() {
		var message = "REQUEST " + this.packets + "RTP";
		this.ws.send(message);
		console.log("WSAvcPlayer: Sent " + message);
	};
	
	this.flush = function() {
		console.log("Flush: " + this.prevframe.length);
		this.decode(this.prevframe);
	};
}