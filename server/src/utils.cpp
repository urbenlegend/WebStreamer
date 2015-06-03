#include <string>
#include <vector>
#include "boost/thread.hpp"
#include "utils.h"

using namespace std;

void tokenize(const string line, vector<string>& tokens, string delimiter) {
        // Substring positions
        size_t begin = 0;
        size_t end = 0;

        while (end < line.length()) {
                // Extract token into temp
                end = line.find_first_of(delimiter, begin);
                string temp = line.substr(begin, end - begin);

                // Put temp into vector if it isn't an empty string
                if (temp.length() != 0) {
                        tokens.push_back(temp);
                }

                begin = end + 1;
        }
}

// Divides a number in numunit format (e.g. 5KB) into separate num and unit (e.g. 5 KB)
// Splits string at first non-digit in the string line
void splitIntUnit(const string line, int& num, string& unit) {
	size_t split;
	for (split = line.size() - 1; split >= 0 && isalpha(line[split]); split--) {
	}
	num = atoi(line.substr(0, split + 1).c_str());
	unit = line.substr(split + 1);
}