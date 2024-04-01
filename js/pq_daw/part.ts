import AUDIO from "./audio"
import DISPLAY from "./display"
import DOM from "./dom"
import Dragger from "./dom/dragger"
import Drawable from "./dom/drawable"
import Track from "./track"

const DEFAULTS = {
    source: "",
    type: "audio",
    start: 0,
    end: "",
    duration: "",
    totalduration: "",
    offset: 0,
    fadestart: 0.05,
    fadeend: 0.05
};

interface PartParams
{
    node?: HTMLElement,
    automation: boolean
    parent?: Track,
}

type Bounds = { min: number, max: number }


// represents one part; the actual atomic element of sound
export default class Part 
{
    track: Track
    node: HTMLDivElement
    canvas: HTMLCanvasElement
    canvasDrawable: Drawable
    sound: AudioBufferSourceNode
    playing: boolean
    receiveDOMevents: boolean
    dontVisualize: boolean
    createNodes: boolean
    gainNode: GainNode
    allowFades: boolean
    fadeStartNode: HTMLDivElement
    fadeEndNode: HTMLDivElement
    allowDrag: boolean
    minWidth: number
    edgeDragMargin: number
    moveDragger: Dragger
    startNode: HTMLDivElement
    startDragger: Dragger
    endNode: HTMLDivElement
    endDragger: Dragger
    drawOnCanvas: boolean
    fullLength: boolean
    allowPlaying: boolean

    constructor(params:PartParams)
    {
        this.track = params.parent;
        this.node = this.setupHTML(params);

        this.canvas = this.node.getElementsByTagName("canvas")[0];
        this.canvasDrawable = null;

        if(this.track.isType("automation"))
        {
            if(!params.automation) {
                this.convertToAutomationPoint();
            } else {
                this.node.classList.add("full-automation-part");
            }
        }

        this.sound = null;
        this.playing = false;
        
        this.createAudioNodes();
        this.createFadeVisualizations();
        this.createDraggers();
        this.makeCanvasDrawable(params);
        
        // DOM events for shortcuts and stuff
        if(this.receiveDOMevents)
        {
            this.getCanvas().addEventListener("click", () => DOM.changeFocusTo(this), false);
        }
    }

    convertToAutomationPoint()
    {
        this.dontVisualize = true;
        for(const key of Object.keys(DEFAULTS))
        {
            if(key == "source" || key == "start") { continue; }
            this.node.removeAttribute("data-" + key);
        }
        this.node.style.display = "none"; // @TODO: I completely overwrote style before instead of only changing display, so is this still correct now?
        this.canvas.remove();
    }

    createAudioNodes()
    {
        if(!this.createNodes) { return; }
        const ctx = this.getDaw().getContext();
        this.gainNode = new GainNode(ctx);
    }

    createFadeVisualizations()
    {
        if(!this.allowFades) { return; }
        this.fadeStartNode = document.createElement("div");
        this.fadeStartNode.classList.add("part-fade-visual");
        this.fadeStartNode.style.left = "0px";
        this.node.appendChild(this.fadeStartNode);

        this.fadeEndNode = document.createElement("div");
        this.fadeEndNode.classList.add("part-fade-visual");
        this.fadeEndNode.style.right = "0px";
        this.node.appendChild(this.fadeEndNode);
    }

    // The three draggers (change start, change end, move)
    createDraggers()
    {
        if(!this.allowDrag) { return; }

        this.minWidth = 15;
        this.edgeDragMargin = 30;
        this.moveDragger = new Dragger(this.getCanvas());
        this.moveDragger.callback = async (delta) => {
            if(Math.abs(delta.x) == 0) { return; }

            this.setLeftPos(this.getLeftPos() + delta.x);
            await this.calculateCorrectTimeParamsFromDOM(false);
            this.getDaw().visualize(true);
        }

        this.startNode = document.createElement("div");
        this.startNode.classList.add("part-edge-dragger");
        this.startNode.style.width = this.edgeDragMargin + "px";
        this.node.appendChild(this.startNode);

        this.startDragger = new Dragger(this.startNode);
        this.startDragger.callback = async (delta) => {
            if(Math.abs(delta.x) == 0) { return; }

            let newLeftPos = this.getLeftPos() + delta.x;
            let oldRightPos = this.getRightPos();
            let projectedWidth = this.getWidth() - delta.x;
            if(projectedWidth < this.minWidth) { return; }

            this.setLeftPos(newLeftPos);
            
            const preciseWidth = (oldRightPos - this.getLeftPos());
            this.setWidth(preciseWidth);
            
            // duplicate code with these lines in all draggers!
            // but only for this one, the parameter here is TRUE ...
            await this.calculateCorrectTimeParamsFromDOM(true);
            this.getDaw().visualize(true);
        }

        // @IMPROV: duplicate creation code as well!
        this.endNode = document.createElement("div");
        this.endNode.classList.add("part-edge-dragger");
        this.endNode.style.width = this.edgeDragMargin + "px";
        this.node.appendChild(this.endNode);

        this.endDragger = new Dragger(this.endNode);
        this.endDragger.callback = async (delta) => {
            if(Math.abs(delta.x) == 0) { return; }

            this.setWidth(this.getWidth() + delta.x);
            await this.calculateCorrectTimeParamsFromDOM(false);
            this.getDaw().visualize(true);
        }
    }

    makeCanvasDrawable(params:PartParams)
    {
        if(!this.drawOnCanvas) { return; }

        this.canvasDrawable = new Drawable(this, this.getCanvas());
        
        const createFromGivenData = params.automation;
        if(createFromGivenData) { 
            this.canvasDrawable.setLine(params.automation); 
        }
    }

    setupHTML(params:PartParams)
    {
        const node = params.node || { dataset: {} };
        for(const key in DEFAULTS)
        {
            if(key in node.dataset) { continue; }
            node.dataset[key] = DEFAULTS[key];
        }

        // parts are simple: just a container and a canvas
        const main = document.createElement("div");
        main.classList.add("pq-daw-track-part");

        for(const key in node.dataset)
        {
            DOM.setProperty(main, key, node.dataset[key]);
        }
        
        this.changeSetupBasedOnPartType(main);

        const canvas = document.createElement("canvas");
        canvas.width = 0;
        canvas.height = 0;
        main.appendChild(canvas);

        const parentContainer = params.parent.getTrackContentContainer();
        parentContainer.appendChild(main);

        return main
    }

    changeSetupBasedOnPartType(node:HTMLElement)
    {
        this.fullLength = false;
        this.allowDrag = true;
        this.allowFades = true;
        this.drawOnCanvas = false;
        this.createNodes = true;
        this.allowPlaying = true;
        this.dontVisualize = false;
        this.receiveDOMevents = true;

        if(this.track.isType("automation"))
        {
            DOM.setProperty(node, "type", "automation");

            this.fullLength = true;
            this.allowDrag = false;
            this.allowFades = false;
            this.drawOnCanvas = true;
            this.createNodes = false;
            this.allowPlaying = false;
            this.receiveDOMevents = false;
        }
    }

    getContext()
    {
        return this.getDaw().getContext();
    }

    getDaw()
    {
        return this.track.daw;
    }

    setWidth(px:number)
    {
        px = Math.min(Math.max(px, this.minWidth), this.track.getWidth() - this.getLeftPos());
        this.node.style.width = px + "px";
        if(this.endNode) { this.endNode.style.right = "0px"; }
    }

    getWidth()
    {
        return this.node.getBoundingClientRect().width;
    }

    setLeftPos(px:number)
    {
        let maxWidth = this.track.getWidth() - this.getWidth();
        if(maxWidth <= 0) { maxWidth = Infinity; }

        px = Math.min(Math.max(px, 0), maxWidth);
        this.node.style.left = px + "px";

        if(this.startNode) { this.startNode.style.left = "0px"; }
        if(this.endNode) { this.endNode.style.right = "0px"; }
    }

    getLeftPos()
    {
        return this.node.getBoundingClientRect().left - this.node.parentElement.getBoundingClientRect().left;
    }

    getRightPos()
    {
        return this.node.getBoundingClientRect().right - this.node.parentElement.getBoundingClientRect().left;
    }

    async calculateCorrectTimeParamsFromDOM(modifyOffset = false)
    {
        const setProp = DOM.setProperty;

        const oldStart = this.getStartTime();
        let start = DISPLAY.pixelsToTime(this.getDaw(), this.getLeftPos(), false);
        let duration = DISPLAY.pixelsToTime(this.getDaw(), this.getWidth(), false);

        if(modifyOffset)
        {
            const newOffset = this.getOffset() + (start - oldStart);
            setProp(this.node, "offset", newOffset);
        }

        setProp(this.node, "start", start);
        setProp(this.node, "duration", duration);
        setProp(this.node, "end", "NoEndTimeSpecified");

        await this.getDaw().requestRestartForCallback(() => {
            this.calculateCorrectTimeParams() 
        });
    }

    // A part has some redundant properties; you only need to set one, it fills in the rest
    //
    // start = where the part starts
    // offset = how far into the original recording it starts
    // end = where the part ends
    // duration = how long the audible section of the part 
    // totalduration = how long the full source lasts

    calculateCorrectTimeParams()
    {
        if(this.dontVisualize) { return; }

        const node = this.node;
        const getProp = DOM.getProperty;
        const setProp = DOM.setProperty;

        const minDuration = 0.25;
        let duration = this.getDuration();
        let start = this.getStartTime();
        let end = this.getEndTime();
        let offset = Math.max(this.getOffset(), 0); // cannot be negative
        
        // check the length of our source file
        let totalDuration = parseFloat(getProp(node, "totalduration"));
        if(isNaN(totalDuration) && this.hasLoadableSource())
        {
            totalDuration = AUDIO.getResource(this.getSource()).duration;
        }

        const knownParams = [!isNaN(start), !isNaN(end), !isNaN(duration)];
        const numKnownParams = knownParams.filter(Boolean).length;

        // if only one parameter is set, we automatically use the complete source file
        if(numKnownParams <= 1)
        {
            duration = totalDuration;
        }

        // calculate the rest, based on what we do know
        const startAndDurationKnown = !isNaN(start) && !isNaN(duration);
        const endAndDurationKnown = !isNaN(end) && !isNaN(start);
        const startAndEndKnown = !isNaN(start) && !isNaN(end);

        if(startAndEndKnown)
        {
            duration = end - start;
        }
        else if(startAndDurationKnown)
        {
            end = start + duration;
        } 
        else if(endAndDurationKnown)
        {
            start = end - duration;
        }

        // clamp within range of DAW
        start = Math.max(start, 0);
        end = Math.min(end, this.getDaw().getDuration());
        duration = end - start;
  
        // clamp within range of the source
        let totalEndTime = duration + offset;
        if(totalEndTime > totalDuration)
        {
            duration = Math.max(totalDuration - offset, minDuration);
            end = start + duration;
        }

        // without a specific source, duration and totalDuration are always the same
        if(!this.hasLoadableSource()) { totalDuration = duration; }

        // if we're forced to full length, forget all the above and just set us full size
        if(this.fullLength)
        {
            start = 0
            end = this.getDaw().getDuration();
            offset = 0
            duration = (end - start);
            totalDuration = duration;
        }

        // update all of that
        setProp(node, "start", start);
        setProp(node, "end", end);
        setProp(node, "offset", offset);
        setProp(node, "duration", duration);
        setProp(node, "totalduration", totalDuration);
    }

    getCanvas()
    {
        return this.canvas;
    }

    getOutputNode()
    {
        return this.gainNode;
    }

    getGain()
    {
        return this.gainNode;
    }

    isPlaying()
    {
        return this.playing;
    }

    setPlaying(val:boolean, curTimeDAW = 0, startOffset = 0)
    {
        this.playing = val;
        if(!this.allowPlaying) { return; }

        if(this.playing) {
            this.sound = AUDIO.play(this, this.getTimeDiff(curTimeDAW), startOffset)
            this.sound.connect(this.gainNode);
        } else {
            if(!this.sound) { return; }
            AUDIO.stop(this.sound);
            this.sound.disconnect(this.gainNode);
            this.sound = null;
        }
    }

    getTimeDiff(time = 0)
    {
        return time - this.getStartTime();
    }

    isActiveAtTime(time = 0)
    {
        return this.getStartTime() <= time && this.getEndTime() >= time;
    }

    getSource()
    {
        return DOM.getProperty(this.node, "source")
    }

    getOffset()
    {
        return parseFloat(DOM.getProperty(this.node, "offset"));
    }

    getStartTime()
    {
        return parseFloat(DOM.getProperty(this.node, "start"));
    }

    getEndTime()
    {
        return parseFloat(DOM.getProperty(this.node, "end"));
    }

    getDuration()
    {
        return parseFloat(DOM.getProperty(this.node, "duration"));
    }

    getFadeStart()
    {
        return parseFloat(DOM.getProperty(this.node, "fadestart"));
    }

    getFadeEnd()
    {
        return parseFloat(DOM.getProperty(this.node, "fadeend"));
    }

    changeFade(df = 0.025)
    {
        const fs = Math.max(this.getFadeStart() + df, 0);
        const fe = Math.max(this.getFadeEnd() + df, 0);

        DOM.setProperty(this.node, "fadestart", Math.round(fs*100)/100);
        DOM.setProperty(this.node, "fadeend", Math.round(fe*100)/100);

        // @IMPROV: nasty dependencies here, can we change that?
        DISPLAY.visualizePart(this.getDaw(), this.track, this);
    }

    getFadeValueAt(time = 0, bounds:Bounds)
    {
        let start = bounds.min, end = bounds.max;
        let startTime = 0, endTime = this.getFadeStart();
        let isApplicable = false;

        if(time <= this.getFadeStart()) { isApplicable = true; }
        if(time >= this.getDuration() - this.getFadeEnd())
        {
            isApplicable = true;
            start = bounds.max;
            end = bounds.min;
            startTime = this.getDuration() - this.getFadeEnd();
            endTime = this.getDuration();
        }

        if(!isApplicable) { return bounds.max; }

        const exp = (time - startTime) / (endTime - startTime);
        return start * Math.pow(end / start, exp);
    }

    getType()
    {
        return DOM.getProperty(this.node, "type");
    }

    hasLoadableSource()
    {
        if(!this.createAudioNodes) { return false; }
        return this.getType() == "audio";
    }

    setDataFrom(dataset = {})
    {
        for(const key in dataset)
        {
            DOM.setProperty(this.node, key, dataset[key]);
        }
    }

    remove()
    {
        this.node.remove();
    }

    queueRemoval()
    {
        this.track.removePart(this);
    }
}