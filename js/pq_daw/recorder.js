PQ_DAW.Recorder = class {

    constructor()
    {
        this.chunks = [];
        this.startTime = 0;
        this.endTime = 0;
        this.mediaRecorder = null;
        this.blob = null;
        this.URI = null;
    }

    async start(time = 0)
    {
        this.startTime = time;
        this.chunks = []
        
        const mediaStream = await window.navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        
        this.mediaRecorder = new MediaRecorder(mediaStream)

        const that = this;
        this.mediaRecorder.ondataavailable = (ev) => { that.chunks.push(ev.data) }
        this.mediaRecorder.start((10.0/60.0)*1000);
    }

    stop(time = 0)
    {
        this.endTime = time;
        this.mediaRecorder.stop();
        this.blob = new Blob(this.chunks, { type: "audio/ogg; codecs=opus" });
        this.URI = window.URL.createObjectURL(this.blob);
    }

    getState()
    {
        return this.mediaRecorder.state;
    }

    async saveInBuffer(daw)
    {
        await PQ_DAW.AUDIO.saveBlobResource(daw, this.URI, this.blob);
    }

    download()
    {
        var a = document.createElement("a");
        a.style.display = "none";
        a.href = this.URI;
        a.download = "Recording.ogg";
        document.body.appendChild(a);
        a.click();
    }

    getPartParams()
    {
        return {
            recalculate: true,
            redraw: true,
            dataset: {
                type: "blob",
                source: this.URI,
                start: this.startTime,
                end: this.endTime,
            }
        }
    }
}