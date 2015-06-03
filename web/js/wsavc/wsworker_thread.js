var ws;

self.onmessage = function(worker_msg) {
	if (worker_msg.data.type == "connect") {
		ws = new WebSocket(worker_msg.data.url);

		ws.binaryType = "arraybuffer";
		ws.onopen = function() {
			self.postMessage({"type":"connect_ok"});
		}
		ws.onmessage = function (evt) {
			self.postMessage({"type":"message", "payload":evt.data});
		}
		ws.onclose = function()	{ 
			self.postMessage({"type":"close"});
		};
	}
	else if (worker_msg.data.type == "sendmsg") {
		ws.send(worker_msg.data.payload);
	}
};