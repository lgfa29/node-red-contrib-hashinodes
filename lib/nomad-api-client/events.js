const superagent = require("superagent");

module.exports = class Events {
  constructor(nomad) {
    this.nomad = nomad;
  }

  stream(options = {}) {
    const path = "/v1/event/stream";
    return this.nomad.client.stream(path, options);
  }
};
