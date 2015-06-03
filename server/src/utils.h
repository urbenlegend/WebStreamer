#pragma once

#include <string>
#include <vector>
#include "boost/thread.hpp"

using namespace std;

void tokenize(const string line, vector<string>& tokens, string delimiter = " \t\r\n");

// Divides a number in numunit format (e.g. 5KB) into separate num and unit (e.g. 5 KB)
// Splits string at first non-digit in the string line
void splitIntUnit(const string line, int& num, string& unit);

template <typename T>
class guarded_var {
private:
	boost::mutex mutex;
	T variable;
public:
	guarded_var(const T& _variable);
	void operator=(const T& _variable);
	T get();
};

template <typename T>
guarded_var<T>::guarded_var(const T& _variable) : variable(_variable) {

}

template <typename T>
void guarded_var<T>::operator=(const T& _variable) {
	boost::mutex::scoped_lock lock(mutex);
	variable = _variable;
}

template <typename T>
T guarded_var<T>::get() {
	boost::mutex::scoped_lock lock(mutex);
	return variable;
}