#pragma once

#include <string>
#include <fstream>
#include <vector>

#include "boost/shared_ptr.hpp"
#include "boost/asio.hpp"
#include "boost/thread.hpp"
#include "websocketpp.hpp"
#include "websocket_connection_handler.hpp"

#include "utils.h"

using namespace std;

#ifdef _MSC_VER
#if _MSC_VER < 1600
using boost::shared_ptr;
#endif
#endif

struct WSSClientInfo {
	shared_ptr<ifstream> resource;
	shared_ptr<boost::thread> thread;
	shared_ptr<guarded_var<bool>> thread_continue;
};

// Server that streams data through WebSocket. Client specifies how many bytes it wants.
class WSStreamerHandler : public websocketpp::connection_handler {
private:
	map<websocketpp::session_ptr, WSSClientInfo> connections;

public:
	WSStreamerHandler();
	~WSStreamerHandler();
	void validate(websocketpp::session_ptr client); 
	void on_open(websocketpp::session_ptr client);
	void on_close(websocketpp::session_ptr client);
	void on_message(websocketpp::session_ptr client, const string& msg);
	void on_message(websocketpp::session_ptr client, const vector<unsigned char>& data);
};

class WSStreamer {
private:
	boost::shared_ptr<WSStreamerHandler> streamer;
	boost::asio::io_service io_service;
	tcp::endpoint endpoint;
	websocketpp::server_ptr server;
	shared_ptr<boost::thread> iosrv_thread;
public:
	WSStreamer(string host, string port);
	~WSStreamer();

	void run();
	void runAndBlock();
	void stop();
	void operator()();
};