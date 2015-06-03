function XHRAvcPlayer(canvas, canvastype, delay) {
	var defaultConfig = {
		filter: "original",
		filterHorLuma: "optimized",
		filterVerLumaEdge: "optimized",
		getBoundaryStrengthsA: "optimized"
	};
	// WebGL canvas initalization
	this.canvas = canvas;
	this.delay = delay;
	// AVC codec initialization
	this.avc = new Avc();
	this.avc.configure(defaultConfig);
	if (canvastype == "webgl") {
		this.webGLCanvas = new YUVWebGLCanvas(this.canvas, new Size(canvas.width, canvas.height));
		this.avc.onPictureDecoded = onPictureDecodedWebGL.bind(this);
	}
	else if (canvastype == "canvas") {
		this.avc.onPictureDecoded = onPictureDecodedCanvas.bind(this);
		this.canvasCtx = this.canvas.getContext("2d");
		this.canvasBuffer = this.canvasCtx.createImageData(this.canvas.width, this.canvas.height);
	}
	// Timing information
	this.decodestart;
	
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
		//console.log("Decode time: " + (date.getTime() - this.decodestart) + " ms");
		//console.log("XHRAvcPlayer: DECODING!");
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
		//console.log("Decode time: " + (date.getTime() - this.decodestart) + " ms");
		//console.log("XHRAvcPlayer: DECODING!");
	}
	
	this.connect = function(url) {
		var xhr = new XMLHttpRequest();
		var async = true;
		xhr.open("GET", url, async);
		xhr.responseType = "arraybuffer";
		xhr.onreadystatechange = function (event) {
			if (xhr.readyState === 4) {
				var nalstream = new NALStreamer(xhr.response);
				while (!nalstream.isFinished()) {
					setTimeout(this.avc.decode(nalstream.getNAL()), delay);
				}
			}
		}.bind(this);
		xhr.send(null);
	}
}
