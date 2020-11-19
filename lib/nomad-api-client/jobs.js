module.exports = class Jobs {
  constructor(nomad) {
    this.nomad = nomad;
  }

  list(options = {}) {
    let path = "/v1/jobs";

    if (options.blocking) {
      return this.nomad.client.subscribe(path);
    }
    return this.nomad.client.get(path);
  }

  get(id, options = {}) {
    let path = `/v1/job/${id}`;

    if (options.blocking) {
      return this.nomad.client.subscribe(path);
    }
    return this.nomad.client.get(path);
  }
};
