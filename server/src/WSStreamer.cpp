#include <string>
#include <fstream>
#include <vector>

#include "boost/shared_ptr.hpp"
#include "boost/asio.hpp"
#include "websocketpp.hpp"
#include "websocket_connection_handler.hpp"

#include "utils.h"
#include "rtpdump.h"
#include "WSStreamer.h"

using namespace std;

extern ofstream debug;

vector<unsigned char> readNAL(ifstream& stream, int numOfUnits) {
	vector<unsigned char> buffer;
	char byte_read;

	for (int i = 0; i < numOfUnits && stream.good(); i++) {
		int end_count = 0;
		bool extract = false;
		// Extract bytes and put into vector for sending
		while (true) {
			stream.read(&byte_read, 1);
			if (!stream.good()) {
				break;
			}
			if (extract) {
				buffer.push_back(byte_read);
			}
			// Check for NAL header 0 0 0 1
			if (byte_read == 0 && end_count < 3 || byte_read == 1 && end_count == 3) {
				end_count++;
			}
			else {
				end_count = 0;
			}
			if (end_count == 4) {
				// Reset NAL header count
				end_count = 0;
				if (extract) {
					// Delete beginning of next NAL from current NAL array and decrement read pointer so that NAL is available for next read
					stream.seekg(stream.tellg() - (streampos)4);
					buffer.erase(buffer.end() - 4, buffer.end());
					break;
				}
				else {
					// Insert NAL header that's been detected into NAL array
					for (int i = 0; i < 3; i++) {
						buffer.push_back(0);
					}
					buffer.push_back(1);
					extract = true;
				}
			}
		}
	}
	return buffer;
}

int sendNAL(websocketpp::session_ptr client, shared_ptr<ifstream> file, int nals) {
	if (file->good()) {
		vector<unsigned char> buffer = readNAL(*file.get(), nals);
		client->send(buffer);
		//debug.write((char*)&buffer[0], buffer.size());
		return buffer.size();
	}
	else {
		return 0;
	}
}

streamsize sendChunk(websocketpp::session_ptr client, shared_ptr<ifstream> file, int chunk_size) {
	if (file->good()) {
		char* read_buffer = new char[chunk_size];
		vector<unsigned char> send_buffer;
		file->read(read_buffer, chunk_size);
		send_buffer.assign(read_buffer, read_buffer + file->gcount());
		client->send(send_buffer);
		delete [] read_buffer;
		return file->gcount();
	}
	else {
		return 0;
	}
}

streamsize sendRTP(websocketpp::session_ptr client, shared_ptr<ifstream> file, int packets) {
	if (file->good()) {
		// Read file header
		char packet_hdr_array[sizeof(RD_packet_t)];
		file->read(packet_hdr_array, sizeof(packet_hdr_array));
		RD_packet_t* packet_hdr = (RD_packet_t*)packet_hdr_array;
		packet_hdr->length = ntohs(packet_hdr->length);
		packet_hdr->plen = ntohs(packet_hdr->plen);
		packet_hdr->offset = ntohl(packet_hdr->offset);
		// Extract actual RTP packet
		char* rtp_packet = new char[packet_hdr->plen];
		file->read(rtp_packet, packet_hdr->plen);
		vector<unsigned char> send_buffer;
		send_buffer.assign(rtp_packet, rtp_packet + file->gcount());
		client->send(send_buffer);
		delete [] rtp_packet;
		return file->gcount();
	}
	else {
		return 0;
	}
}

// Thread function that reads bytes
void wschunk_thread_func(shared_ptr<guarded_var<bool>> thread_continue, websocketpp::session_ptr client, shared_ptr<ifstream> file, int chunk_size, int sleep_time) {
	vector<unsigned char> send_buffer;
	while (sendChunk(client, file, chunk_size)) {
		if (thread_continue->get() == false) {
			break;
		}
		Sleep(sleep_time);
	}
}

// Thread function that reads NALS
void wsnal_thread_func(shared_ptr<guarded_var<bool>> thread_continue, websocketpp::session_ptr client, shared_ptr<ifstream> file, int nals, int sleep_time) {
	while (sendNAL(client, file, nals)) {
		if (thread_continue->get() == false) {
			break;
		}
		Sleep(sleep_time);
	}
}

// Thread function that reads NALS
void wsrtp_thread_func(shared_ptr<guarded_var<bool>> thread_continue, websocketpp::session_ptr client, shared_ptr<ifstream> file, int packets, int sleep_time) {
	while (sendRTP(client, file, packets)) {
		if (thread_continue->get() == false) {
			break;
		}
		Sleep(sleep_time);
	}
}

WSStreamerHandler::WSStreamerHandler() {

}
WSStreamerHandler::~WSStreamerHandler() {

}

void WSStreamerHandler::validate(websocketpp::session_ptr client) {
	// Check if requested resource exists
	if (client->get_resource() == "/") {
		cout << "INFO: Client is connecting without asking for a resource" << endl;
	}
	else {
		ifstream resource(client->get_resource().substr(1).c_str(), ios::binary);
		if (!resource.is_open()) {
			string err = "Request for unknown resource " + client->get_resource();
			cerr << err << endl;
			throw(websocketpp::handshake_error(err, 404));
		}
		else {
			cout << "INFO: Client request for " + client->get_resource() + " accepted" << endl;
			resource.close();
		}
	}
}

void WSStreamerHandler::on_open(websocketpp::session_ptr client) {
	if (client->get_resource() != "/") {
		shared_ptr<ifstream> resource(new ifstream(client->get_resource().substr(1).c_str(), ios::binary));
		if (resource->is_open()) {
			cout << "INFO: Client has connected and opened " + client->get_resource() << endl;
			// Check if it is a rtpdump file. If it is, fast foward past file header
			if (resource->good()) {
				streampos filestart = resource->tellg();
				char* rtpdumphdr = new char[strlen(RTPPLAY_MAGIC)];
				resource->read(rtpdumphdr, strlen(RTPPLAY_MAGIC));
				if (resource->gcount() == strlen(RTPPLAY_MAGIC) && strncmp(rtpdumphdr, RTPPLAY_MAGIC, strlen(RTPPLAY_MAGIC)) == 0) {
					cout << "INFO: Requested file is an rtpdump file. Fast forwarding past file header" << endl;
					resource->ignore(sizeof(RD_hdr_t));
				}
				else {
					// Reset file to beginning if we do not see rtpdump header
					resource->seekg(filestart);
				}
				delete[] rtpdumphdr;
			}
			WSSClientInfo clientInfo;
			clientInfo.resource = resource;
			connections.insert(pair<websocketpp::session_ptr, WSSClientInfo>(client, clientInfo));
		}
		else {
			cerr << "ERROR: Client has connected but server is unable to access " + client->get_resource() << endl;
			client->send("ERROR: Failed to open resource");
		}
	}
}

void WSStreamerHandler::on_close(websocketpp::session_ptr client) {
	map<websocketpp::session_ptr, WSSClientInfo>::iterator connection = connections.find(client);
	if (connection != connections.end()) {
		// Close file handle and remove connection from connections list.
		if (connection->second.resource) {
			connection->second.resource->close();
		}
		if (connection->second.thread) {
			*(connection->second.thread_continue) = false;
			connection->second.thread->join();
		}
		connections.erase(connection);
		cout << "INFO: Client has disconnected" << endl;
	}
}

void WSStreamerHandler::on_message(websocketpp::session_ptr client, const std::string &msg) {
	cout << "CLIENTMSG: " << msg << endl;
	// Find client info and file handle in connections map
	map<websocketpp::session_ptr, WSSClientInfo>::iterator connection = connections.find(client);
	if (connection == connections.end()) {
		cerr << "ERROR: Received message from an unknown client" << endl;
	}
	WSSClientInfo& clientInfo = connection->second;

	// Parse request from client and send data appropriately
	vector<string> tokens;
	tokenize(msg, tokens);
	if (tokens.size() >= 2) {
		bool continuous_stream;
		if (tokens[0] == "REQUESTSTREAM") {
			continuous_stream = true;
		}
		else if (tokens[0] == "REQUEST") {
			continuous_stream = false;
		}
		else {
			cerr << "ERROR: Client has sent an invalid request" << endl;
		}

		// Parse message size token
		string chunk_type;
		int temp_size = 0;
		int byte_multiplier = 0;
		int sleep_time = 0;
		splitIntUnit(tokens[1], temp_size, chunk_type);
		if (temp_size == 0) {
			cerr << "ERROR: Client has specified an invalid request size" << endl;
			return;
		}
		if (chunk_type == "MB") {
			byte_multiplier = 1048576;
		}
		else if (chunk_type == "KB") {
			byte_multiplier = 1024;
		}
		else if (chunk_type == "B") {
			byte_multiplier = 1;
		}
		else if (chunk_type == "NAL") {
			// For miscellaneous accepted units, do nothing
		}
		else if (chunk_type == "RTP") {
			// For miscellaneous accepted units, do nothing
		}
		else {
			cerr << "ERROR: Client has specified an invalid request unit" << endl;
			return;
		}

		// Parse stream rate token
		if (tokens.size() == 3) {
			string unit;
			splitIntUnit(tokens[2], sleep_time, unit);
			if (sleep_time < 0 || unit != "MS") {
				cerr << "ERROR: Client has specified an invalid delay time" << endl;
				return;
			}
		}

		// Initiate streaming
		if (chunk_type == "MB" || chunk_type == "KB" || chunk_type == "B") {
			// Send file in chunks of chunk_size bytes
			unsigned int chunk_size = temp_size * byte_multiplier;
			if (continuous_stream) {
				if (clientInfo.thread) {
					cerr << "ERROR: Already streaming data to client" << endl;
				}
				else {
					cout << "INFO: Streaming data to client in " << chunk_size << " byte chunks with " << sleep_time << " MS delay" << endl;
					clientInfo.thread_continue.reset(new guarded_var<bool>(continuous_stream));
					clientInfo.thread.reset(new boost::thread(wschunk_thread_func, clientInfo.thread_continue, client, clientInfo.resource, chunk_size, sleep_time));
				}
			}
			else {
				cout << "INFO: Sending a " << chunk_size << " byte chunk to client" << endl;
				sendChunk(client, clientInfo.resource, chunk_size);
			}
		}
		else if (chunk_type == "NAL") {
			// Send file in NAL units
			if (continuous_stream) {
				if (clientInfo.thread) {
					cerr << "ERROR: Already streaming data to client" << endl;
				}
				else {
					cout << "INFO: Streaming data to client in " << temp_size << " NAL chunks with " << sleep_time << " MS delay" << endl;
					clientInfo.thread_continue.reset(new guarded_var<bool>(continuous_stream));
					clientInfo.thread.reset(new boost::thread(wsnal_thread_func, clientInfo.thread_continue, client, clientInfo.resource, temp_size, sleep_time));
				}
			}
			else {
				cout << "INFO: Sending " << temp_size << " NAL chunk to client" << endl;
				sendNAL(client, clientInfo.resource, temp_size);
			}
		}
		else if (chunk_type == "RTP") {
			if (continuous_stream) {
				if (clientInfo.thread) {
					cerr << "ERROR: Already streaming data to client" << endl;
				}
				else {
					cout << "INFO: Streaming data to client in " << temp_size << " RTP chunks with " << sleep_time << " MS delay" << endl;
					clientInfo.thread_continue.reset(new guarded_var<bool>(continuous_stream));
					clientInfo.thread.reset(new boost::thread(wsrtp_thread_func, clientInfo.thread_continue, client, clientInfo.resource, temp_size, sleep_time));
				}
			}
			else {
				cout << "INFO: Sending " << temp_size << " RTP chunk to client" << endl;
				sendRTP(client, clientInfo.resource, temp_size);
			}
		}
	}
	else if (tokens.size() == 1) {
		if (tokens[0] == "STOPSTREAM") {
			if (clientInfo.thread) {
				*(clientInfo.thread_continue) = false;
				clientInfo.thread->join();
				clientInfo.thread = NULL;
			}
		}
	}
	else {
		cerr << "ERROR: Invalid request from client" << endl;
	}
}

void WSStreamerHandler::on_message(websocketpp::session_ptr client,
	const std::vector<unsigned char> &data) {
	// Ignore binary data
	debug.write((char*)&data[0], data.size());
	//char pad[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
	//debug.write(pad, 6);
	//cerr << "WARNING: Discarding binary data received from client" << endl;
}


WSStreamer::WSStreamer(string host, string port) : streamer(new WSStreamerHandler()),
	endpoint(tcp::v4(), atoi(port.c_str())),
	server(new websocketpp::server(io_service, endpoint, streamer))
{
	string full_host = host + ":" + port;

	// setup server settings
	server->add_host(full_host);
	server->add_host("localhost:" + port);

	// start the server
	server->start_accept();
}

WSStreamer::~WSStreamer() {
	stop();
}

void WSStreamer::run() {
	if (!iosrv_thread) {
		iosrv_thread = shared_ptr<boost::thread>(new boost::thread(boost::ref(*this)));
	}
}

void WSStreamer::runAndBlock() {
	io_service.run();
}

void WSStreamer::stop() {
	io_service.stop();
	iosrv_thread->join();
	iosrv_thread.reset();
}

void WSStreamer::operator()() {
	io_service.run();
}