importScripts('util.js');
importScripts('worker.js');
importScripts('avc-codec.js');
importScripts('avc.js');

var console = {info: function (message) {
	self.postMessage({"type":"log", "message":message});
}};

// AVC codec initialization
self.avc = new Avc();
self.avc.configure({
	filter: "original",
	filterHorLuma: "optimized",
	filterVerLumaEdge: "optimized",
	getBoundaryStrengthsA: "optimized"
});
self.avc.onPictureDecoded = function(buffer, width, height) {
	self.postMessage({"type":"videodata", "buffer":buffer, "width":width, "height":height});
};

self.onmessage = function(worker_msg) {
	if (worker_msg.data.type == "decode") {
		self.avc.decode(worker_msg.data.payload);
	}
};