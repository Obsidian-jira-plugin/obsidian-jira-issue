declare module 'colorsys' {
    interface RGBColor {
        r: number
        g: number
        b: number
    }

    interface Colorsys {
        hslToHex(h: number, s: number, l: number): string
        hslToRgb(h: number, s: number, l: number): RGBColor
    }

    const colorsys: Colorsys
    export default colorsys
}
