import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import {
  ConnectionQuality,
  ConnectionState,
  createAudioAnalyser,
  DataPacket_Kind,
  DisconnectReason,
  LocalAudioTrack,
  LocalParticipant,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  setLogLevel,
  Track,
  TrackPublication,
  VideoCaptureOptions,
  VideoCodec,
  VideoPresets,
  VideoQuality,
} from "livekit-client";

import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const [room, setRoom] = useState<Room>();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant>();
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<Track[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const [url, setUrl] = useState("ws://localhost:7880");
  const [token, setToken] = useState("");
  const [simulcast, setSimulcast] = useState(false);
  const [dynacast, setDynacast] = useState(false);
  const [forceTURN, setForceTURN] = useState(false);
  const [adaptiveStream, setAdaptiveStream] = useState(false);
  const [shouldPublish, setShouldPublish] = useState(false);
  const [preferredCodec, setPreferredCodec] = useState<VideoCodec>("vp8");
  const [autoSubscribe, setAutoSubscribe] = useState(false);

  const [dataReceived, setDataReceived] = useState<DataPacket_Kind>();
  const [roomDisconnected, setRoomDisconnected] = useState<DisconnectReason>();
  const [reconnecting, setReconnecting] = useState();
  const [reconnected, setReconnected] = useState();
  const [localTrackPublished, setLocalTrackPublished] =
    useState<TrackPublication>();
  const [localTrackUnpublished, setLocalTrackUnpublished] =
    useState<TrackPublication>();
  const [remoteTrackPublished, setRemoteTrackPublished] =
    useState<RemoteTrackPublication>();
  const [remoteTrackUnpublished, setRemoteTrackUnpublished] =
    useState<RemoteTrackPublication>();
  const [trackSubscribed, setTrackSubscribed] = useState<Track>();
  const [textField, setTextField] = useState("");
  const [chat, setChat] = useState<string[]>([]);

  const state = {
    isFrontFacing: false,
    encoder: new TextEncoder(),
    decoder: new TextDecoder(),
    defaultDevices: new Map<MediaDeviceKind, string>(),
    bitrateInterval: undefined as any,
  };
  let currentRoom: Room | undefined;

  let startTime: number;

  let searchParams;
  let storedUrl;
  let storedToken;

  if (typeof window !== "undefined") {
    searchParams = new URLSearchParams(window.location.search);
    storedUrl = searchParams.get("url") ?? "ws://localhost:7880";
    storedToken = searchParams.get("token") ?? "";
  }

  function updateSearchParams(url: string, token: string) {
    const params = new URLSearchParams({ url, token });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }

  const connectWithFormInput = async () => {
    setLogLevel(LogLevel.debug);
    updateSearchParams(url, token);

    const roomOpts: RoomOptions = {
      adaptiveStream,
      dynacast,
      publishDefaults: {
        simulcast,
        videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],
        videoCodec: preferredCodec || "vp8",
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    };

    const connectOpts: RoomConnectOptions = {
      autoSubscribe: autoSubscribe,
    };
    if (forceTURN) {
      connectOpts.rtcConfig = {
        iceTransportPolicy: "relay",
      };
    }
    await connectToRoom(url, token, roomOpts, connectOpts, shouldPublish);
  };

  const connectToRoom = async (
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    connectOptions?: RoomConnectOptions,
    shouldPublish?: boolean
  ): Promise<Room | undefined> => {
    const room = new Room(roomOptions);

    startTime = Date.now();
    await room.prepareConnection(url);
    const prewarmTime = Date.now() - startTime;
    console.log(`prewarmed connection in ${prewarmTime}ms`);

    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.DataReceived, handleData)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.Reconnecting, () => console.log("Reconnecting to room"))
      .on(RoomEvent.Reconnected, async () => {
        console.log(
          "Successfully reconnected. server",
          await room.engine.getConnectedServerAddress()
        );
      })
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        const track = pub.track as LocalAudioTrack;

        if (track instanceof LocalAudioTrack) {
          const { calculateVolume } = createAudioAnalyser(track);

          setInterval(() => {
            $("local-volume")?.setAttribute(
              "value",
              calculateVolume().toFixed(4)
            );
          }, 200);
        }
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare(room);
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare(room);
      })
      .on(RoomEvent.RoomMetadataChanged, (metadata) => {
        console.log("new metadata for room", metadata);
      })
      .on(RoomEvent.MediaDevicesChanged, handleDevicesChanged)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        // if (room.canPlaybackAudio) {
        //   $('start-audio-button')?.setAttribute('disabled', 'true');
        // } else {
        //   $('start-audio-button')?.removeAttribute('disabled');
        // }
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => {
        const failure = MediaDeviceFailure.getFailure(e);
        console.log("media device failure", failure);
      })
      .on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant?: Participant) => {
          console.log(
            "connection quality changed",
            participant?.identity,
            quality
          );
        }
      )
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        console.log("subscribed to track", pub.trackSid, participant.identity);
        renderParticipant(participant);
        renderScreenShare(room);
      })
      .on(RoomEvent.TrackUnsubscribed, (_, pub, participant) => {
        console.log("unsubscribed from track", pub.trackSid);
        renderParticipant(participant);
        renderScreenShare(room);
      })
      .on(RoomEvent.SignalConnected, async () => {
        const signalConnectionTime = Date.now() - startTime;
        console.log(
          `signal connection established in ${signalConnectionTime}ms`
        );
        // speed up publishing by starting to publish before it's fully connected
        // publishing is accepted as soon as signal connection has established
        if (shouldPublish) {
          await room.localParticipant.enableCameraAndMicrophone();
          console.log(`tracks published in ${Date.now() - startTime}ms`);
          updateButtonsForPublishState();
        }
      });

    try {
      await room.connect(url, token, connectOptions);
      const elapsed = Date.now() - startTime;
      console.log(
        `successfully connected to ${room.name} in ${Math.round(elapsed)}ms`,
        await room.engine.getConnectedServerAddress()
      );
    } catch (error: any) {
      let message: any = error;
      if (error.message) {
        message = error.message;
      }
      console.log("could not connect:", message);
      return;
    }
    currentRoom = room;
    window.currentRoom = room;
    setButtonsForState(true);

    room.participants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);

    return room;
  };

  const toggleAudio = async () => {
    if (!currentRoom) return;
    const enabled = currentRoom.localParticipant.isMicrophoneEnabled;
    setButtonDisabled("toggle-audio-button", true);
    if (enabled) {
      console.log("disabling audio");
    } else {
      console.log("enabling audio");
    }
    await currentRoom.localParticipant.setMicrophoneEnabled(!enabled);
    setButtonDisabled("toggle-audio-button", false);
    updateButtonsForPublishState();
  };

  const toggleVideo = async () => {
    if (!currentRoom) return;
    setButtonDisabled("toggle-video-button", true);
    const enabled = currentRoom.localParticipant.isCameraEnabled;
    if (enabled) {
      console.log("disabling video");
    } else {
      console.log("enabling video");
    }
    await currentRoom.localParticipant.setCameraEnabled(!enabled);
    setButtonDisabled("toggle-video-button", false);
    renderParticipant(currentRoom.localParticipant);

    // update display
    updateButtonsForPublishState();
  };

  const flipVideo = () => {
    const videoPub = currentRoom?.localParticipant.getTrack(
      Track.Source.Camera
    );
    if (!videoPub) {
      return;
    }
    if (state.isFrontFacing) {
      setButtonState("flip-video-button", "Front Camera", false);
    } else {
      setButtonState("flip-video-button", "Back Camera", false);
    }
    state.isFrontFacing = !state.isFrontFacing;
    const options: VideoCaptureOptions = {
      resolution: VideoPresets.h720.resolution,
      facingMode: state.isFrontFacing ? "user" : "environment",
    };
    videoPub.videoTrack?.restartTrack(options);
  };

  const shareScreen = async () => {
    if (!currentRoom) return;

    const enabled = currentRoom.localParticipant.isScreenShareEnabled;
    console.log(`${enabled ? "stopping" : "starting"} screen share`);
    setButtonDisabled("share-screen-button", true);
    await currentRoom.localParticipant.setScreenShareEnabled(!enabled, {
      audio: true,
    });
    setButtonDisabled("share-screen-button", false);
    updateButtonsForPublishState();
  };

  const startAudio = () => {
    currentRoom?.startAudio();
  };

  const enterText = () => {
    if (!currentRoom) return;
    // const textField = <HTMLInputElement>$('entry');
    if (textField.value) {
      const msg = state.encoder.encode(textField.value);
      currentRoom.localParticipant.publishData(msg, DataPacket_Kind.RELIABLE);
      // (<HTMLTextAreaElement>(
      //   $('chat')
      // )).value += `${currentRoom.localParticipant.identity} (me): ${textField.value}\n`;
      textField.value = "";
    }
  };

  const disconnectRoom = () => {
    if (currentRoom) {
      currentRoom.disconnect();
    }
    if (state.bitrateInterval) {
      clearInterval(state.bitrateInterval);
    }
  };

  const handleScenario = (e: Event) => {
    const scenario = e.target.value;
    if (scenario === "subscribe-all") {
      currentRoom?.participants.forEach((p) => {
        p.tracks.forEach((rp) => rp.setSubscribed(true));
      });
    } else if (scenario === "unsubscribe-all") {
      currentRoom?.participants.forEach((p) => {
        p.tracks.forEach((rp) => rp.setSubscribed(false));
      });
    } else if (scenario !== "") {
      currentRoom?.simulateScenario(scenario);
      // (<HTMLSelectElement>e.target).value = '';
    }
  };

  const handleDeviceSelected = async (e: Event) => {
    const deviceId = e.target.value;
    const elementId = e.target.id;
    const kind = elementMapping[elementId];
    if (!kind) {
      return;
    }

    state.defaultDevices.set(kind, deviceId);

    if (currentRoom) {
      await currentRoom.switchActiveDevice(kind, deviceId);
    }
  };

  const handlePreferredQuality = (e: Event) => {
    const quality = e.target.value;
    let q = VideoQuality.HIGH;
    switch (quality) {
      case "low":
        q = VideoQuality.LOW;
        break;
      case "medium":
        q = VideoQuality.MEDIUM;
        break;
      case "high":
        q = VideoQuality.HIGH;
        break;
      default:
        break;
    }
    if (currentRoom) {
      currentRoom.participants.forEach((participant) => {
        participant.tracks.forEach((track) => {
          track.setVideoQuality(q);
        });
      });
    }
  };

  const handlePreferredFPS = (e: Event) => {
    const fps = +e.target.value;
    if (currentRoom) {
      currentRoom.participants.forEach((participant) => {
        participant.tracks.forEach((track) => {
          track.setVideoFPS(fps);
        });
      });
    }
  };
  {
    /* }; */
  }

  {
    /* declare global {
    interface Window {
      currentRoom: any;
      appActions: typeof appActions;
    }
  } */
  }

  {
    /* window.appActions = appActions; */
  }

  // --------------------------- event handlers ------------------------------- //

  function handleData(msg: Uint8Array, participant?: RemoteParticipant) {
    const str = state.decoder.decode(msg);
    // const chat = <HTMLTextAreaElement>$('chat');
    let from = "server";
    if (participant) {
      from = participant.identity;
    }
    chat.value += `${from}: ${str}\n`;
  }

  function participantConnected(participant: Participant) {
    console.log(
      "participant",
      participant.identity,
      "connected",
      participant.metadata
    );
    participant
      .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
        console.log("track was muted", pub.trackSid, participant.identity);
        renderParticipant(participant);
      })
      .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
        console.log("track was unmuted", pub.trackSid, participant.identity);
        renderParticipant(participant);
      })
      .on(ParticipantEvent.IsSpeakingChanged, () => {
        renderParticipant(participant);
      })
      .on(ParticipantEvent.ConnectionQualityChanged, () => {
        renderParticipant(participant);
      });
  }

  function participantDisconnected(participant: RemoteParticipant) {
    console.log("participant", participant.sid, "disconnected");

    renderParticipant(participant, true);
  }

  function handleRoomDisconnect(reason?: DisconnectReason) {
    if (!currentRoom) return;
    console.log("disconnected from room", { reason });
    setButtonsForState(false);
    renderParticipant(currentRoom.localParticipant, true);
    currentRoom.participants.forEach((p) => {
      renderParticipant(p, true);
    });
    renderScreenShare(currentRoom);

    const container = $("participants-area");
    if (container) {
      container.innerHTML = "";
    }

    // clear the chat area on disconnect
    // const chat = <HTMLTextAreaElement>$('chat');
    chat.value = "";

    currentRoom = undefined;
    window.currentRoom = undefined;
  }

  // -------------------------- rendering helpers ----------------------------- //

  {
    /* function appendLog(...args: any[]) {
    const logger = $('log')!;
    for (let i = 0; i < arguments.length; i += 1) {
      if (typeof args[i] === 'object') {
        logger.innerHTML += `${
          JSON && JSON.stringify ? JSON.stringify(args[i], undefined, 2) : args[i]
        } `;
      } else {
        logger.innerHTML += `${args[i]} `;
      }
    }
    logger.innerHTML += '\n';
    (() => {
      logger.scrollTop = logger.scrollHeight;
    })();
  } */
  }

  // updates participant UI
  function renderParticipant(
    participant: Participant,
    remove: boolean = false
  ) {
    const container = $("participants-area");
    if (!container) return;
    const { identity } = participant;
    // let div = $(`participant-${identity}`);
    if (!div && !remove) {
      div = document.createElement("div");
      div.id = `participant-${identity}`;
      div.className = "participant";
      div.innerHTML = `
        <video id="video-${identity}"></video>
        <audio id="audio-${identity}"></audio>
        <div  className="info-bar">
          <div id="name-${identity}"  className="name">
          </div>
          <div >
            <span id="codec-${identity}"  className="codec">
            </span>
            <span id="size-${identity}"  className="size">
            </span>
            <span id="bitrate-${identity}"  className="bitrate">
            </span>
          </div>
          <div  className="right">
            <span id="signal-${identity}"></span>
            <span id="mic-${identity}"  className="mic-on"></span>
          </div>
        </div>
        ${
          participant instanceof RemoteParticipant
            ? `<div  className="volume-control">
          <input id="volume-${identity}" type="range" min="0" max="1" step="0.1" value="1" orient="vertical" />
        </div>`
            : `<progress id="local-volume" max="1" value="0" />`
        }
  
      `;
      container.appendChild(div);

      const sizeElm = $(`size-${identity}`);
      // const videoElm = <HTMLVideoElement>$(`video-${identity}`);
      videoElm.onresize = () => {
        updateVideoSize(videoElm!, sizeElm!);
      };
    }

    // const videoElm = <HTMLVideoElement>$(`video-${identity}`);
    // const audioELm = <HTMLAudioElement>$(`audio-${identity}`);
    if (remove) {
      div?.remove();
      if (videoElm) {
        videoElm.srcObject = null;
        videoElm.src = "";
      }
      if (audioELm) {
        audioELm.srcObject = null;
        audioELm.src = "";
      }
      return;
    }

    {
      /* $(`name-${identity}`)!.innerHTML = participant.identity; */
    }
    if (participant instanceof LocalParticipant) {
      $(`name-${identity}`)!.innerHTML += " (you)";
    }
    const micElm = $(`mic-${identity}`)!;
    const signalElm = $(`signal-${identity}`)!;
    const cameraPub = participant.getTrack(Track.Source.Camera);
    const micPub = participant.getTrack(Track.Source.Microphone);
    if (participant.isSpeaking) {
      div!.classList.add("speaking");
    } else {
      div!.classList.remove("speaking");
    }

    if (participant instanceof RemoteParticipant) {
      // const volumeSlider = <HTMLInputElement>$(`volume-${identity}`);
      volumeSlider.addEventListener("input", (ev) => {
        participant.setVolume(
          Number.parseFloat((ev.target as HTMLInputElement).value)
        );
      });
    }

    const cameraEnabled =
      cameraPub && cameraPub.isSubscribed && !cameraPub.isMuted;
    if (cameraEnabled) {
      if (participant instanceof LocalParticipant) {
        // flip
        videoElm.style.transform = "scale(-1, 1)";
      } else if (!cameraPub?.videoTrack?.attachedElements.includes(videoElm)) {
        const renderStartTime = Date.now();
        // measure time to render
        videoElm.onloadeddata = () => {
          const elapsed = Date.now() - renderStartTime;
          let fromJoin = 0;
          if (
            participant.joinedAt &&
            participant.joinedAt.getTime() < startTime
          ) {
            fromJoin = Date.now() - startTime;
          }
          appendLog(
            `RemoteVideoTrack ${cameraPub?.trackSid} (${videoElm.videoWidth}x${videoElm.videoHeight}) rendered in ${elapsed}ms`,
            fromJoin > 0 ? `, ${fromJoin}ms from start` : ""
          );
        };
      }
      cameraPub?.videoTrack?.attach(videoElm);
    } else {
      // clear information display
      $(`size-${identity}`)!.innerHTML = "";
      if (cameraPub?.videoTrack) {
        // detach manually whenever possible
        cameraPub.videoTrack?.detach(videoElm);
      } else {
        videoElm.src = "";
        videoElm.srcObject = null;
      }
    }

    const micEnabled = micPub && micPub.isSubscribed && !micPub.isMuted;
    if (micEnabled) {
      if (!(participant instanceof LocalParticipant)) {
        // don't attach local audio
        audioELm.onloadeddata = () => {
          if (
            participant.joinedAt &&
            participant.joinedAt.getTime() < startTime
          ) {
            const fromJoin = Date.now() - startTime;
            appendLog(
              `RemoteAudioTrack ${micPub?.trackSid} played ${fromJoin}ms from start`
            );
          }
        };
        micPub?.audioTrack?.attach(audioELm);
      }
      micElm.className = "mic-on";
      micElm.innerHTML = '<i  className="fas fa-microphone"></i>';
    } else {
      micElm.className = "mic-off";
      micElm.innerHTML = '<i  className="fas fa-microphone-slash"></i>';
    }

    switch (participant.connectionQuality) {
      case ConnectionQuality.Excellent:
      case ConnectionQuality.Good:
      case ConnectionQuality.Poor:
        signalElm.className = `connection-${participant.connectionQuality}`;
        signalElm.innerHTML = '<i  className="fas fa-circle"></i>';
        break;
      default:
        signalElm.innerHTML = "";
      // do nothing
    }
  }

  function renderScreenShare(room: Room) {
    const div = $("screenshare-area")!;
    if (room.state !== ConnectionState.Connected) {
      div.style.display = "none";
      return;
    }
    let participant: Participant | undefined;
    let screenSharePub: TrackPublication | undefined =
      room.localParticipant.getTrack(Track.Source.ScreenShare);
    let screenShareAudioPub: RemoteTrackPublication | undefined;
    if (!screenSharePub) {
      room.participants.forEach((p) => {
        if (screenSharePub) {
          return;
        }
        participant = p;
        const pub = p.getTrack(Track.Source.ScreenShare);
        if (pub?.isSubscribed) {
          screenSharePub = pub;
        }
        const audioPub = p.getTrack(Track.Source.ScreenShareAudio);
        if (audioPub?.isSubscribed) {
          screenShareAudioPub = audioPub;
        }
      });
    } else {
      participant = room.localParticipant;
    }

    if (screenSharePub && participant) {
      div.style.display = "block";
      // const videoElm = <HTMLVideoElement>$('screenshare-video');
      screenSharePub.videoTrack?.attach(videoElm);
      if (screenShareAudioPub) {
        screenShareAudioPub.audioTrack?.attach(videoElm);
      }
      // videoElm.onresize = () => {
      //   updateVideoSize(videoElm, <HTMLSpanElement>$('screenshare-resolution'));
      // };
      const infoElm = $("screenshare-info")!;
      infoElm.innerHTML = `Screenshare from ${participant.identity}`;
    } else {
      div.style.display = "none";
    }
  }

  function renderBitrate() {
    if (!currentRoom || currentRoom.state !== ConnectionState.Connected) {
      return;
    }
    const participants: Participant[] = [...currentRoom.participants.values()];
    participants.push(currentRoom.localParticipant);

    for (const p of participants) {
      const elm = $(`bitrate-${p.identity}`);
      let totalBitrate = 0;
      for (const t of p.tracks.values()) {
        if (t.track) {
          totalBitrate += t.track.currentBitrate;
        }

        if (t.source === Track.Source.Camera) {
          if (t.videoTrack instanceof RemoteVideoTrack) {
            const codecElm = $(`codec-${p.identity}`)!;
            codecElm.innerHTML = t.videoTrack.getDecoderImplementation() ?? "";
          }
        }
      }
      let displayText = "";
      if (totalBitrate > 0) {
        displayText = `${Math.round(
          totalBitrate / 1024
        ).toLocaleString()} kbps`;
      }
      if (elm) {
        elm.innerHTML = displayText;
      }
    }
  }

  function updateVideoSize(element: HTMLVideoElement, target: HTMLElement) {
    target.innerHTML = `(${element.videoWidth}x${element.videoHeight})`;
  }

  function setButtonState(
    buttonId: string,
    buttonText: string,
    isActive: boolean,
    isDisabled: boolean | undefined = undefined
  ) {
    const el = $(buttonId) as HTMLButtonElement;
    if (!el) return;
    if (isDisabled !== undefined) {
      el.disabled = isDisabled;
    }
    el.innerHTML = buttonText;
    if (isActive) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  function setButtonDisabled(buttonId: string, isDisabled: boolean) {
    const el = $(buttonId) as HTMLButtonElement;
    el.disabled = isDisabled;
  }

  setTimeout(handleDevicesChanged, 100);

  function setButtonsForState(connected: boolean) {
    const connectedSet = [
      "toggle-video-button",
      "toggle-audio-button",
      "share-screen-button",
      "disconnect-ws-button",
      "disconnect-room-button",
      "flip-video-button",
      "send-button",
    ];
    const disconnectedSet = ["connect-button"];

    const toRemove = connected ? connectedSet : disconnectedSet;
    const toAdd = connected ? disconnectedSet : connectedSet;

    // toRemove.forEach((id) => $(id)?.removeAttribute('disabled'));
    // toAdd.forEach((id) => $(id)?.setAttribute('disabled', 'true'));
  }

  const elementMapping: { [k: string]: MediaDeviceKind } = {
    "video-input": "videoinput",
    "audio-input": "audioinput",
    "audio-output": "audiooutput",
  };
  async function handleDevicesChanged() {
    Promise.all(
      Object.keys(elementMapping).map(async (id) => {
        const kind = elementMapping[id];
        if (!kind) {
          return;
        }
        const devices = await Room.getLocalDevices(kind);
        const element = id;
        populateSelect(element, devices, state.defaultDevices.get(kind));
      })
    );
  }

  function populateSelect(
    element: HTMLSelectElement,
    devices: MediaDeviceInfo[],
    selectedDeviceId?: string
  ) {
    // clear all elements
    // element.innerHTML = '';

    for (const device of devices) {
      const option = document.createElement("option");
      option.text = device.label;
      option.value = device.deviceId;
      if (device.deviceId === selectedDeviceId) {
        option.selected = true;
      }
      // element.appendChild(option);
    }
  }

  function updateButtonsForPublishState() {
    if (!currentRoom) {
      return;
    }
    const lp = currentRoom.localParticipant;

    // video
    setButtonState(
      "toggle-video-button",
      `${lp.isCameraEnabled ? "Disable" : "Enable"} Video`,
      lp.isCameraEnabled
    );

    // audio
    setButtonState(
      "toggle-audio-button",
      `${lp.isMicrophoneEnabled ? "Disable" : "Enable"} Audio`,
      lp.isMicrophoneEnabled
    );

    // screen share
    setButtonState(
      "share-screen-button",
      lp.isScreenShareEnabled ? "Stop Screen Share" : "Share Screen",
      lp.isScreenShareEnabled
    );
  }

  async function acquireDeviceList() {
    handleDevicesChanged();
  }

  acquireDeviceList();

  return (
    <>
      <div className={styles.container}>
        <Head>
          <title>Create Next App</title>
          <meta name="description" content="Generated by create next app" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <div className="container">
          <div className="row">
            <div className="col-md-8">
              <br />
              <div id="connect-area">
                <div>
                  <b>LiveKit Server URL</b>
                </div>
                <div>
                  <input
                    type="text"
                    className="form-control"
                    id="url"
                    value="ws://localhost:7880"
                  />
                </div>
                <div>
                  <b>Token</b>
                </div>
                <div>
                  <input
                    type="text"
                    className="form-control"
                    id="token"
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              </div>

              <div id="options-area">
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="publish-option"
                    checked
                  />
                  <label htmlFor="publish-option" className="form-check-label">
                    {" "}
                    Publish{" "}
                  </label>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="simulcast"
                    checked
                  />
                  <label htmlFor="simulcast" className="form-check-label">
                    {" "}
                    Simulcast{" "}
                  </label>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="dynacast"
                    checked
                  />
                  <label htmlFor="dynacast" className="form-check-label">
                    {" "}
                    Dynacast{" "}
                  </label>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="adaptive-stream"
                    checked
                  />
                  <label htmlFor="adaptive-stream" className="form-check-label">
                    {" "}
                    AdaptiveStream{" "}
                  </label>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="force-turn"
                  />
                  <label htmlFor="force-turn" className="form-check-label">
                    {" "}
                    Force TURN{" "}
                  </label>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="auto-subscribe"
                    checked
                  />
                  <label htmlFor="auto-subscribe" className="form-check-label">
                    {" "}
                    Auto Subscribe{" "}
                  </label>
                </div>
                <div>
                  <select
                    id="preferred-codec"
                    className="custom-select"
                    style={{ width: "auto" }}
                  >
                    <option value="" selected>
                      PreferredCodec
                    </option>
                    <option value="vp8">VP8</option>
                    <option value="h264">H.264</option>
                    <option value="av1">AV1</option>
                  </select>
                </div>
              </div>

              <div id="actions-area">
                <div>
                  <button
                    id="connect-button"
                    className="btn btn-primary mt-1"
                    type="button"
                    onClick={connectWithFormInput}
                  >
                    Connect
                  </button>
                </div>
                <div>
                  <button
                    id="toggle-audio-button"
                    className="btn btn-secondary mt-1"
                    disabled
                    type="button"
                    onClick={toggleAudio}
                  >
                    Enable Mic
                  </button>
                  <button
                    id="toggle-video-button"
                    className="btn btn-secondary mt-1"
                    disabled
                    type="button"
                    onClick={toggleVideo}
                  >
                    Enable Camera
                  </button>
                  <button
                    id="flip-video-button"
                    className="btn btn-secondary mt-1"
                    disabled
                    type="button"
                    onClick={flipVideo}
                  >
                    Flip Camera
                  </button>
                  <button
                    id="share-screen-button"
                    className="btn btn-secondary mt-1"
                    disabled
                    type="button"
                    onClick={shareScreen}
                  >
                    Share Screen
                  </button>
                  <select
                    id="simulate-scenario"
                    className="custom-select"
                    style={{ width: "auto" }}
                    onChange={handleScenario}
                  >
                    <option value="" selected>
                      Simulate
                    </option>
                    <option value="signal-reconnect">Signal reconnect</option>
                    <option value="speaker">Speaker update</option>
                    <option value="node-failure">Node failure</option>
                    <option value="server-leave">Server booted</option>
                    <option value="migration">Migration</option>
                    <option value="force-tcp">Force TCP</option>
                    <option value="force-tls">Force TURN/TLS</option>
                    <option value="subscribe-all">Subscribe all</option>
                    <option value="unsubscribe-all">Unsubscribe all</option>
                  </select>
                  <button
                    id="disconnect-room-button"
                    className="btn btn-danger mt-1"
                    disabled
                    type="button"
                    onClick={disconnectRoom}
                  >
                    Disconnect
                  </button>
                  <button
                    id="start-audio-button"
                    className="btn btn-secondary mt-1"
                    disabled
                    type="button"
                    onClick={startAudio}
                  >
                    Start Audio
                  </button>
                  <select
                    id="preferred-quality"
                    className="custom-select"
                    style={{ width: "auto" }}
                    onChange={handlePreferredQuality}
                  >
                    <option value="" selected>
                      PreferredQuality
                    </option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                  <select
                    id="preferred-fps"
                    className="custom-select"
                    style={{ width: "auto" }}
                    onChange={handlePreferredFPS}
                  >
                    <option value="" selected>
                      PreferredFPS
                    </option>
                    <option value="30">30</option>
                    <option value="15">15</option>
                    <option value="8">8</option>
                  </select>
                </div>
              </div>

              <div id="inputs-area">
                <div>
                  <select
                    id="video-input"
                    className="custom-select"
                    onChange={handleDeviceSelected}
                  >
                    <option selected>Video Input (default)</option>
                  </select>
                </div>
                <div>
                  <select
                    id="audio-input"
                    className="custom-select"
                    onChange={handleDeviceSelected}
                  >
                    <option selected>Audio Input (default)</option>
                  </select>
                </div>
                <div>
                  <select
                    id="audio-output"
                    className="custom-select"
                    onChange={handleDeviceSelected}
                  >
                    <option selected>Audio Output (default)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <h3>Chat</h3>
              <div id="chat-area">
                <textarea
                  className="form-control"
                  id="chat"
                  rows={9}
                ></textarea>
                <div id="chat-input-area">
                  <div>
                    <input
                      type="text"
                      className="form-control"
                      id="entry"
                      placeholder="Type your message here"
                    />
                  </div>
                  <div>
                    <button
                      id="send-button"
                      className="btn btn-primary"
                      type="button"
                      onClick={enterText}
                      // disabled
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="screenshare-area">
            <div>
              <span id="screenshare-info"> </span>
              <span id="screenshare-resolution"> </span>
            </div>
            <video id="screenshare-video" autoPlay playsinline></video>
          </div>

          <div id="participants-area"></div>

          <div id="log-area">
            <textarea id="log"></textarea>
          </div>
        </div>
        <footer className={styles.footer}>
          <a
            href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Powered by{" "}
            <span className={styles.logo}>
              <Image
                src="/vercel.svg"
                alt="Vercel Logo"
                width={72}
                height={16}
              />
            </span>
          </a>
        </footer>
      </div>
    </>
  );
}
