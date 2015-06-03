function WSWorker(url) {
	this.worker = new Worker("js/wsworker_thread.js");
	this.worker.onmessage = function(event) {
		if (event.data.type == "message") {
			this.onmessage(event.data.payload);
		}
		else if (event.data.type == "connect_ok") {
			this.onopen();
		}
		else if (event.data.type == "close") {
			this.onclose();
		}
		else if (event.data.type == "log") {
			console.log(event.data.message);
		}
	}.bind(this);
	this.worker.postMessage({"type":"connect", "url":url});
	
	this.send = function(message) {
		this.worker.postMessage({"type":"sendmsg", "payload":message});
	};
}