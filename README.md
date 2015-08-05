##Building the Websocket server (WSStreamer)
1. Make sure you have the Boost libraries installed and setup properly first:
   * Unzip boost libraries to C:\Program Files\boost\boost_1_58_0
   * Set the environment variable BOOSTROOT to wherever you've unzipped the files to. You may need to restart Visual Studio for the variable to take into effect.
   * Open command prompt and run:
```
bootstrap
b2
```

2.) Open the VS2013 solution file located in server/prj/win/vs2013 and build WSStreamer

##Running the Websocket server
```
WSStreamer <host> <port>
```

By default host and port are set to localhost:8082. If you want the server to be externally accessible, make sure you set the host to the hostname or IP address that you'll be using to connect to the server.

##Connecting to the Websocket server
Please refer to web/webclient.html for an example on how to connect to the server. The URI used to connect will be in the form of ws://ip:port/mediafile, where mediafile is the relative path to a H.264 NAL file starting from the current working directory of WSStreamer.