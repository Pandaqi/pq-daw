import AUDIO from "./audio"
import DISPLAY from "./display"
import DOM from "./dom"
import PLAYER from "./player"
import Track from "./track"
import Shortcuts from "./dom/shortcuts"
import Color from "./color"

const DEFAULTS = {
    tempo: 120,
    duration: 100,
    caption: ""
}

interface DAWParams
{
    node?: HTMLElement,
    parent?: HTMLElement,
    offline?: boolean
}

interface TrackParams
{
    node?: HTMLElement,
    parent?: Daw,
    num?: number,
    redraw?: boolean,
    track?: Track
}

interface DAWConfig
{
    tempo?: number,
    duration?: number,
    trackHeight?: number,
    trackWidth?: number,
    cursorWidth?: number,
    pixelsPerSecond?: number,
    secondsPerBeat?: number,
    colors?: Color[]
}

// represents one full daw interface, holds its tracks
export default class Daw 
{
    node: HTMLElement
    time: number
    soloActive: boolean
    startTime: number
    startContextTime: number
    loaded: boolean
    playing: boolean
    visualSeed: number
    trackControlsSetup: Record<string, string>
    controls: HTMLElement
    tracksContainer: HTMLElement
    tracks: Track[]
    offline: boolean
    contextOffline: OfflineAudioContext
    context: AudioContext
    metadataContainer: HTMLElement
    config: DAWConfig

    
    constructor(params:DAWParams = {})
    {
        this.setupContexts(params);
        this.node = this.setupHTML(params);

        this.setupTracks(params);

        this.time = 0;
        
        this.soloActive = false;
        this.startTime = 0;
        this.startContextTime = 0;
        this.loaded = false;
        this.playing = false;
        this.visualSeed = Math.random();
        this.trackControlsSetup = {}; // the dataset given through HTML about which controls a track should show

        const node = this.node;
        this.controls = node.getElementsByClassName("daw-controls")[0] as HTMLElement;
        this.tracksContainer = node.getElementsByClassName("daw-tracks")[0] as HTMLElement;

        const playBtn = node.getElementsByClassName("play-btn")[0];
        playBtn.addEventListener("click", this.togglePlayPause.bind(this));

        const stopBtn = node.getElementsByClassName("stop-btn")[0];
        stopBtn.addEventListener("click", this.reset.bind(this));

        const addTrackBtn = node.getElementsByClassName("addtrack-btn")[0];
        addTrackBtn.addEventListener("click", () => this.addTrack({ redraw: true }));

        const removeTrackBtn = node.getElementsByClassName("removetrack-btn")[0];
        removeTrackBtn.addEventListener("click", () => this.removeTrack({ redraw: true }));

        const downloadBtn = node.getElementsByClassName("download-btn")[0];
        downloadBtn.addEventListener("click", () => PLAYER.render(this) );

        const parentContainer = params.parent;
        if(!parentContainer) { return; }
        if(params.node) { parentContainer.insertBefore(node, params.node) }
        else { parentContainer.appendChild(node); }
    }

    setupHTML(params:DAWParams)
    {
        const node = params.node ?? { dataset: { caption: "" } };

        for(const key in DEFAULTS)
        {
            if(key in node.dataset) { continue; }
            node.dataset[key] = DEFAULTS[key];
        }

        // main <figure> element containing the DAW
        const main = document.createElement("figure");
        main.classList.add("pq-daw-wrapper", "no-hover");

        for(const key in node.dataset)
        {
            DOM.setProperty(main, key, node.dataset[key]);
        }

        // caption
        const captionContent = node.dataset.caption;
        if(captionContent != "")
        {
            const caption = document.createElement("figcaption");
            caption.classList.add("side-note");
            main.appendChild(caption);
    
            const captionLabel = document.createElement("span");
            captionLabel.innerHTML = captionContent;
            caption.appendChild(captionLabel)
        }
        
        // tracks container
        const tracks = document.createElement("div");
        tracks.classList.add("daw-tracks");
        main.appendChild(tracks);

        // controls
        const controls = document.createElement("div");
        controls.classList.add("daw-controls");
        main.appendChild(controls); 

        const buttons = ["play", "stop", "addtrack", "removetrack", "download"];
        for(const key of buttons)
        {
            const btn = document.createElement("button");
            btn.classList.add(key + "-btn", "icon", "icon-" + key);
            btn.title = Shortcuts.getTitleFor("all", { name: key });
            controls.appendChild(btn);
        }

        // metadata
        const metadataKeys = ["tempo", "duration", "numtracks", "numeffects", "feedback'"];
        const metadata = document.createElement("div");
        metadata.classList.add("daw-metadata");
        main.appendChild(metadata);

        for(const key of metadataKeys)
        {
            const span = document.createElement("span");
            span.classList.add(key + "-metadata");
            metadata.appendChild(span);
        }

        return main;
    }

    setupTracks(params:DAWParams)
    {
        this.tracks = [];

        if(!this.hasMasterTrack(params.node))
        {
            const masterTrack = this.addTrack();
            masterTrack.makeMaster();
        }

        this.generateConfig();

        // @NOTE: if no existing HTML given, stop here (no more tracks to add)
        if(!params.node) { return; }
        
        const trackNodes = Array.from(params.node.getElementsByClassName("pq-daw-track")) as HTMLElement[];
        for(const track of trackNodes)
        {
            this.addTrack({ node: track });
        }

        this.generateConfig();
    }

    addTrack(params:TrackParams = {})
    {
        params.parent = this;
        params.num = this.tracks.length;

        const newTrack = new Track(params);
        this.tracks.push(newTrack);
        if(params.redraw) { this.visualize(); }
        return newTrack;
    }

    removeTrack(params:TrackParams = {})
    {
        let index = this.tracks.length - 1;
        if(params.track) { index = this.tracks.indexOf(params.track); }

        this.tracks[index].remove();
        this.tracks.splice(index, 1);

        for(let i = 0; i < this.tracks.length; i++)
        {
            this.tracks[i].setNum(i);
        }

        if(params.redraw) { this.visualize(); }
    }

    recalculateAllVolumes()
    {
        this.checkSoloActive();
        for(const track of this.tracks)
        {
            track.recalculateVolume();
        }
    }

    checkSoloActive()
    {
        let hasSolo = false;
        const getProp = DOM.getProperty;
        for(const track of this.tracks)
        {
            if(getProp(track.node, "solo") != "true") { continue; }
            hasSolo = true;
            break;
        }

        this.soloActive = hasSolo;
    }

    isSoloActive()
    {
        return this.soloActive;
    }

    setupContexts(params)
    {
        this.offline = params.offline ?? false;

        // @NOTE: only used for rendering the full song; doesn't need visibilitychange for it's never visible
        if(this.isOffline())
        {
            const projectDuration = parseFloat(params.node.dataset.duration);
            console.log(projectDuration);
            const sampleRate = 48000; // 44100 seems standard, but I like this one better
            this.contextOffline = new OfflineAudioContext(2, sampleRate*projectDuration, sampleRate);
            return;
        }

        // @ts-ignore
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        this.context = new AudioContext();

        document.addEventListener("visibilitychange", event => {
            if (document.visibilityState === "visible") { this.context.resume(); } 
            else { this.context.suspend(); }
        });
    }

    updateMetadata()
    {
        this.metadataContainer = this.node.getElementsByClassName("daw-metadata")[0] as HTMLElement;

        const tempo = this.metadataContainer.getElementsByClassName("tempo-metadata")[0];
        tempo.innerHTML = "Tempo = " + DOM.getProperty(this.node, "tempo") + " BPM";

        const duration = this.metadataContainer.getElementsByClassName("duration-metadata")[0];
        duration.innerHTML = "Duration = " + Math.round(parseFloat(DOM.getProperty(this.node, "duration"))*100)/100 + " s";
    
        const numTracks = this.metadataContainer.getElementsByClassName("numtracks-metadata")[0];
        numTracks.innerHTML = "# Tracks = " + (this.tracks.length - 1);

        const numEffects = this.metadataContainer.getElementsByClassName("numeffects-metadata")[0];
        numEffects.innerHTML = "# Effects = " + this.getAllEffects().length;
    }

    readTimeFromContext()
    {
        this.startTime = this.time;
        this.startContextTime = this.getCurContextTime();
    }

    syncTimeWithContext()
    {
        const pureContextTime = this.getCurContextTime() - this.startContextTime;
        const startTimeOffset = this.startTime;
        this.setTime(startTimeOffset + pureContextTime);
    }

    isOffline()
    {
        return this.offline;
    }

    getContext()
    {
        if(this.isOffline()) { return this.contextOffline; }
        return this.context;
    }

    getCurContextTime()
    {
        return this.getContext().currentTime;
    }

    async loadResources()
    {
        const allPartSources = this.getAllPartSources();
        await AUDIO.checkAndLoadResources(this, allPartSources);
        this.onLoadFinished();
    }

    onLoadFinished()
    {
        // set parts to the correct length, now that we have their files
        for(const part of this.getAllParts())
        {
            part.calculateCorrectTimeParams();
        }
        
        this.loaded = true;
        this.listenForResize();
        this.visualize(true);
    }

    isLoaded()
    {
        return this.loaded;
    }

    async requestRestart()
    {
        if(!this.isPlaying()) { return; }
        
        await PLAYER.stop(this);
        await PLAYER.play(this);
    }
    
    async requestRestartForCallback(callback:Function)
    {
        const isPlaying = this.isPlaying();
        if(isPlaying) { await PLAYER.stop(this); }
        callback();
        if(isPlaying) { await PLAYER.play(this); }
    }

    getPixelsPerSecond()
    {
        return this.config.pixelsPerSecond;
    }

    getSecondsPerBeat()
    {
        return this.config.secondsPerBeat;
    }

    getTotalDurationFromTracks()
    {
        let maxLength = 0;
        for(const track of this.tracks)
        {
            maxLength = Math.max(track.getDuration(), maxLength);
        }
        return maxLength;
    }

    getTimeInPixels(time:number)
    {
        const timeClamped = Math.max(Math.min(time, this.config.duration), 0);
        return this.getPixelsPerSecond()*timeClamped;
    }

    getPixelsInTime(px:number)
    {
        const pixelsClamped = Math.max(Math.min(px, this.config.trackWidth), 0);
        return pixelsClamped / this.getPixelsPerSecond();
    }

    listenForResize()
    {
        const that = this;
        window.addEventListener("resize", (ev) => {
            setTimeout(() => that.visualize(true), 300);
        });
    }

    visualize(redrawParts = false)
    {
        if(this.isOffline()) { return; }
        this.generateConfig();
        DISPLAY.visualizeDaw(this, redrawParts);
    }

    getTracksContainer()
    {
        return this.node.getElementsByClassName("daw-tracks")[0];
    }

    // @IMPROV: this is a hacky way to get the width again every time
    // is there some clean way to get/set width once and be done?
    getTrackWidth()
    {
        for(const track of this.tracks)
        {
            if(!track.isVisible()) { continue; }
            return track.getWidth();
        }
    }

    generateConfig()
    {
        const noDurationSet = !this.getDuration() || (this.getDuration() == DEFAULTS.duration);
        if(noDurationSet)
        {
            const totalDuration = this.getTotalDurationFromTracks();
            if(!isNaN(totalDuration) && totalDuration > 0) { this.setDuration(totalDuration); }
        }

        this.config = {
            tempo: parseInt(this.node.dataset.tempo),
            duration: parseInt(this.node.dataset.duration),
            trackHeight: 150,
            trackWidth: this.getTrackWidth(),
            cursorWidth: 2,
        }

        this.config.pixelsPerSecond = this.config.trackWidth / this.config.duration;
        this.config.secondsPerBeat = this.config.tempo / 60.0;
        this.config.colors = DISPLAY.generateColors(this.visualSeed, this.tracks.length);
    }

    async togglePlayPause()
    {
        this.playing = !this.playing;
        if(this.playing) {
            await PLAYER.play(this);
        } else {
            await PLAYER.stop(this, false);
        }
    }

    async reset()
    {
        this.playing = false;
        await PLAYER.stop(this, true);
    }

    hasMasterTrack(cont:HTMLElement)
    {
        if(!cont) { return false; }
        
        const list = Array.from(cont.getElementsByClassName("pq-daw-track")) as HTMLElement[];
        for(const node of list)
        {
            if(node.dataset.id == "master") { return true; }
        }
        return false;
    }

    findTrackWithID(name = "master")
    {
        for(const track of this.tracks)
        {
            if(track.getName().toLowerCase() == name.toLowerCase()) { return track; }
        }
        return null;
    }

    getControlFromPathString(path:string)
    {
        const pathParts = path.split("/");
        if(pathParts.length <= 0) { return null; }

        const track = this.findTrackWithID(pathParts[0]);
        if(!track) { return null; }

        pathParts.splice(0,1);
        path = pathParts.join("/");
        return track.getControlFromPathString(path);
    }

    setTime(t:number)
    {
        const timeClamped = Math.max(Math.min(t, this.config.duration), 0);
        this.time = timeClamped;
        this.visualize();
    }

    getTime()
    {
        return this.time;
    }

    getTimeFromPercentage(perc:number)
    {
        return perc * this.config.duration;
    }

    advanceTime(dt:number)
    {
        this.setTime(this.time + dt);
    }

    atEndTime()
    {
        return this.time >= this.config.duration;
    }

    isPlaying()
    {
        return this.playing;
    }

    setDuration(d:number)
    {
        DOM.setProperty(this.node, "duration", d);
    }

    getDuration()
    {
        return parseFloat(DOM.getProperty(this.node, "duration"));
    }

    getConstantEffects()
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.getConstantEffects());
        }
        return arr; 
    }

    getAllEffects()
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.getEffects());
        }
        return arr; 
    }

    getAllParts()
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.parts);
        }
        return arr; 
    }

    getAllPartSources()
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.getAllPartSources());
        }
        return arr;
    }

    getPartsWithStatus(active = false)
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.getPartsWithStatus(active));
        }
        return arr;
    }

    getPartsAtCurrentTime(active = false)
    {
        let arr = [];
        for(const track of this.tracks)
        {
            arr = arr.concat(track.getPartsAtTime(this.time, active));
        }
        return arr;
    }
}