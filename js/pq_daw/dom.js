// layer for interaction between data behind the scenes and the DOM/HTML
PQ_DAW.DOM = {

    shortcuts: {

        all: {
            "Space": { type: "custom", name: "play" },
            "Escape": { type: "custom", name: "stop" }
        },

        tracks: {
            "m": { type: "button", name: "mute" },
            "v": { type: "slider", name: "volume", value: 5 },
            "b": { type: "slider", name: "volume", value: -5 },
            "q": { type: "slider", name: "pan", value: -5 },
            "w": { type: "slider", name: "pan", value: 5 },
            "s": { type: "button", name: "solo" },
            "p": { type: "button", name: "phase" },
            "r": { type: "button", name: "record" },
    
            "C": { type: "effect", name: "compressor", shift: true },
            "E": { type: "effect", name: "equalizer", shift: true },
            "D": { type: "effect", name: "delay", shift: true },
            "X": { type: "effect", name: "distortion", shift: true },
            "N": { type: "effect", name: "noise", shift: true },
            "R": { type: "effect", name: "reverb", shift: true },
        },

        parts: {
            "f": { type: "fade", value: 0.1 },
            "g": { type: "fade", value: -0.1 }
        }

    },

    init()
    {
        this.focusNode = null;
        this.registerShortcuts();
    },

    isType(node, classInstance)
    {
        return node instanceof classInstance;
    },

    changeFocusTo(node)
    {
        this.releaseFocus(this.focusNode);
        this.addFocus(node);
    },

    addFocus(node)
    {
        this.focusNode = node;
        if(this.focusNode.node) { this.focusNode.node.classList.add("pq-daw-dom-focus"); }
        else { this.focusNode.classList.add("pq-daw-dom-focus"); }
    },

    releaseFocus(node)
    {
        if(!node) { return; }
        if(this.focusNode.node) { this.focusNode.node.classList.remove("pq-daw-dom-focus"); }
        else { this.focusNode.classList.remove("pq-daw-dom-focus"); }
    },

    allPropertiesMatch(obj1, obj2)
    {
        for(const key in obj2)
        {
            if(!(key in obj1)) { return false; }
            if(obj1[key] != obj2[key]) { return false; }
        }
        return true;
    },

    getTitleForShortcut(focusNode = "tracks", params)
    {
        const matches = [];
        const name = params.name || "";
        let useShift = false;
        for(const [key, value] of Object.entries(this.shortcuts[focusNode]))
        {
            if(!this.allPropertiesMatch(value, params)) { continue; }
            matches.push(key.toUpperCase());
            if(value.shift) { useShift = true; }
        }
        if(matches.length <= 0) { return "No shortcut"; }
        
        let string = "Shortcut";
        if(name != "") { string += " (" + name + ")"; }
        string += ": ";
        if(useShift) { string += "SHIFT+"; }
        string += matches.join("/");
        return string;
    },

    executeShortcut(nodes, data)
    {
        if(data.type == "button")
        {
            this.fakeClickButton(nodes.node.getButton(data.name));
        }
        else if(data.type == "slider")
        {
            this.fakeChangeSlider(nodes.node.getSlider(data.name), data.value);
        }
        else if(data.type == "effect")
        {
            nodes.node.addEffect({ type: data.name });
        }
        else if(data.type == "fade")
        {
            nodes.node.changeFade(data.value);
        }
        else if(data.type == "custom")
        {
            if(data.name == "play")
            {
                nodes.daw.togglePlayPause();
            }
            else if(data.name == "stop")
            {
                nodes.daw.reset();
            }
        }
    },

    registerShortcuts()
    {
        document.addEventListener('keydown', (ev) => {
            const name = ev.key;
            const shift = ev.shiftKey;
            const code = ev.code;

            const node = this.focusNode;
            if(!node) { return true; }

            const isTrack = this.isType(node, PQ_DAW.Track);
            const isPart = this.isType(node, PQ_DAW.Part);
            const isTextInput = this.isType(node, HTMLElement) && node.hasAttribute("contenteditable");


            let daw = null;
            let track = null;
            let part = null;

            if(isTrack) { daw = node.daw; track = node; }
            if(isPart) { daw = node.getDaw(); track = node.track; part = node; }

            const nodes = { daw: daw, track: track, part: part, node: node }
            let didSomething = false;

            // general daw controls (accessible anywhere)
            if(isTrack || isPart)
            {
                if(code in this.shortcuts.all)
                {
                    this.executeShortcut(nodes, this.shortcuts.all[code]);
                    didSomething = true;
                }
            }

            // general track controls (also accessible if part selected)
            if(isTrack)
            {
                if(name == "Delete") { 
                    if(shift) { node.removeLastEffect(); }
                    else { node.queueRemoval(); }
                }

                if(name in this.shortcuts.tracks)
                {
                    this.executeShortcut(nodes, this.shortcuts.tracks[name]);
                    didSomething = true;
                }
            }

            if(isPart)
            {
                if(name == "Delete") { node.queueRemoval(); }

                if(name in this.shortcuts.parts)
                {
                    this.executeShortcut(nodes, this.shortcuts.parts[name]);
                    didSomething = true;
                }
            }

            if(!didSomething) { return true; }

            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return false;
        });

    },

    Slider: class {
        constructor(owner, nodes, params)
        {
            this.owner = owner;
            this.nodes = nodes;
            this.params = params;

            const defaultParams = { audioParams: [], unit: "percentage", callback: null, autoConnect: false };
            for(const key in defaultParams)
            {
                if(key in this.params) { continue; }
                this.params[key] = defaultParams[key];
            }

            if(!Array.isArray(this.params.audioParams)) { this.params.audioParams = [this.params.audioParams]; }
            this.createAutoConnection();
        }

        needsAutoConnection()
        {
            return (this.params.unit || this.params.audioParams || this.params.callback) || this.params.autoConnect;
        }

        createAutoConnection()
        {
            if(!this.needsAutoConnection()) { return; }

            PQ_DAW.DOM.connectSlider(this.nodes.slider, this, () => {
                const name = this.nodes.slider.name;

                let val = this.getValueAsFloat();
                if(this.params.unit == "none") { val = this.getValue(); }
                if(this.params.unit == "gain") { val = this.getValueAsGain(); }

                PQ_DAW.DOM.setProperty(this.owner, name, val);

                for(const param of this.params.audioParams)
                {
                    param.setTargetAtTime(val, null, 0.03);
                }

                if(this.params.callback)
                {
                    this.params.callback(val);
                }

                this.setDisplay(val);
            });
        }

        getValue()
        {
            return parseInt(this.nodes.slider.value);
        }

        getValueAsFloat()
        {
            return parseFloat(this.nodes.slider.value);
        }

        getValueAsGain()
        {
            return PQ_DAW.AUDIO.decibelsToGain(this.getValueAsFloat());
        }

        setDisplay(val, unit = this.params.unit)
        {
            let string = "";
            if(unit == "percentage") { string = Math.round(val * 100) + "%"; }
            if(unit == "time") { string = val + "s"; }
            if(unit == "none") { string = val.toString(); }
            if(unit == "dimensionless") { string = (Math.round(val * 100)/100).toString(); }
            if(unit == "decibels") { string = val + "dB"; }
            if(unit == "gain") { string = Math.round(PQ_DAW.AUDIO.gainToDecibels(val)) + "dB"; }
            if(unit == "ratio") { string = "1:" + val; }
            if(unit == "hertz") { 
                if(val >= 1000) { string = Math.round(val/1000*10)/10 + "kHz"; }
                else { string = val + "Hz"; }
            }

            this.nodes.display.innerHTML = "(" + string + ")";
        }
    },

    Dragger: class {
        constructor(node)
        {
            this.node = node;
            this.dragging = false;
            this.lastDrag = { x: 0, y: 0 }
            this.callback = null

            this.node.addEventListener('mousedown', this.onDragStart.bind(this), true);
            document.addEventListener('mousemove', this.onDragProgress.bind(this), true);
            document.addEventListener('mouseup', this.onDragEnd.bind(this), true);
            //this.node.addEventListener('mouseleave', this.onMouseLeave.bind(this), true);
        }

        onDragStart(ev)
        {
            this.dragging = true;
            this.lastDrag = { x: ev.clientX, y: ev.clientY }
        }

        onDragProgress(ev)
        {
            if(!this.dragging) { return; }

            const curDrag = { x: ev.clientX, y: ev.clientY }
            let delta = { x: curDrag.x - this.lastDrag.x, y: curDrag.y - this.lastDrag.y }
            this.lastDrag = curDrag;

            if(this.callback) { this.callback(delta); }
        }

        onDragEnd(ev = null)
        {   
            if(!this.dragging) { return; }
            
            this.dragging = false;
            if(ev) { ev.stopPropagation(); ev.preventDefault(); ev.stopImmediatePropagation(); }
            return false;
        }

        onMouseLeave()
        {
            this.onDragEnd(null)
        }
    },

    Drawable: class {
        constructor(part, canv)
        {
            this.part = part;
            this.canvas = canv;
            this.drawing = false;
            this.line = [];
            this.config = {
                strokeStyle: "#00FF00",
                fillStyle: "#00FF00",
                lineWidth: 4,
                radius: 8,
                minDistBetweenPoints: 10,
                minDistBetweenPointsVisual: 40
            }

            canv.addEventListener('mousedown', this.onDrawStart.bind(this), true);
            canv.addEventListener('mousemove', this.onDrawProgress.bind(this), true);
            canv.addEventListener('mouseup', this.onDrawEnd.bind(this), true);
            canv.addEventListener('mouseleave', this.onMouseLeave.bind(this), true);
        }

        setDefaultLine()
        {
            this.reset();
        }

        // @NOTE: px is always horizontal, so the X-axis
        // @NOTE: returns it as a ratio between 0 and 1
        getValueAt(time)
        {
            if(this.line.length < 2) { return 1.0; }

            this.sortPoints();

            let startPoint = null;
            let endPoint = null;
            for(let i = 1; i < this.line.length; i++)
            {
                if(this.line[i-1].time <= time && this.line[i].time >= time)
                {
                    startPoint = this.line[i-1];
                    endPoint = this.line[i];
                    break;
                }
            }

            if(startPoint == null) { startPoint = this.line[0]; }
            if(endPoint == null) { endPoint = this.line[this.line.length-1]; }

            const interpolatedTime = (time - startPoint.time) / (endPoint.time - startPoint.time);
            const interpolatedValue = startPoint.value + interpolatedTime * (endPoint.value - startPoint.value);
            return interpolatedValue;
        }

        reset(redraw = true)
        {
            this.line = [];

            const margin = 5
            this.registerPoint({ x: margin, y: margin }, true);
            this.registerPoint({ x: this.canvas.width-margin, y: margin }, true);
            this.redraw();
        }

        visualize(color)
        {
            this.config.strokeStyle = color;
            this.config.fillStyle = color;
            this.redraw();
        }

        redraw()
        {
            this.sortPoints();
            this.drawPoints();
            this.updateHTML();
        }

        updateHTML()
        {
            const partNodes = this.part.node.parentElement.getElementsByClassName("pq-daw-track-part");
            for(const part of partNodes)
            {
                if(part.classList.contains("full-automation-part")) { continue; }
                part.remove();
            }

            for(const point of this.line)
            {
                this.part.track.addPart({ dataset: { source: Math.round(point.value*100)/100, start: Math.round(point.time*100)/100 } });
            }     
        }

        sortPoints()
        {
            this.line.sort((a,b) => a.time - b.time);
        }

        drawPoints()
        {
            if(this.line.length < 2) { return; }

            const linePixels = [];
            for(const point of this.line)
            {
                linePixels.push({
                    x: this.getTimeInPixels(point.time), 
                    y: this.getValueInPixels(point.value)
                });
            }

            // the actual line
            const ctx = this.canvas.getContext("2d");
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.beginPath();
            ctx.moveTo(linePixels[0].x, linePixels[0].y);

            for(let i = 1; i < linePixels.length; i++)
            {
                ctx.lineTo(linePixels[i].x, linePixels[i].y);
            }

            ctx.strokeStyle = this.config.strokeStyle;
            ctx.lineWidth = this.config.lineWidth;
            ctx.stroke();

            // the dots where it changes
            ctx.fillStyle = this.config.fillStyle;
            ctx.beginPath();
            let prevPoint = null;
            for(let i = 0; i < linePixels.length; i++)
            {
                if(prevPoint) 
                {
                    const distToPrev = Math.pow(linePixels[i].x - prevPoint.x, 2) + Math.pow(linePixels[i].y - prevPoint.y, 2);
                    if(distToPrev <= Math.pow(this.config.minDistBetweenPointsVisual, 2)) { continue; }
                }
                prevPoint = linePixels[i];

                ctx.beginPath();
                ctx.arc(linePixels[i].x, linePixels[i].y, this.config.radius, 0, 2 * Math.PI, false);
                ctx.fill();
            }
        }

        setLine(line)
        {
            this.line = line;
        }

        getPixelsInTime(px)
        {
            return this.part.getDaw().getPixelsInTime(px);
        }

        getTimeInPixels(time)
        {
            return this.part.getDaw().getTimeInPixels(time);
        }

        getValueInPixels(value)
        {
            return (1.0 - value)*this.canvas.height;
        }

        getPixelsInValue(px)
        {
            return 1.0 - (px / this.canvas.height);
        }

        registerPoint(point, isLocal = false)
        {
            let x = point.x, y = point.y;

            if(!isLocal)
            {
                x -= this.canvas.getBoundingClientRect().x;
                y -= this.canvas.getBoundingClientRect().y;
            }


            // if we're very close to an existing point, reuse that and update y (don't add a new one)
            let addNew = true;
            for(let i = 0; i < this.line.length; i++)
            {
                const xDist = Math.abs(this.getTimeInPixels(this.line[i].time) - x);
                if(xDist >= this.config.minDistBetweenPoints) { continue; }
                this.line[i].value = this.getPixelsInValue(y);
                addNew = false;
            }

            if(addNew) 
            { 
                this.line.push({ time: this.getPixelsInTime(x), value: this.getPixelsInValue(y) }); 
            }
            this.redraw();
        }

        preventDefaults(ev)
        {
            if(!ev) { return false; }
            ev.stopPropagation(); 
            ev.preventDefault();
            return false;
        }

        onDrawStart(ev)
        {
            this.drawing = true;
            this.registerPoint({ x: ev.clientX, y: ev.clientY });
            return this.preventDefaults(ev);
        }

        onDrawProgress(ev)
        {
            if(!this.drawing) { return; }
            this.registerPoint({ x: ev.clientX, y: ev.clientY });
            return this.preventDefaults(ev);
        }

        onDrawEnd(ev)
        {
            this.drawing = false;
            return this.preventDefaults(ev);
        }

        onMouseLeave()
        {
            this.onDrawEnd(null);
        }
    },

    setProperty(node, key, val)
    {
        node.dataset[key] = val;
    },

    setProperties(node, keys, vals)
    {
        for(let i = 0; i < keys.length; i++)
        {
            node.dataset[keys[i]] = vals[i];
        }
    },

    getProperty(node, key)
    {
        return node.dataset[key];
    },

    toggleButton(guiNode, ownerNode)
    {
        if(guiNode.dataset.toggled == "true") {
            guiNode.classList.remove("daw-btn-enabled");
            guiNode.dataset.toggled = "false";
            if(guiNode.innerHTML.toLowerCase() == "on") { guiNode.innerHTML = "Off"; }
        } else {
            guiNode.dataset.toggled = "true";
            guiNode.classList.add("daw-btn-enabled");
            if(guiNode.innerHTML.toLowerCase() == "off") { guiNode.innerHTML = "On"; }
        }

        // if it's a single-click button (no "on/off"), just click again
        if(guiNode.dataset.onetime == "true" && guiNode.dataset.toggled == "true")
        {
            this.toggleButton(guiNode, ownerNode);
        }
    },

    togglePlugin(plugin)
    {
        if(!plugin.isVisible()) { plugin.setVisible(true); }
        else { plugin.setVisible(false); }
    },

    addDefaults(params, defaults)
    {
        for(const key in defaults)
        {
            if(key in params) { continue; }
            params[key] = defaults[key]
        }
    },

    createEffectControlContainer(container, params)
    {
        const controlContainer = document.createElement("div");
        controlContainer.classList.add("effect-control-container");
        container.appendChild(controlContainer);

        const labelContainer = document.createElement("div");
        labelContainer.classList.add("label-container");
        controlContainer.appendChild(labelContainer);
        
        const label = document.createElement("label");
        label.innerHTML = params.text;
        label.for = params.name;
        labelContainer.appendChild(label);
        
        const display = document.createElement("span");
        display.classList.add('value-display');
        labelContainer.appendChild(display);

        return controlContainer;
    },

    createDropdown(owner, params)
    {
        const container = (params.cont) ? params.cont : owner;
        const defaults = { text: "Untitled", name: "untitled", callback: () => {}, keys: ["No options"], values: [""] };
        this.addDefaults(params, defaults);

        const controlContainer = this.createEffectControlContainer(container, params);
        controlContainer.classList.add("effect-subsection");

        const select = document.createElement("select");
        select.name = params.name;

        for(let i = 0; i < params.keys.length; i++)
        {
            const key = params.keys[i];
            const val = params.values[i];

            const option = document.createElement("option");
            option.value = val;
            option.innerHTML = key;
            select.appendChild(option);
        }
        controlContainer.appendChild(select);

        select.addEventListener("change", () => {
            const val = select[select.selectedIndex].value;
            this.setProperty(owner, params.name, val);
            params.callback.call(this, select, owner);
        });

        this.fakeSelectDropdown(select);
    },

    // @IMPROV: also put this into its own neat class + return that, like slider?
    createButton(owner, params)
    {
        const container = (params.cont) ? params.cont : owner;
        const defaults = { value: false, text: "Untitled", name: "untitled", callback: () => {} };
        this.addDefaults(params, defaults);

        const controlContainer = this.createEffectControlContainer(container, params);

        const btn = document.createElement("button");
        btn.innerHTML = "Off";
        controlContainer.appendChild(btn);
        this.connectButton(btn, owner, (guiNode, ownerNode) => { 
            this.setProperty(owner, params.name, guiNode.dataset.toggled);
            params.callback.call(this, guiNode, ownerNode);
        });

        if(params.value) { this.fakeClickButton(btn); }
    },

    createSlider(owner, params = {})
    {
        const container = (params.cont) ? params.cont : owner;
        const defaults = { min: 0, max: 100, step: 1, value: 0, text: "Untitled", name: "untitled", unit: "percentage" };
        this.addDefaults(params, defaults);

        const controlContainer = this.createEffectControlContainer(container, params);

        const inp = document.createElement("input");
        controlContainer.appendChild(inp);

        inp.type = "range";
        inp.min = params.min;
        inp.max = params.max;
        inp.step = params.step;
        inp.value = params.value;
        inp.name = params.name;
        inp.dataset.unit = params.unit;

        const nodes = {
            cont: controlContainer, 
            label: controlContainer.getElementsByTagName("label"), 
            display: controlContainer.getElementsByClassName("value-display")[0], 
            slider: inp, 
        }

        return new PQ_DAW.DOM.Slider(owner, nodes, params);
    },

    createEditableText(params)
    {
        const node = params.node;
        if(!node) { return; }

        const useCapture = params.useCapture || false;
        const callback = params.callback;

        node.addEventListener("click", () => this.changeFocusTo(node), useCapture);
        node.setAttribute("contentEditable", true);

        if(callback) { node.addEventListener("input", () => { callback(node) }); }
    },

    makeButtonSingleClick(btn)
    {
        btn.dataset.onetime = true;
    },

    fakeSelectDropdown(select)
    {
        var event = new Event('change', { bubbles: true, cancelable: false });
        select.dispatchEvent(event);
    },

    fakeSelectDropdownByIndex(select, idx)
    {
        const curIdx = select.selectedIndex;
        const nothingChanged = curIdx == idx;
        if(nothingChanged) { return; }
        select.selectedIndex = idx;
        this.fakeSelectDropdown(select);
    },

    fakeClickButton(btn)
    {
        var event = new Event('click', { bubbles: false, cancelable: false });
        btn.dispatchEvent(event);
    },

    fakeChangeSlider(slider, delta = 0)
    {
        slider.value = parseFloat(slider.value) + delta
        var event = new Event('input', { bubbles: true, cancelable: true });
        slider.dispatchEvent(event);
    },

    fakeSetSlider(slider, newVal = 0)
    {
        const curVal = parseFloat(slider.value);
        this.fakeChangeSlider(slider, newVal - curVal);
    },

    connectSlider(guiNode, ownerNode, callback)
    {
        guiNode.addEventListener("input", (ev) => { callback.call(this, guiNode, ownerNode) });
        this.fakeChangeSlider(guiNode); // immediately call it once to get correct initial values) 
    },

    connectButton(guiNode, ownerNode, callback)
    {
        guiNode.dataset.toggled = "false";
        guiNode.addEventListener("click", (ev) => { 
            this.toggleButton(guiNode, ownerNode);
            callback.call(this, guiNode, ownerNode) 
        });
    },

    connectPluginButton(guiNode, ownerNode, plugin)
    {
        guiNode.addEventListener("click", (ev) => { 
            this.toggleButton(guiNode, ownerNode);
            this.togglePlugin(plugin);
        });
    },
    
}