// represents one full daw interface, holds its tracks
PQ_DAW.Daw = class {
    constructor(params = {})
    {
        this.setupContexts(params);
        this.defaults = {
            tempo: 120,
            duration: 100,
            caption: ""
        }
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
        this.controls = node.getElementsByClassName("daw-controls")[0];
        this.tracksContainer = node.getElementsByClassName("daw-tracks")[0];

        const playBtn = node.getElementsByClassName("play-btn")[0];
        playBtn.addEventListener("click", this.togglePlayPause.bind(this));

        const stopBtn = node.getElementsByClassName("stop-btn")[0];
        stopBtn.addEventListener("click", this.reset.bind(this));

        const addTrackBtn = node.getElementsByClassName("addtrack-btn")[0];
        addTrackBtn.addEventListener("click", () => this.addTrack({ redraw: true }));

        const removeTrackBtn = node.getElementsByClassName("removetrack-btn")[0];
        removeTrackBtn.addEventListener("click", () => this.removeTrack({ redraw: true }));

        const downloadBtn = node.getElementsByClassName("download-btn")[0];
        downloadBtn.addEventListener("click", () => PQ_DAW.PLAYER.render(this) );

        const parentContainer = params.parent;
        if(!parentContainer) { return; }
        if(params.node) { parentContainer.insertBefore(node, params.node) }
        else { parentContainer.appendChild(node); }
    }

    setupHTML(params)
    {
        const node = params.node || { dataset: {} };
        const dom = PQ_DAW.DOM;

        for(const key in this.defaults)
        {
            if(key in node.dataset) { continue; }
            node.dataset[key] = this.defaults[key];
        }

        // main <figure> element containing the DAW
        const main = document.createElement("figure");
        main.classList.add("pq-daw-wrapper", "no-hover");

        for(const key in node.dataset)
        {
            dom.setProperty(main, key, node.dataset[key]);
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
            btn.title = dom.getTitleForShortcut("all", { name: key });
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

    setupTracks(params)
    {
        this.tracks = [];

        if(!this.hasMasterTrack(params.node))
        {
            const masterTrack = this.addTrack();
            masterTrack.setMaster(true);
        }

        this.generateConfig();

        // @NOTE: if no existing HTML given, stop here (no more tracks to add)
        if(!params.node) { return; }
        
        const trackNodes = params.node.getElementsByClassName("pq-daw-track");
        for(const track of trackNodes)
        {
            this.addTrack({ node: track });
        }

        this.generateConfig();
    }

    addTrack(params = {})
    {
        params.parent = this;
        params.num = this.tracks.length;

        const newTrack = new PQ_DAW.Track(params);
        this.tracks.push(newTrack);
        if(params.redraw) { this.visualize(); }
        return newTrack;
    }

    removeTrack(params = {})
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
        const getProp = PQ_DAW.DOM.getProperty;
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
        this.offline = params.offline || false;

        // @NOTE: only used for rendering the full song; doesn't need visibilitychange for it's never visible
        if(this.isOffline())
        {
            const projectDuration = parseFloat(params.node.dataset.duration);
            console.log(projectDuration);
            const sampleRate = 48000; // 44100 seems standard, but I like this one better
            this.contextOffline = new OfflineAudioContext(2, sampleRate*projectDuration, sampleRate);
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContext();

        document.addEventListener("visibilitychange", event => {
            if (document.visibilityState === "visible") { this.context.resume(); } 
            else { this.context.suspend(); }
        });
    }

    updateMetadata()
    {
        const dom = PQ_DAW.DOM;
        this.metadataContainer = this.node.getElementsByClassName("daw-metadata")[0];

        const tempo = this.metadataContainer.getElementsByClassName("tempo-metadata")[0];
        tempo.innerHTML = "Tempo = " + dom.getProperty(this.node, "tempo") + " BPM";

        const duration = this.metadataContainer.getElementsByClassName("duration-metadata")[0];
        duration.innerHTML = "Duration = " + Math.round(parseFloat(dom.getProperty(this.node, "duration"))*100)/100 + " s";
    
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
        await PQ_DAW.AUDIO.checkAndLoadResources(this, allPartSources);
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
        
        await PQ_DAW.PLAYER.stop(this);
        await PQ_DAW.PLAYER.play(this);
    }
    
    async requestRestartForCallback(callback)
    {
        const isPlaying = this.isPlaying();
        if(isPlaying) { await PQ_DAW.PLAYER.stop(this); }
        callback();
        if(isPlaying) { await PQ_DAW.PLAYER.play(this); }
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

    getTimeInPixels(time)
    {
        const timeClamped = Math.max(Math.min(time, this.config.duration), 0);
        return this.getPixelsPerSecond()*timeClamped;
    }

    getPixelsInTime(px)
    {
        const pixelsClamped = Math.max(Math.min(px, this.config.trackWidth), 0);
        return pixelsClamped / this.getPixelsPerSecond();
    }

    listenForResize()
    {
        const that = this;
        window.addEventListener("resize", (ev) => {
            setTimeout(that.visualize(true), 300);
        });
    }

    visualize(redrawParts = false)
    {
        if(this.isOffline()) { return; }
        this.generateConfig();
        PQ_DAW.DISPLAY.visualizeDaw(this, redrawParts);
    }

    getTracks()
    {
        return this.tracks;
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
        const noDurationSet = !this.getDuration() || (this.getDuration() == this.defaults.duration);
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
        this.config.colors = PQ_DAW.DISPLAY.generateColors(this.visualSeed, this.tracks.length);
    }

    async togglePlayPause()
    {
        this.playing = !this.playing;
        if(this.playing) {
            await PQ_DAW.PLAYER.play(this);
        } else {
            await PQ_DAW.PLAYER.stop(this, false);
        }
    }

    async reset()
    {
        this.playing = false;
        await PQ_DAW.PLAYER.stop(this, true);
    }

    hasMasterTrack(cont)
    {
        if(!cont) { return false; }
        
        const list = cont.getElementsByClassName("pq-daw-track");
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

    getControlFromPathString(path)
    {
        const pathParts = path.split("/");
        if(pathParts.length <= 0) { return null; }

        const track = this.findTrackWithID(pathParts[0]);
        if(!track) { return null; }

        pathParts.splice(0,1);
        path = pathParts.join("/");
        return track.getControlFromPathString(path);
    }

    setTime(t)
    {
        const timeClamped = Math.max(Math.min(t, this.config.duration), 0);
        this.time = timeClamped;
        this.visualize();
    }

    getTime()
    {
        return this.time;
    }

    getTimeFromPercentage(perc)
    {
        return perc * this.config.duration;
    }

    advanceTime(dt)
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

    setDuration(d)
    {
        PQ_DAW.DOM.setProperty(this.node, "duration", d);
    }

    getDuration()
    {
        return parseFloat(PQ_DAW.DOM.getProperty(this.node, "duration"));
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