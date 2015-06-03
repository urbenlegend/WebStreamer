function NALStreamer(bitstream) {
	this.bitstream = new Uint8Array(bitstream);
	this.readpos = 0;
	
	this.isFinished = function() {
		if (this.readpos < bitstream.length - 3) {
			return false;
		}
		else {
			return true;
		}
	};
	
	this.getNAL = function() {
		var startpos;
		var endpos;
		while (this.readpos < bitstream.length - 3) {
			if (bitstream[this.readpos] == 0 &&
				bitstream[this.readpos + 1] == 0 &&
				bitstream[this.readpos + 2] == 0 &&
				bitstream[this.readpos + 3] == 1) {
				startpos = this.readpos;
				break;
			}
			this.readpos++;
		}
		while (this.readpos < bitstream.length - 3) {
			if (bitstream[this.readpos] == 0 &&
				bitstream[this.readpos + 1] == 0 &&
				bitstream[this.readpos + 2] == 0 &&
				bitstream[this.readpos + 3] == 1) {
				endpos = this.readpos;
				break;
			}
			this.readpos++;
		}
		return bitstream.subarray(startpos,endpos);
	};
}