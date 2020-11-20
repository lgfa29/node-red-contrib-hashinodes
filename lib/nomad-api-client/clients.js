module.exports = class Clients {
  constructor(nomad) {
    this.nomad = nomad;
  }

  logs(allocId, options = {}) {
    const path = `/v1/client/fs/logs/${allocId}`;
    return this.nomad.client.get(path).query({
      task: options.task,
      type: options.type,
    });
  }
};
