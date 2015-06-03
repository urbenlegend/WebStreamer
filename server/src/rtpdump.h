#ifndef RTPDUMP_H
#define RTPDUMP_H

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <WinSock2.h>

#define RTPPLAY_MAGIC   "#!rtpplay1.0 0.0.0.0/0\n"

typedef struct{
	struct timeval start;
	uint32_t source;
	uint16_t port;
	uint16_t padding;
}RD_hdr_t;
typedef struct{
	uint16_t length;
	uint16_t plen;
	uint32_t offset;
}RD_packet_t;
typedef struct {
	uint8_t flags1;
	uint8_t flags2;
	uint16_t seqnum;
	uint32_t timestamp;
	uint32_t ssrc;
} RTP_packet_t;

class RTPDumpFile
{
public:
	static void InitRTPDumpFile(FILE *fp,struct timeval & start)
	{
		if(fp)
		{
			fwrite(RTPPLAY_MAGIC, 1, strlen(RTPPLAY_MAGIC), fp);
			RD_hdr_t rd_hdr;
			//gettimeofday(&start,0);
			start.tv_sec = 0;
			start.tv_usec = 0;
			rd_hdr.start = start;
			rd_hdr.source = 0;
			rd_hdr.port = 0;
			rd_hdr.padding = 0;
			fwrite(&rd_hdr, 1, sizeof(rd_hdr), fp);
			fflush(fp);
		}
	}
	static void DumpRTPData(FILE *fp,struct timeval & start,uint8_t *data,uint32_t length)
	{
		if(fp)
		{
			static long i2G = 2*1000*1024*1024;
			if(ftell(fp) >= i2G)
				return;
			struct timeval now={0};
			RD_packet_t rd_p;
			rd_p.length = length + sizeof(rd_p);
			rd_p.plen = length;
			//gettimeofday(&now,0);
			rd_p.offset = (now.tv_sec - start.tv_sec) * 1000 +
				(now.tv_usec - start.tv_usec) / 1000;
			rd_p.length = htons(rd_p.length);
			rd_p.plen = htons(rd_p.plen);
			rd_p.offset = htonl(rd_p.offset);
			fwrite(&rd_p, 1, sizeof(rd_p), fp);
			fwrite(data, 1, length, fp);
			fflush(fp);
		}
	}
};

#endif