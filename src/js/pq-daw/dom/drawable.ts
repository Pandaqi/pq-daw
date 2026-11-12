import Color from "../color";
import Part from "../part";

const CONFIG = {
    strokeStyle: "#00FF00",
    fillStyle: "#00FF00",
    lineWidth: 4,
    radius: 8,
    minDistBetweenPoints: 10,
    minDistBetweenPointsVisual: 40
}

type Point = { x: number, y: number };
type PointAutomation = { time: number, value: number };

export default class Drawable 
{
    part: Part;
    canvas: HTMLCanvasElement;
    drawing: boolean;
    line: PointAutomation[];
    
    constructor(part:Part, canv:HTMLCanvasElement)
    {
        this.part = part;
        this.canvas = canv;
        this.drawing = false;
        this.line = [];

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
    getValueAt(time:number)
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

    visualize(color:Color)
    {
        CONFIG.strokeStyle = color.toString();
        CONFIG.fillStyle = color.toString();
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
        const partNodes = Array.from(this.part.node.parentElement.getElementsByClassName("pq-daw-track-part")) as HTMLElement[];
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

        ctx.strokeStyle = CONFIG.strokeStyle;
        ctx.lineWidth = CONFIG.lineWidth;
        ctx.stroke();

        // the dots where it changes
        ctx.fillStyle = CONFIG.fillStyle;
        ctx.beginPath();
        let prevPoint = null;
        for(let i = 0; i < linePixels.length; i++)
        {
            if(prevPoint) 
            {
                const distToPrev = Math.pow(linePixels[i].x - prevPoint.x, 2) + Math.pow(linePixels[i].y - prevPoint.y, 2);
                if(distToPrev <= Math.pow(CONFIG.minDistBetweenPointsVisual, 2)) { continue; }
            }
            prevPoint = linePixels[i];

            ctx.beginPath();
            ctx.arc(linePixels[i].x, linePixels[i].y, CONFIG.radius, 0, 2 * Math.PI, false);
            ctx.fill();
        }
    }

    setLine(line)
    {
        this.line = line;
    }

    getPixelsInTime(px:number)
    {
        return this.part.getDaw().getPixelsInTime(px);
    }

    getTimeInPixels(time:number)
    {
        return this.part.getDaw().getTimeInPixels(time);
    }

    getValueInPixels(value:number)
    {
        return (1.0 - value)*this.canvas.height;
    }

    getPixelsInValue(px:number)
    {
        return 1.0 - (px / this.canvas.height);
    }

    registerPoint(point:Point, isLocal = false)
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
            if(xDist >= CONFIG.minDistBetweenPoints) { continue; }
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
}