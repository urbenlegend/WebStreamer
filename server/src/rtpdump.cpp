#include <cstdio>
#include <cstdint>

#include "rtpdump.h"

const int PACKET_LENGTH=1024;

int main(int argc, char* argv[]) {
	FILE* datafile = fopen(argv[1], "rb");
	FILE* dumpfile = fopen(argv[2], "wb");
	struct timeval start;
	RTPDumpFile::InitRTPDumpFile(dumpfile, start);

	RTP_packet_t rtpheader;
	rtpheader.flags1 = 0x80;
	rtpheader.flags2 = 0;
	rtpheader.seqnum = htons(123);
	rtpheader.timestamp = htonl(12345);
	rtpheader.ssrc = htonl(1029384756);
	size_t read;
	uint8_t buffer[PACKET_LENGTH];
	memcpy(buffer, &rtpheader, sizeof(rtpheader));
	while (read = fread(buffer + sizeof(rtpheader), sizeof(uint8_t), PACKET_LENGTH - sizeof(rtpheader), datafile)) {
		RTPDumpFile::DumpRTPData(dumpfile, start, buffer, read + sizeof(rtpheader));
	}
}