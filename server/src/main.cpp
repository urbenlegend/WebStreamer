#include <string>
#include "WSStreamer.h"

using namespace std;

// Debug file
ofstream debug;

int main(int argc, char* argv[]) {
	debug.open("sentdata.log", ios::binary);

	string host = "localhost";
	string port = "8082";
	
	if (argc == 3) {
		host = argv[1];
		port = argv[2];
	}
	else {
		cout << "No arguments specified. Starting in localhost-only mode on port 8082" << endl;
	}

	try {
		WSStreamer streamer(host, port);
		cout << "Starting WSStreamer on " << host << ":" << port << endl;
		streamer.runAndBlock();
	}
	catch (std::exception& e) {
		std::cerr << "Exception: " << e.what() << endl;
	}

	debug.close();

	return 0;
}