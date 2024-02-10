export function shimResponsePrototype(responsePrototype) {
  // there's a bunch of default headers we want, as part of
  // setting whether this is a 200, 400, 404, etc.
  responsePrototype.status = function (statusNumber, type = `text/plain`) {
    this.writeHead(statusNumber, {
      "Content-Type": type,
      "Cache-Control": `no-store`,
      "Access-Control-Allow-Origin": `*`,
    });
    return this;
  };

  // we don't want to call write(), and then end(), separately, all the time.
  responsePrototype.send = function (data) {
    this.write(data);
    this.end();
  };

  // "just reply with some text"
  responsePrototype.text = function (textData, status = 200) {
    this.status(status).send(textData);
  };

  // "just reply with some json"
  responsePrototype.json = function (jsData, status = 200) {
    this.status(status, `application/json`).send(JSON.stringify(jsData));
  };

  // "send a failure response"
  responsePrototype.fail = function (reason) {
    this.text(reason, 400);
  };
}
