function CircularBuffer(buffersize) {
	this.readpos = 0;
	this.writepos = 0;
	this.writeloop = false;	
	this.buffer = new Uint8Array(buffersize);
	
	this.write = function(data) {
		if (data.length > this.buffer.length - this.getLength()) {
			console.log("CircularBuffer: Data to be written is too big for buffer");
			return;
		}
		// If the write position has looped back to the beginning
		// behind the read position
		if (this.writeloop) {
			this.buffer.set(data, this.writepos);
		}
		else {
			// Split data into two parts: one part for writing to end of buffer,
			// another part for looping back to the beginning
			// If second part is zero because all data has already been written
			// then it will write nothing
			var data1 = data.subarray(0, this.buffer.length - this.writepos);
			var data2 = data.subarray(data1.length);
			this.buffer.set(data1, this.writepos);
			this.buffer.set(data2, 0);			
		}
		// Set writeloop variable if writepos has looped back
		if (this.writepos + data.length >= this.buffer.length) {
			this.writeloop = true;
		}
		// Set new write position
		this.writepos = (this.writepos + data.length) % this.buffer.length;
		// Call onwrite callback
		if (this.onwrite != undefined) {
			this.onwrite();
		}
	}
	
	this.read = function(numbytes) {
		// Get data
		var read = this.peek(numbytes);
		// Move read position
		this.discard(read.length);
		
		return read;
	}
	
	// Moves readpos by numbytes
	this.discard = function(numbytes) {
		// Set writeloop variable if writepos has looped back
		if (this.readpos + numbytes >= this.buffer.length) {
			this.writeloop = false;
		}
		// Modify read position
		this.readpos = (this.readpos + numbytes) % this.buffer.length;
	}
	
	// Reads numbytes from buffer without increasing readpos
	this.peek = function(numbytes) {
		var read;
		// If the write position has looped back to the beginning
		// behind the read position
		if (this.writeloop) {
			// If reading numbytes will cause the read to loop back to the
			// beginning of the buffer
			if (this.readpos + numbytes > this.buffer.length) {
				// Slice the buffer from readpos to end of buffer
				var read1 = this.buffer.subarray(this.readpos);
				// Loopback and slice the beginning part of the buffer
				var read2 = this.buffer.subarray(0, Math.min(this.writepos, numbytes - read1.length));
				
				// Append the two buffers read
				read = new Uint8Array(read1.length + read2.length);
				read.set(read1);
				read.set(read2, read1.length);
			}
			// If reading numbytes will not cause the read to loopback
			else {
				read = this.buffer.subarray(this.readpos, this.readpos + numbytes);
			}
		}
		// If read position is behind write position
		else {
			read = this.buffer.subarray(this.readpos, Math.min(this.readpos + numbytes, this.writepos));
		}
		
		return read;
	}
	
	this.getLength = function() {
		if (this.writeloop) {
			return (this.buffer.length - this.readpos) + this.writepos;
		}
		else {
			return this.writepos - this.readpos;
		}
	}
}
