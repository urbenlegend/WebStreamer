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
	this.fu_buffer = new CircularBuffer(this.packets * 100000);
	
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
		if (data.length > 1) {
			if (data[0] == 0x65) {
				naltype = "I frame";
			}
			else if (data[0] == 0x41) {
				naltype = "P frame";
			}
			else if (data[0] == 0x67) {
				naltype = "SPS";
			}
			else if (data[0] == 0x68) {
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
			console.log("WSAvcPlayer: [Pkt " + this.pktnum + " (" + evt.data.byteLength + " bytes)]");
			// Set time variable for checking decoding speed
			var date = new Date();
			this.rcvtime = date.getTime();
			var rtp = parseRTP(new Uint8Array(evt.data))
			var h264payload = parseH264(rtp.payload);
			if (h264payload.hdr.type >= 1 && h264payload.hdr.type <= 23) {
				// This is a single unit RTP packet. Send to decoder immediately
				this.decode(h264payload.array);
			}
			else if (h264payload.hdr.type == 24 || h264payload.hdr.type == 25) {
				// This is a STAP
				// Send all NALS to decoder one by one
			}
			else if (h264payload.hdr.type == 26 || h264payload.hdr.type == 27) {
				// This is a MTAP
				// Sort NALS in terms of DON and then send to decoder
			}
			else if (h264payload.hdr.type == 28 || h264payload.hdr.type == 29) {
				// This is a FU
				// Send NAL fragments to buffer. Flush buffer when end code is received.
				if (h264payload.fu_hdr.s == 1) {
					// Flush accumulation buffer on fragment start
					this.fu_buffer.discard(this.fu_buffer.getLength());
					// Create unfragmented NAL unit header
					var nalhdr = new Uint8Array(1);
					nalhdr[0] = h264payload.hdr.f << 7 | h264payload.hdr.nri << 5 | h264payload.fu_hdr.type;
					this.fu_buffer.write(nalhdr);
					this.fu_buffer.write(h264payload.fragment);
				}
				else {
					if (this.fu_buffer.getLength() != 0) {
						// Only write non-start fragments if start fragment and other fragments have already been received
						this.fu_buffer.write(h264payload.fragment);
						if (h264payload.fu_hdr.e == 1) {
							this.decode(this.fu_buffer.read(this.fu_buffer.getLength()));
						}
					}
				}
			}
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