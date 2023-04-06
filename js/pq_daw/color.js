export default class Color {
    constructor(h, s, l) {
        this.h = h;
        this.s = s;
        this.l = l;
    }

    toString()
    {
        return "hsl(" + this.h + ", " + this.s + "%, " + this.l + "%)"; 
    }

    lighten(dl = 0)
    {
        const newLightness = Math.max(Math.min(this.l + dl, 100), 0);
        return new Color(this.h, this.s, newLightness);
    }
}
