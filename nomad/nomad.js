const Nomad = require("../lib/nomad-api-client");

module.exports = function (RED) {
  function GetJob(config) {
    RED.nodes.createNode(this, config);

    let node = this;
    let nomad = new Nomad();

    this.handleData = function (data) {
      node.send({ payload: data });
    };

    this.handleError = function (err) {
      console.error(err);
    };

    this.on("close", function (removed, done) {
      if (node.sub) {
        sub.removeAllListeners();
      }
      done();
    });

    if (config.jobId) {
      this.sub = nomad.jobs.get(config.jobId, { blocking: true });
      this.sub.on("data", this.handleData);
      this.sub.on("error", this.handleError);
    }
  }

  RED.nodes.registerType("nomad-job", GetJob);
};
