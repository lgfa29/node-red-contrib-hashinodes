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
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);
    this.jobId = config.jobId;
    this.sub = null;

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

  function NomadEventStream(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.nomad = RED.nodes.getNode(config.client);
    this.topics = [];
    this.sub = null;
    this.reconnectInterval = null;

    try {
      this.topics = JSON.parse(config.topics);
    } catch (err) {
      this.error(err, "failed to parse topics");
      return;
    }

    this.setConnected = function () {
      node.status({ fill: "green", shape: "dot", text: "connected" });
    };

    this.setDisconnected = function () {
      node.status({ fill: "red", shape: "dot", text: "disconnected" });
    };

    this.handleData = function (data) {
      node.send({ payload: data });
    };

    this.handleError = function (err) {
      node.error(err, "failed to get event stream");
    };

    this.closeStream = function () {
      if (node.sub) {
        node.sub = null;
      }
    };

    this.sub = this.nomad.client.events.stream({ topics: this.topics });
    this.sub.on("data", this.handleData);
    this.sub.on("error", this.handleError);
    this.sub.on("connected", this.setConnected);
    this.sub.on("disconnected", this.setDisconnected);

    this.on("close", function (removed, done) {
      node.closeStream();
      done();
    });

    this.setDisconnected();
  }
  RED.nodes.registerType("nomad-event-stream", NomadEventStream);
};
