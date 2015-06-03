function parseRTP(packet) {
	var rtpdata = new Object();
	
	// Parse fixed header data
	rtpdata.version = packet[0] >>> 6;
	rtpdata.padding = (packet[0] & 0x20) >>> 5;
	rtpdata.extbit = (packet[0] & 0x10) >>> 4;
	rtpdata.csrccount = packet[0] & 0xF;
	rtpdata.markerbit = packet[1] >>> 7;
	rtpdata.payloadtype = packet[1] & 0x7F;
	rtpdata.seqnum = packet[2] << 8 | packet[3];
	rtpdata.timestamp = packet[4] << 24 | packet[5] << 16 | packet[6] << 8 | packet[7];
	rtpdata.ssrc = packet[8] << 24 | packet[9] << 16 | packet[10] << 8 | packet[11];
	
	// Parse csrc values into an array
	var headerend = 12;
	rtpdata.csrcs = new Array();
	for (var i = 0; i < rtpdata.csrccount; i++) {
		rtpdata.csrcs.push(packet[headerend] << 24 | packet[headerend+1] << 16 | packet[headerend+2] << 8 | packet[headerend+3]);
		headerend += 4;
	}
	
	// Parse header extension into an ArrayBuffer
	if (rtpdata.extbit) {
		var extlen = packet[headerend+2] << 8 | packet[headerend+3];
		rtpdata.extension = packet.subarray(headerend, headerend+4+4*extlen);
		headerend += 4+4*extlen;
	}
	
	// Parse payload into an ArrayBuffer, deleting the padding
	if (rtpdata.padding) {
		rtpdata.payload = packet.subarray(headerend, rawpacket.byteLength - packet[packet.length - 1]);
	}
	else {
		rtpdata.payload = packet.subarray(headerend);
	}

	return rtpdata;
}

function parseH264(data) {
	var nalpacket = parseNAL(data);
	// Read pos into nalpacket data
	var pos = 0;
	
	if (nalpacket.hdr.type >= 1 && nalpacket.hdr.type <= 23) {
		// This is a single nal unit. Do nothing since parseNAL has already parsed completely
	}
	else if (nalpacket.hdr.type == 24 || nalpacket.hdr.type == 25) {
		// This is a STAP
		if (nalpacket.hdr.type == 25) {
			// This is STAP-B. Extract decode order number.
			nalpacket.don = nalpacket.data[pos] << 8 | nalpacket.data[pos+1];
			pos += 2;
		}
		
		// Scan nalpacket data for NAL units
		nalpacket.nalunits = new Array();
		while (pos < nalpacket.data.length) {
			// Read nal size header info and increment read position
			var nalsize = nalpacket.data[pos] << 8 | nalpacket.data[pos+1];
			pos += 2;
			
			// Extract nal unit and push to nalunits array
			var rawnalunit = nalpacket.data.subarray(pos, pos + nalsize);
			nalpacket.nalunits.push(parseNAL(rawnalunit));
			pos += rawnalunit.length;
		}
	}
	else if (nalpacket.hdr.type == 26 || nalpacket.hdr.type == 27) {
		// This is a MTAP
		// Extract decode order number base
		nalpacket.donb = nalpacket.data[pos] << 8 | nalpacket.data[pos+1];
		pos += 2;
		
		// Scan nalpacket data for NAL units
		nalpacket.nalunits = new Array();
		nalpacket.donds = new Array();
		nalpacket.tsoffsets = new Array();
		while (pos < nalpacket.data.length) {
			// Read nal size header info and increment read position
			var nalsize = nalpacket.data[pos] << 8 | nalpacket.data[pos+1];
			nalpacket.donds.push(nalpacket.data[pos+2]);
			pos += 3;
			
			if (nalpacket.hdr.type == 26) {
				// This is MTAP16, extract 16-bit TS offset
				nalpacket.tsoffsets.push(nalpacket.data[pos] << 8 | nalpacket.data[pos+1]);
				pos += 2;
			}
			else if (nalpacket.hdr.type == 27) {
				// This is MTAP24, extract 24-bit TS offset
				nalpacket.tsoffsets.push(nalpacket.data[pos] << 16 | nalpacket.data[pos+1] << 8 | nalpacket.data[pos+2]);
				pos += 3;
			}
			
			// Extract nal unit and push to nalunits array
			var rawnalunit = nalpacket.data.subarray(pos, pos + nalsize)
			nalpacket.nalunits.push(parseNAL(rawnalunit));
			pos += rawnalunit.length;
		}
	}
	else if (nalpacket.hdr.type == 28 || nalpacket.hdr.type == 29) {
		// This is a FU
		// Extract fragmentation unit header
		nalpacket.fu_hdr = new Object();
		nalpacket.fu_hdr.s = nalpacket.data[pos] >>> 7;
		nalpacket.fu_hdr.e = (nalpacket.data[pos] & 0x40) >>> 6;
		nalpacket.fu_hdr.r = (nalpacket.data[pos] & 0x20) >>> 5;
		nalpacket.fu_hdr.type = nalpacket.data[pos] & 0x1F;
		pos += 1;
		
		if (nalpacket.hdr.type == 29) {
			// This is a FU-B, extract 16bit DON
			nalpacket.don = nalpacket.data[pos] << 8 | nalpacket.data[pos+1];
			pos += 2;
		}
		
		// Extract fragment from FU payload
		nalpacket.fragment = nalpacket.data.subarray(pos);
	}
	
	// Return assembled nalpacket
	return nalpacket;
}

function parseNAL(data) {
	var nal = new Object();
	
	// Parse NAL unit hdr
	nal.hdr = new Object();
	nal.hdr.f = data[0] >>> 7;
	nal.hdr.nri = (data[0] & 0x60) >>> 5;
	nal.hdr.type = data[0] & 0x1F;
	// Parse NAL unit data into an ArrayBuffer
	nal.data = data.subarray(1);
	// Store original Uint8Array for video decoding purposes
	nal.array = data;
	
	return nal;
}