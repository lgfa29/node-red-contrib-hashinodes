const Nomad = require("../lib/nomad-api-client");

module.exports = function (RED) {
  function NomadClientNode(config) {
    RED.nodes.createNode(this, config);

    this.address = config.address;
    this.region = config.region;
    this.namespace = config.namespace;

    this.client = new Nomad({
      address: this.address,
      region: this.region,
      namespace: this.namespace,
    });
  }
  RED.nodes.registerType("nomad-client", NomadClientNode);

  function NomadGetJobNode(config) {
    RED.nodes.createNode(this, config);

    this.nomad = RED.nodes.getNode(config.client);
    this.jobId = config.jobId;
    let sub = null;

    const node = this;

    this.handleData = function (data) {
      let color = "grey";
      switch (data.Status) {
        case "running":
          color = "green";
          break;
        case "dead":
          color = "red";
          break;
      }
      node.status({ fill: color, shape: "dot", text: data.Status });
      node.send({ payload: data });
    };

    this.handleError = function (err) {
      node.error(err, "failed to get job");
    };

    this.on("close", function (removed, done) {
      if (node.sub) {
        node.sub.removeAllListeners();
        node.sub = null;
      }
      done();
    });

    this.sub = this.nomad.client.jobs.get(config.jobId, { blocking: true });
    this.sub.on("data", this.handleData);
    this.sub.on("error", this.handleError);
  }

  RED.nodes.registerType("nomad-get-job", NomadGetJobNode);
};
