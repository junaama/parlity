const jwt = require("jsonwebtoken");

class AccessToken {
  apiKey;
  secret;
  grant;
  validFor;

  constructor(key, secret) {
    this.apiKey = key;
    this.secret = secret;
    this.grant = {
      identity: "",
      name: "",
      video: {
        roomCreate: false,
        roomList: false,
        roomRecord: false,
        roomAdmin: false,
        roomJoin: false,
        room: "",
        canPublish: false,
        canSubscribe: false,
        canPublishData: false,
        canPublishSources: [],
        ingressAdmin: false,
        hidden: false,
        recorder: false,
      },
      metadata: "",
      sha256: "",
    };
  }

  setIdentity(identity) {
    this.grant.identity = identity;
  }

  setValidFor(seconds) {
    this.validFor = seconds;
    return this;
  }

  setName(name) {
    this.grant.name = name;
    return this;
  }

  setGrant(grant) {
    this.grant.video = grant;
    return this;
  }

  setMetadata(metadata) {
    this.grant.metadata = metadata;
    return this;
  }

  setSha256(sha256) {
    this.grant.sha256 = sha256;
    return this;
  }
  toJWT() {
    if (!this.apiKey || !this.secret) {
      return new Error("Missing API Key or Secret");
    }
    const sig = jwt.sign(this.grant, this.secret, {
      algorithm: "HS256",
      issuer: this.apiKey,
      subject: this.grant.identity,
      expiresIn: Date.now() + this.validFor,
    });
    return sig;
  }
}

const roomName = "room-name";
const participantName = "participant-name-two";

const at = new AccessToken(process.env.DEVKEY, process.env.SECRET);
const vG = {
  roomJoin: true,
  room: roomName,
  canPublish: true,
  canSubscribe: true,
  roomCreate: false,
  roomList: false,
  roomRecord: false,
  roomAdmin: false,
  canPublishData: false,
  canPublishSources: [],
  ingressAdmin: false,
  hidden: false,
  recorder: false,
};
at.setGrant(vG);
at.setIdentity(participantName);
at.setValidFor(Date.now() + 3600 * 6);
const token = at.toJWT();
console.log("access token", token);
