import AUDIO from "./audio"
import DOM from "./dom"
import Daw from "./daw"

// responsible for playing/updating daws
// (I'm experimenting with a very functional---instead of OOP---coding style here)
export default 
{
    init()
    {
        this.daws = [];
        this.offlineAutomateMargin = 5; // jumps (in ms) between automation checks when offline rendering
        this.update();
    },

    async render(daw:Daw, playback = false)
    {  
        const dawCopy = this.playOffline(daw);
        const loop = this.automateOffline(dawCopy);
        const renderedBuffer = await dawCopy.getContext().startRendering();

        clearInterval(loop);

        if(playback)
        {
            const playbackTest = daw.getContext().createBufferSource();
            playbackTest.buffer = renderedBuffer;
            playbackTest.connect(daw.getContext().destination);
            playbackTest.start();
        }

        const blob = AUDIO.audioBufferToWaveBlobSimple(renderedBuffer);
        const blobURL = URL.createObjectURL(blob);
        this.downloadRender(blobURL);
    },

    downloadRender(blobURL:string)
    {
        var a = document.createElement("a");
        a.style.display = "none";
        a.href = blobURL;
        a.download = "Mixdown.wav";
        document.body.appendChild(a);
        a.click();
    },

    automateOffline(daw:Daw)
    {
        return setInterval(() => {
            daw.setTime(daw.getContext().currentTime);
            this.readFromAutomation(daw);
        }, this.offlineAutomateMargin);
    },

    playOffline(daw:Daw)
    {
        const dawCopy = new Daw({ node: daw.node, offline: true }); // second parameter = "offline DAW"
        const allParts = dawCopy.getAllParts();
        for(const part of allParts)
        {
            part.setPlaying(true, 0, part.getStartTime());
        }
        return dawCopy;
    },

    update()
    {
        window.requestAnimationFrame(this.update.bind(this));
        if(this.daws.length <= 0) { return; }

        for(const daw of this.daws)
        {
            this.updateDAW(daw);
        }
    },

    updateDAW(daw:Daw)
    {
        daw.syncTimeWithContext();

        const newPartsToStart = daw.getPartsAtCurrentTime(false);
        for(const part of newPartsToStart)
        {
            part.setPlaying(true, daw.getTime());
        }

        this.readFromAutomation(daw);

        daw.visualize(false);

        if(daw.atEndTime()) {
            daw.reset();  
        }
    },

    async play(daw:Daw)
    {
        daw.readTimeFromContext();

        // start recording on "record enabled" tracks
        for(const track of daw.tracks)
        {
            if(!track.isRecordEnabled()) { continue; }
            await track.startRecording(daw.getTime());
        }

        daw.visualize(true);

        // start all parts at current time
        const partsToStart = daw.getPartsAtCurrentTime(null); // null => doesn't matter if active or not
        for(const part of partsToStart)
        {
            part.setPlaying(true, daw.getTime());
        }

        // start any "constant" effects (unrelated to time or input)
        const effects = daw.getConstantEffects();
        for(const effect of effects)
        {
            effect.setPlaying(true);
        }

        this.daws.push(daw);
    },

    async stop(daw:Daw, reset = false)
    {
        this.daws.splice(this.daws.indexOf(daw), 1);

        const parts = daw.getPartsWithStatus(true);
        for(const part of parts)
        {
            part.setPlaying(false);
        }

        const effects = daw.getConstantEffects();
        for(const effect of effects)
        {
            effect.setPlaying(false);
        }

        for(const track of daw.tracks)
        {
            if(!track.isRecordEnabled() || !track.hasActiveRecording()) { continue; }
            await track.stopRecording(daw.getTime());
        }

        if(reset)
        {
            daw.setTime(0);
            daw.visualize(false);
        }
    },

    readFromAutomation(daw:Daw)
    {
        const time = daw.getTime();

        for(const track of daw.tracks)
        {
            if(!track.isType("automation")) { continue; }
            if(track.isBypassed()) { continue; }

            const value = track.getAutomationValueAt(time);
            if(value == null) {
                console.error("No valid automation value at time " + time + " from track " + track.getName());
                continue; 
            }

            const controlNode = daw.getControlFromPathString(track.getOutPath());
            if(!controlNode) { 
                console.error("Can't read automation from path " + track.getOutPath() + " at track " + track.getName());
                continue; 
            }

            const name = controlNode.tagName.toLowerCase();

            if(name == 'input') {
                let finalValue = parseFloat(controlNode.min) + value * (parseFloat(controlNode.max) - parseFloat(controlNode.min))
                DOM.fakeSetSlider(controlNode, finalValue);
            } else if(name == 'select') {
                const numOptions = controlNode.length;
                let clampedValue = Math.min(Math.max(value, 0), 0.99);
                let finalValue = Math.floor(numOptions * clampedValue);
                DOM.fakeSelectDropdownByIndex(controlNode, finalValue);
            } else if(name == 'button') {
                let finalValue = (value >= 0.5) ? "true" : "false";
                if(controlNode.dataset.toggled != finalValue) { DOM.fakeClickButton(controlNode); }
            }
        }
    }
}