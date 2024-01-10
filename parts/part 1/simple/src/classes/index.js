// Our client class will announce its own connection, as well as browser connections:
export class ClientClass {
  // nothing special going on here, just a console log
  onConnect() {
    console.log(`[client] We connected to the server!`);
  }
  // and nothing special going on here either, just more console log
  onBrowserConnect() {
    console.log(`[client] A browser connected!`);
  }
}

// Our server class will also announce that it got client connections:
export class ServerClass {
  // still nothing special going on here...
  onConnect(client) {
    console.log(`[server] A client connected!`);
  }
  // ...but we do add a little test function that clients can call:
  async test() {
    console.log(`[server] test!`);
    return "success!";
  }
}
