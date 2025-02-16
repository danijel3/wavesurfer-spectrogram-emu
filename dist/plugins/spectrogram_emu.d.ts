/**
 * Spectrogram plugin -- EMU version
 *
 * Render a spectrogram visualisation of the audio.
 *
 * This is an adaptation of the beautiful spectrogram created in 2014 for the brilliant EMU-webApp project.
 *
 * The approach relies on a background worker process to do the actual drawing. Each render iteration acquires
 * the start and end locations within the audio and renders the spectrogram to a canvas of any chosen size and location.
 *
 * This is different than the original spectrogram plugin, which rendered the whole spectrogram once at the start
 * of and saved the image into a large scrollable canvas. This plugin redraws the spectrogram for only for the visible
 * part of the signal and does that every time there is a change (eg. scrolling or zooming).
 *
 * Apart from the perfromance difference, this version looks nicer, in my opionion and is much closer to programs like Praat.
 *
 * @author Georg Räß
 * @author Danijel Koržinek <danijel@korzinek.com> (adaptation to Wavesurfer)
 * @see https://github.com/IPS-LMU/EMU-webApp
 *
 * @example
 * // ... initialising wavesurfer with the plugin
 * var wavesurfer = WaveSurfer.create({
 *   // wavesurfer options ...
 *   plugins: [
 *     SpectrogramEmuPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */
/**
 * Spectrogram plugin for wavesurfer - EMU version
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js';
export type SpectrogramEmuPluginOptions = {
    /**
     * Selector of element or element in which to render
     *
     * If left blank, add to main wavesurfer wrapper.
     */
    container?: string | HTMLElement;
    /**
     * First argument of the insertAdjacentHTML function
     * @default 'afterend'
     */
    insertPosition?: InsertPosition;
    /**
     * Height of component in pixels
     * @default 100
     */
    height?: number;
    /**
     * Length of analysis window in seconds
     * @default 0.05
     */
    /**
     * Channel to draw spectrogram from.
     * @default 0
     */
    channel?: number;
    windowSizeInSecs?: number;
    /**
     * Upper frequency displayed
     * If left blank defaults to half sample rate
     */
    upperFreq?: number;
    /**
     * Lower frequency displayed
     * @default 0
     */
    lowerFreq?: number;
    /** Alpha parameter in certain windows
     * @default 0.16
     */
    alpha?: number;
    /**
     * Analysis window type.
     * One of: bartlett, bartletthann, blackman, cosine, gauss, hamming, hann, lanczos, rectangular, triangular
     * @default 'hamming'
     */
    window?: string;
    /**
     * Dynamic range for maximum magnitude (dB)
     * @default 70
     */
    dynRangeInDB?: number;
    /**
     * Preemphasis factor used to filter the signal before analysis
     * @default 0.97
     */
    preEmphasisFilterFactor?: number;
    /**
     * Transparency value for the visualization.
     * @default 255
     */
    transparency?: number;
    /**
     * Use colors to draw the heatmap
     * @default false
     */
    drawHeatMapColors?: boolean;
    /**
     * Array of three RGB values (as arrys) representing the Low-Med-High colors to interpolate
     * the heatmap from. Only used if drawHeatMapColors is true.
     * @default [[255, 0, 0],[0, 255, 0],[0, 0, 0]]
     */
    heatMapColorAnchors?: Array;
    /**
     * Invert all the colors.
     * @default false
     */
    invert?: boolean;
};
export type SpectrogramEmuPluginEvents = BasePluginEvents & {
    click: [relativeX: number];
};
declare class SpectrogramEmuPlugin extends BasePlugin<SpectrogramEmuPluginEvents, SpectrogramEmuPluginOptions> {
    static create(options?: SpectrogramEmuPluginOptions): SpectrogramEmuPlugin;
    constructor(options: SpectrogramEmuPluginOptions);
    onInit(): void;
    destroy(): void;
    private createWrapper;
    private createCanvas;
    private calcClosestPowerOf2Gt;
    private render;
}
export default SpectrogramEmuPlugin;
