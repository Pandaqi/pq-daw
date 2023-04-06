import DISPLAY from "./display"
import DOM from "./dom"
import Part from "./part"
import Recorder from "./recorder"
import Plugin from "./plugin"
import Shortcuts from "./dom/shortcuts"

// represents one track, holds its parts
export default class Track {
    constructor(params)
    {
        this.daw = params.parent;
        this.num = params.num;
        this.defaults = {
            id: "",
            type: "regular", // "regular", "automation" or "bus"
            mute: false,
            solo: false,
            mono: false,
            phase: false,
            record: false,
            out: "master",
            effects: "",
            display: true,
            pan: 0,
            volume: 0,
            master: false,
            show: "",
            hide: "",
            bypass: false
        }

        this.node = this.setupHTML(params);
        
        const node = this.node;
        this.volumeDisplay = node.getElementsByClassName("volume-display")[0];
        this.volumeRect = node.getElementsByClassName("volume-display-rect")[0];
        
        this.trackControls = node.getElementsByClassName("track-controls")[0];
        this.trackContent = node.getElementsByClassName("track-content")[0];

            
        this.timeGridCanvas = this.trackContent.getElementsByClassName("time-grid")[0].getElementsByTagName("canvas")[0];
        this.cursor = this.trackContent.getElementsByClassName("time-cursor")[0];
        this.typeLabel = this.trackContent.getElementsByClassName("track-type-label")[0];
        this.typeLabel.innerHTML = this.getType().toUpperCase();

        // general DOM events
        // third parameter = false, means we capture this event in the BUBBLING phase
        // why? so click events on parts can capture it first and stop it if needed
        // Track CONTENT uses "mouseup", otherwise we use "click"
        this.trackContent.addEventListener("mouseup", this.placeTimeCursorAtClick.bind(this), false);
        this.node.addEventListener("click", () => DOM.changeFocusTo(this), true);
        
        this.trackName = this.node.getElementsByClassName("track-name")[0];
        if(this.allowEditingName)
        {
            DOM.createEditableText({ node: this.trackName, callback: this.setNameFromDOM.bind(this) });
        }

        this.outName = this.node.getElementsByClassName("out-name")[0];
        if(this.allowEditingOut)
        {
            DOM.createEditableText({ node: this.outName, callback: this.setOutFromDOM.bind(this) });
        }

        this.containers = {
            controls: this.trackControls,
            volume: this.volumeDisplay,
            effects: this.effectLabelsContainer,
            name: this.trackName
        }

        // must come here, so the buttons later can access vital stuff
        this.init();
        this.setupParts(params);
        
        // sliders (must come before buttons)
        const sliderKeys = ["volume", "pan"];
        this.sliders = {};
        for(const key of sliderKeys)
        {  
            const slider = node.getElementsByClassName(key)[0];
            if(!slider) { continue; }
            const defaultValue = parseFloat(DOM.getProperty(this.node, key));
            this.sliders[key] = slider;
            DOM.connectSlider(slider, this, (guiNode, ownerNode) => {
                ownerNode.changeSlider(key);
            });

            DOM.fakeSetSlider(slider, defaultValue);
        }

        // buttons
        const buttonKeys = ["mute", "solo", "mono", "phase", "record", "bypass", "reset"];
        this.buttons = {};
        for(const key of buttonKeys)
        {
            const btn = node.getElementsByClassName(key)[0];
            if(!btn) { continue; }
            this.buttons[key] = btn;

            const daw = this.daw;
            DOM.connectButton(btn, this, (guiNode, ownerNode) => {
                DOM.setProperty(ownerNode.node, key, guiNode.dataset.toggled);
                ownerNode.recalculateVolume();
                if(key == "solo") { daw.recalculateAllVolumes(); }
            });

            const defaultValue = DOM.getProperty(this.node, key);
            if(defaultValue == "true") { DOM.fakeClickButton(btn); }

            if(key == "reset")
            {
                DOM.makeButtonSingleClick(btn);
                btn.addEventListener("click", (ev) => { this.reset(); })
            }
        }

        this.showHideControls();
        this.setVisible(!(DOM.getProperty(this.node, "visible") == "false"));
    }

    changeSetupBasedOnTrackType(node)
    {
        this.useOutAsBus = true;
        this.showOut = false;
        this.allowEditingOut = false;
        this.createNodes = true;
        this.createEffects = true;
        this.allowEditingName = false;
        this.addBypassControls = false;

        const trackType = DOM.getProperty(node, "type");

        if(trackType == "automation")
        {
            this.useOutAsBus = false;
            this.createNodes = false;
            this.createEffects = false;
            this.showOut = true;
            this.allowEditingOut = true;
            this.addBypassControls = true;
        }
    }

    setupHTML(params)
    {
        const node = params.node || { dataset: {} };

        for(const key in this.defaults)
        {
            if(key in node.dataset) { continue; }
            node.dataset[key] = this.defaults[key];
        }

        if(params.node) {
            this.daw.trackControlsSetup = params.node.dataset;
        } else {
            // @IMPROV: this could be cleaner
            // if we don't create from an existing node, 
            //we still want to copy the original dataset that created the original nodes
            for(const key in this.daw.trackControlsSetup)
            {
                node.dataset[key] = this.daw.trackControlsSetup[key];
            }
        }

        //
        // main element containing the whole track
        //
        const main = document.createElement("div");
        main.classList.add("pq-daw-track");

        for(const key in node.dataset)
        {
            DOM.setProperty(main, key, node.dataset[key]);
        }

        this.changeSetupBasedOnTrackType(main);

        //
        // track controls
        //
        const controls = document.createElement("div");
        controls.classList.add("track-controls");
        main.appendChild(controls);

        // > Metadata
        const metadata = document.createElement("div");
        metadata.classList.add("track-metadata");
        controls.appendChild(metadata);

        const trackName = document.createElement("span");
        trackName.classList.add("track-name");
        trackName.innerHTML = DOM.getProperty(main, "id");
        metadata.appendChild(trackName);

        const outName = document.createElement("span");
        outName.classList.add("out-name");
        outName.innerHTML = DOM.getProperty(main, "out");
        metadata.appendChild(outName);

        if(!this.showOut) { outName.style.display = "none"; }

        // > Buttons
        const buttons = document.createElement("div");
        buttons.classList.add("track-buttons");
        
        const buttonKeys = { "mute": "M", "solo": "S", "phase": "P", "mono": "1/2", "record": "R", "bypass": "Bypass", "reset": "Reset" };
        for(const key in buttonKeys)
        {
            if(key == "mono") { continue; } // @TODO => don't know what to do with this button; functionality also isn't implemented}
            if(!this.createNodes && (key == "mute" || key == "solo" || key == "phase" || key == "mono" || key == "record")) { continue; }
            if(!this.addBypassControls && (key == "bypass" || key == "reset")) { continue; }

            const btn = document.createElement("button");
            btn.classList.add(key);
            btn.name = key;
            btn.title = Shortcuts.getTitleFor("tracks", { name: key });
            btn.innerHTML = buttonKeys[key];
            buttons.appendChild(btn);
        }
        controls.appendChild(buttons);

        // > Core controls
        const core = document.createElement("div");
        core.classList.add("track-core-controls");
        controls.appendChild(core);

        const pan = document.createElement("input");
        pan.type = "range";
        pan.classList.add("pan");
        pan.name = "pan";
        pan.min = -100;
        pan.max = 100;
        pan.step = 1;
        pan.title = Shortcuts.getTitleFor("tracks", { name: "pan" })
        core.appendChild(pan);

        if(!this.createNodes) { core.style.display = "none"; }

        // > Track effects
        // @NOTE: the actual buttons are added when each individual effect is added
        const effects = document.createElement("div");
        effects.classList.add("track-effects")
        controls.appendChild(effects);

        this.effectLabelsContainer = effects;

        if(!this.createNodes) { effects.style.display = "none"; }

        //
        // Volume display
        // (a bit more involved, because of how it's displayed)
        //
        const volume = document.createElement("div");
        volume.classList.add("volume-display");
        main.appendChild(volume);

        const volumeDisplay = document.createElement("div");
        volumeDisplay.classList.add("volume-display-container");
        volume.appendChild(volumeDisplay);

        const volumeDisplayRect = document.createElement("div");
        volumeDisplayRect.classList.add("volume-display-rect");
        volumeDisplay.appendChild(volumeDisplayRect);

        const volumeSlider = document.createElement("input");
        volumeSlider.type = "range";
        volumeSlider.classList.add("volume");
        volumeSlider.name = "volume";
        volumeSlider.min = -100
        volumeSlider.max = 0
        volumeSlider.title = Shortcuts.getTitleFor("tracks", { name: "volume"});
        volumeDisplay.appendChild(volumeSlider)

        if(!this.createNodes) { volume.innerHTML = ""; }

        //
        // Actual track content ( = individual parts)
        //
        const content = document.createElement("div");
        content.classList.add("track-content");
        main.appendChild(content);
        
        const grid = document.createElement("div");
        grid.classList.add("time-grid");
        content.appendChild(grid);

        const canvas = document.createElement("canvas");
        canvas.width = 0;
        canvas.height = 0;
        grid.appendChild(canvas);

        const cursor = document.createElement("div");
        cursor.classList.add("time-cursor");
        content.appendChild(cursor);

        const label = document.createElement("div");
        label.classList.add("track-type-label");
        content.appendChild(label);

        //
        // Effects container
        //
        let effectsContainer = document.createElement("div");
        effectsContainer.classList.add("pq-daw-track-effects");

        // if we're building the track from existing HTML (offline rendering, likely)
        // clone that and insert it into our container
        let oldContainer = node.nextElementSibling;
        if(oldContainer && !oldContainer.classList.contains("pq-daw-track-effects")) { oldContainer = null; }
        if(oldContainer)
        {
            effectsContainer = oldContainer.cloneNode(true);
        }

        this.effectWindowsContainer = effectsContainer;

        // insert this track AND our effects into the container of our DAW
        const parentContainer = params.parent.getTracksContainer();
        parentContainer.appendChild(main);
        parentContainer.appendChild(effectsContainer);

        return main;
    }

    setupParts(params)
    {
        this.parts = [];

        // @NOTE: below creates nodes based on the existing HTML given; so if none given, do nothing
        if(!params.node) { return; }

        const partNodes = params.node.getElementsByClassName("pq-daw-track-part");

        // an automation track converts all its parts into a line of points fed into one part
        // @NOTE: but it still keeps the old parts; remember, the HTML _is_ the state of the DAW
        if(this.isType("automation"))
        {
            const automation = [];
            for(const part of partNodes)
            {
                if(part.classList.contains("full-automation-part")) { continue; }
                automation.push({ time: parseFloat(part.dataset.start), value: parseFloat(part.dataset.source) })
            }
            this.addPart({ automation: automation });
        }

        // create the individual parts
        for(const part of partNodes)
        {
            this.addPart({ node: part });
        }
    }

    addPart(params)
    {
        params.parent = this;
        const newPart = new Part(params);

        if(params.dataset) { newPart.setDataFrom(params.dataset); } // immediately sets custom part parameters
        if(params.recalculate) { newPart.calculateCorrectTimeParams(); }
        
        this.parts.push(newPart);
        
        if(newPart.getOutputNode()) { newPart.getOutputNode().connect(this.analyserNode); }
        if(params.redraw) { DISPLAY.visualizeTrack(this.daw, this, true); }
        
        return newPart;
    }

    showHideControls()
    {
        let showList = DOM.getProperty(this.node, "show").split(",");
        const hideList = DOM.getProperty(this.node, "hide").split(",");
        const showAll = (showList.length <= 0 || showList[0] == "");

        // build one list with all interface elements
        const fullInterface = {};
        for(const key in this.buttons) { fullInterface[key] = this.buttons[key]; }
        for(const key in this.sliders) { fullInterface[key] = this.sliders[key]; }
        for(const key in this.containers) { fullInterface[key] = this.containers[key]; }

        if(showAll) { showList = Object.keys(fullInterface); }
        for(const key of Object.keys(fullInterface))
        {
            if(showList.includes(key) && !hideList.includes(key)) { continue; }
            fullInterface[key].style.display = "none";   
        }
    }

    // this function can be called any time a track is reset or gets breaking changes
    init()
    {
        this.initTrackName();
        this.initAudioNodes();
        this.initBus();
        this.initEffects();
    }

    initTrackName()
    {
        if(this.getName()) { return; }
        const randID = this.generateName();
        this.setName(randID);
    }

    setNameFromDOM(node)
    {
        const name = node.innerHTML;
        DOM.setProperty(this.node, "id", name);
    }

    getName()
    {
        return DOM.getProperty(this.node, "id");
    }

    setName(name)
    {
        DOM.setProperty(this.node, "id", name);
        this.trackName.innerHTML = name;
    }

    getControlFromPathString(path)
    {
        const pathParts = path.split("/");
        if(pathParts.length <= 1) { return null; }
        
        const containersToSearch = [];
        const type = pathParts[0];

        // we automate a control ...
        if(type == "control")
        {
            containersToSearch.push(this.trackControls.getElementsByClassName("track-metadata")[0]);
            containersToSearch.push(this.trackControls.getElementsByClassName("track-buttons")[0]);
            containersToSearch.push(this.trackControls.getElementsByClassName("track-core-controls")[0]);
            containersToSearch.push(this.volumeDisplay);
        } 
        
        // otherwise we assume it's an effect name
        if(containersToSearch.length <= 0)
        {
            const cont = this.effectWindowsContainer.getElementsByClassName(type)[0];
            if(cont) { containersToSearch.push(cont); }
        }

        const name = pathParts[1];
        return this.getControlWithName(containersToSearch, name);
    }
    
    getControlWithName(containers, name)
    {
        for(const cont of containers)
        {
            let list = cont.querySelectorAll("*[name='" + name + "']");
            if(list.length <= 0) { continue; }
            return list[0];
        }
        return null;
    }

    isBypassed()
    {
        return DOM.getProperty(this.node, "bypass") == "true";
    }

    getAutomationValueAt(time)
    {
        return this.parts[0].canvasDrawable.getValueAt(time);
    }

    getType()
    {
        return DOM.getProperty(this.node, "type");
    }

    isType(tp)
    {
        return this.getType() == tp;
    }

    initAudioNodes()
    {
        if(!this.createNodes) { return; }

        // destroy existing connections
        if(this.inputNode) { this.inputNode.disconnect(); }
        if(this.outputNode) { this.outputNode.disconnect(); }

        // create the base chain of audio nodes
        // + save where effects should slot in and out
        const ctx = this.daw.getContext();

        this.analyserNode = new AnalyserNode(ctx);
        this.analyserNode.fftSize = 1024;
        this.analyserNode.maxDecibels = 0;
        this.analyserNode.minDecibels = -128;

        this.inputNode = this.analyserNode;
        this.effectInputNode = this.inputNode;

        this.volumeNode = new GainNode(ctx);
        this.inputNode.connect(this.volumeNode);
        this.effectOutputNode = this.volumeNode;
        
        this.panNode = new StereoPannerNode(ctx);
        this.volumeNode.connect(this.panNode);

        this.outputNode = this.panNode;
    }

    initEffects()
    {
        this.effects = [];

        if(!this.createEffects) { return; }

        if(this.daw.isOffline())
        {
            const effectHTMLList = this.effectWindowsContainer.getElementsByClassName("effect");
            for(const effectHTML of effectHTMLList)
            {
                this.addEffect({ type: effectHTML.dataset.type, existingHTML: effectHTML });
            }
            return;
        }

        const effectKeys = DOM.getProperty(this.node, "effects").split(",");
        for(const key of effectKeys)
        {
            const keyClean = key.trim();
            if(keyClean == "") { continue; }
            this.addEffect({ type: keyClean });
        }
    }

    initBus()
    {
        if(!this.useOutAsBus) { return; }

        const ctx = this.daw.getContext();
        const busID = this.getOutPath();
        const busNode = this.daw.findTrackWithID(busID);

        if(!busNode) { this.outputNode.connect(ctx.destination); }
        else { this.outputNode.connect(busNode.getInputNode()); }
    }

    getSlider(key)
    {
        if(!(key in this.sliders)) { console.error("Slider with key " + key + " doesn't exist on track."); return null; }
        return this.sliders[key];
    }

    getButton(key)
    {
        if(!(key in this.buttons)) { console.error("Button with key " + key + " doesn't exist on track."); return null; }
        return this.buttons[key];
    }

    getInputNode()
    {
        return this.inputNode;
    }

    getOutputNode()
    {
        return this.outputNode;
    }

    getOutPath()
    {
        return DOM.getProperty(this.node, "out");
    }

    setOutFromDOM(node)
    {
        const value = node.innerHTML;
        DOM.setProperty(this.node, "out", value);
    }

    generateName()
    {
        return "Track #" + this.num;
    }

    isMaster()
    {
        return DOM.getProperty(this.node, "master") == "true";
    }

    setMaster()
    {
        DOM.setProperty(this.node, "master", true);
        this.setName("master");
        this.setVisible(false);
    }

    setNum(n)
    {
        this.num = n;
    }

    getNum()
    {
        return this.num;
    }

    getTrackContentContainer()
    {
        return this.trackContent;
    }

    getWidth()
    {
        return this.trackContent.offsetWidth;
    }

    getDuration()
    {
        if(this.isType("automation") || this.isType("bus")) { return 0; }

        let maxEndTime = 0;
        for(const part of this.parts)
        {
            maxEndTime = Math.max(maxEndTime, part.getEndTime());
        }
        return maxEndTime;
    }

    async placeTimeCursorAtClick(ev)
    {
        const localCoords = (ev.clientX - this.trackContent.getBoundingClientRect().left);
        const asPercentage = localCoords / this.getWidth();
        await this.daw.requestRestartForCallback(() => {
            this.daw.setTime(this.daw.getTimeFromPercentage(asPercentage));
        })
    }

    recalculateVolume()
    {
        if(!this.volumeNode) { return; }

        const sliderValue = parseFloat(this.sliders["volume"].value)
        DOM.setProperty(this.node, "volume", sliderValue);
        const dynamicGain = (sliderValue + 100) / 100.0; 
        let finalGain = dynamicGain;

        let soloActive = this.daw.isSoloActive();
        if(soloActive && !this.isSolo()) { finalGain = 0; }
        if(!soloActive && this.isMuted()) { finalGain = 0; }
        if(this.isPhaseInverted()) { finalGain *= -1; }

        const startTime = this.daw.getContext().currentTime;
        const duration = 0.01;
        this.volumeNode.gain.setTargetAtTime(finalGain, startTime, duration);
    }

    isMuted()
    {
        return DOM.getProperty(this.node, "mute") == "true"
    }

    isSolo()
    {
        if(this.isMaster()) { return true; }
        return DOM.getProperty(this.node, "solo") == "true";
    }

    isPhaseInverted()
    {
        return DOM.getProperty(this.node, "phase") == "true";
    }

    isVisible()
    {
        return DOM.getProperty(this.node, "visible") == "true";
    }

    setVisible(val)
    {
        DOM.setProperty(this.node, "visible", val);
        if(val) { this.node.style.display = "flex";}
        else { this.node.style.display = "none"; }
    }

    isRecordEnabled()
    {
        return DOM.getProperty(this.node, "record") == "true";   
    }

    hasActiveRecording()
    {
        return this.recorder.getState() == "recording";
    }

    async startRecording(startTime = 0)
    {
        this.recorder = new Recorder();
        await this.recorder.start(startTime);
    }

    async stopRecording(stopTime = 0)
    {
        this.recorder.stop(stopTime);
        await this.recorder.saveInBuffer(this.daw);

        const newPart = this.addPart(this.recorder.getPartParams());
    }

    changeSlider(key)
    {
        if(key == "volume") { this.recalculateVolume(); }
        else if(key == "pan") { this.changePanning(); }
    }

    changePanning()
    {
        if(!this.panNode) { return; }
        const sliderValue = parseFloat(this.sliders["pan"].value);
        DOM.setProperty(this.node, "pan", sliderValue);
        const newPan = sliderValue / 100.0;
        const startTime = this.daw.getContext().currentTime;
        const duration = 0.01;
        this.panNode.pan.setTargetAtTime(newPan, startTime, duration);
    }

    getAnalyser()
    {
        return this.analyserNode;
    }

    getPartsWithStatus(active = false)
    {
        const arr = [];
        for(const part of this.parts)
        {
            if(part.isPlaying() != active) { continue; }
            arr.push(part);
        }
        return arr;
    }

    getPartsAtTime(time = 0, active = false)
    {
        const arr = [];
        for(const part of this.parts)
        {
            if(!part.isActiveAtTime(time)) { continue; }
            if(active != null && part.isPlaying() != active) { continue; }
            arr.push(part);
        }
        return arr;
    }

    getAllPartSources()
    {
        const arr = [];
        for(const part of this.parts)
        {
            if(!part.hasLoadableSource()) { continue; }
            arr.push(part.getSource());
        }
        return arr;
    }

    getConstantEffects()
    {
        const arr = [];
        for(const effect of this.effects)
        {
            if(!effect.isConstant()) { continue; }
            arr.push(effect);
        }
        return arr;
    }

    removePart(part)
    {
        const idx = this.parts.indexOf(part);
        if(idx < 0) { console.error("Tried to remove non-existing part!"); return; }
        this.parts[idx].remove();
        this.parts.splice(idx, 1);
    }

    removeAllParts(removeHTML = false)
    {
        if(!this.parts) { return; }
        if(removeHTML)
        {
            const partNodes = this.node.getElementsByClassName("pq-daw-track-part");
            for(const partNode of partNodes)
            {
                partNode.remove();
            } 
        }
        
        for(let i = this.parts.length - 1; i >= 0; i--)
        {
            this.removePart(this.parts[i]);
        }
    }

    injectEffectIntoAudioChain(effect, idx = -1)
    {
        if(idx == -1) { idx = this.effects.length; }

        let startNode = this.effectInputNode;
        let endNode = this.effectOutputNode;
        if(idx > 0) { 
            startNode = this.effects[idx-1].getOutputNode();
        }

        if(idx < this.effects.length - 2) { endNode = this.effects[idx].getInputNode(); }

        // destroy old connection (specifically, a catch-all "disconnect()" seems dangerous)
        startNode.disconnect(endNode);

        // create the new one
        startNode.connect(effect.getInputNode());
        effect.getOutputNode().connect(endNode);
    }

    extractEffectFromAudioChain(effect)
    {
        const idx = this.effects.indexOf(effect);

        // remove it from the chain
        const myInputNode = effect.getInputNode();
        const myOutputNode = effect.getOutputNode();
        const prevNode = (idx == 0) ? this.effectInputNode : this.effects[idx - 1].getOutputNode();
        const nextNode = (idx < this.effects.length - 1) ? this.effects[idx + 1].getInputNode() : this.effectOutputNode;

        // reconnect the effects around us
        prevNode.disconnect(myInputNode);
        myOutputNode.disconnect(nextNode);
        prevNode.connect(nextNode);
    }

    addEffect(params = {})
    {
        if(!this.createEffects) { return; }
        if(!params.type) { console.error("Can't add effect without type"); return; }

        // add button to click on
        const type = params.type;
        const btn = document.createElement("button");
        btn.classList.add("effect", type, "icon", "icon-" + type);
        btn.name = "effect-" + type;
        btn.title = Shortcuts.getTitleFor("tracks", { name: type });
        btn.dataset.name = type;
        this.effectLabelsContainer.appendChild(btn);
        
        params.button = btn;
        params.parent = this;

        // add the actual plugin
        const effect = new Plugin(params);
        this.injectEffectIntoAudioChain(effect);
        this.effects.push(effect);

        DOM.connectPluginButton(btn, this, effect)

        return effect;
    }

    removeEffect(effect)
    {
        const idx = this.effects.indexOf(effect);
        if(idx == -1) { return; }

        this.extractEffectFromAudioChain(effect);

        effect.remove();
        this.effects.splice(idx, 1);   
    }

    removeLastEffect()
    {
        if(this.effects.length <= 0) { return; }
        this.removeEffect(this.effects[this.effects.length - 1]);
    }

    getEffects()
    {
        return this.effects;
    }

    queueRemoval()
    {
        this.daw.removeTrack({ track: this, redraw: true });
    }

    // @IMPROV: also implement a "reset" for audio tracks?
    // (Would need to somehow save their initial state. Or does it just completely _empty_ it?)
    reset()
    {
        if(this.isType("automation")) { this.parts[0].canvasDrawable.reset(); }
    }

    remove()
    {
        this.node.remove();
    }
}
