function WSAvcPlayer(canvas, canvastype, nals, delay) {
	// WebGL canvas initalization
	this.canvas = canvas;
	this.nals = nals;
	this.delay = delay;
	if (canvastype == "webgl") {
		this.webGLCanvas = new YUVWebGLCanvas(this.canvas, new Size(canvas.width, canvas.height));
		this.onPictureDecoded = onPictureDecodedWebGL.bind(this);
	}
	else if (canvastype == "canvas") {
		this.onPictureDecoded = onPictureDecodedCanvas.bind(this);
		this.canvasCtx = this.canvas.getContext("2d");
		this.canvasBuffer = this.canvasCtx.createImageData(this.canvas.width, this.canvas.height);
	}
	// AVC codec initialization
	this.avc = new Worker("js/wsavc_thread.js");
	this.avc.onmessage = function(event) {
		if (event.data.type == "videodata") {
			this.onPictureDecoded(event.data.buffer, event.data.width, event.data.height);
		}
		else if (event.data.type == "log") {
			console.log(event.data.message);
		}
	}.bind(this);
	//WebSocket variables
	this.ws;
	this.pktnum = 0;
	
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
		
		//var date = new Date();
		//console.log("Decode time: " + (date.getTime() - this.rcvtime) + " ms");
		//console.log("WSAvcPlayer: DECODING!");
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
		//console.log("Decode time: " + (date.getTime() - this.rcvtime) + " ms");
		//console.log("WSAvcPlayer: DECODING!");
	}

	this.decode = function(data) {
		/* Decode Pictures */
		this.avc.postMessage({"type":"decode", "payload":new Uint8Array(data)});
	};
	
	this.connect = function(url) {
		// If using web workers initialize WSWorker instead of WebSocket directly
		console.log("WSAvcPlayer: Creating new web worker for Websocket")
		this.ws = new WSWorker(url);
		this.ws.onopen = function() {
			console.log("WSAvcPlayer: Connected to " + url);
			var message = "REQUESTSTREAM " + this.nals + "NAL " + this.delay + "MS";
			this.ws.send(message);
			console.log("WSAvcPlayer: Sent " + message);
		}.bind(this);
		this.ws.onclose = function() { 
			// websocket is closed.
			console.log("WSAvcPlayer: Connection closed")
		};
		this.ws.onmessage = function (msg) {
			this.pktnum++;
			//console.log("WSAvcPlayer: Pkt " + this.pktnum + ": Received " + msg.byteLength + " bytes");
			this.decode(msg);
		}.bind(this);
	}
}