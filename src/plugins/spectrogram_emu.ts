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

// @ts-nocheck


/**
 * Spectrogram plugin for wavesurfer - EMU version
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js'
import WaveSurfer, { type WaveSurferOptions } from '../wavesurfer.js'
import createElement from '../dom.js'
//The SpectroDrawingWorker is copied from the EMU-webApp project verbatim.
import { SpectroDrawingWorker } from "./spectro-drawing.worker.js"


export type SpectrogramEmuPluginOptions = {
  /**
   * Selector of element or element in which to render
   *
   * If left blank, add to main wavesurfer wrapper.
   */
  container?: string | HTMLElement
  /**
   * First argument of the insertAdjacentHTML function
   * @default 'afterend'
   */
  insertPosition?: InsertPosition
  /**
   * Height of component in pixels
   * @default 100
   */
  height?: number
  /**
   * Channel to draw spectrogram from.
   * @default 0
   */
  channel?: number
  /**
   * Length of analysis window in seconds
   * @default 0.05
   */
  windowSizeInSecs?: number
  /**
   * Upper frequency displayed
   * If left blank defaults to half sample rate
   */
  upperFreq?: number
  /**
   * Lower frequency displayed
   * @default 0
   */
  lowerFreq?: number
  /** Alpha parameter in certain windows
   * @default 0.16
   */
  alpha?: number
  /**
   * Analysis window type.
   * One of: bartlett, bartletthann, blackman, cosine, gauss, hamming, hann, lanczos, rectangular, triangular
   * @default 'hamming'
   */
  window?: string
  /**
   * Dynamic range for maximum magnitude (dB)
   * @default 70
   */
  dynRangeInDB?: number
  /**
   * Preemphasis factor used to filter the signal before analysis
   * @default 0.97
   */
  preEmphasisFilterFactor?: number
  /**
   * Transparency value for the visualization.
   * @default 255
   */
  transparency?: number
  /**
   * Use colors to draw the heatmap
   * @default false
   */
  drawHeatMapColors?: boolean
  /**
   * Array of three RGB values (as arrys) representing the Low-Med-High colors to interpolate
   * the heatmap from. Only used if drawHeatMapColors is true.
   * @default [[255, 0, 0],[0, 255, 0],[0, 0, 0]]
   */
  heatMapColorAnchors?: Array
  /**
   * Invert all the colors.
   * @default false
   */
  invert?: boolean

}
const defaultOptions = {
  insertPosition: 'afterend',
  height: 100,
  channel: 0,
  windowSizeInSecs: 0.005,
  lowerFreq: 0,
  alpha: 0.16,
  window: 'hamming',
  dynRangeInDB: 70,
  preEmphasisFilterFactor: 0.97,
  transparency: 255,
  drawHeatMapColors: false,
  heatMapColorAnchors: [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 0]
  ],
  invert: false,
}
export type SpectrogramEmuPluginEvents = BasePluginEvents & {
  click: [relativeX: number]
}

class SpectrogramEmuPlugin extends BasePlugin<SpectrogramEmuPluginEvents, SpectrogramEmuPluginOptions> {
  static create(options?: SpectrogramEmuPluginOptions) {
    return new SpectrogramEmuPlugin(options || {})
  }

  constructor(options: SpectrogramEmuPluginOptions) {
    super(options || {})
    this.options = Object.assign({}, defaultOptions, options)

    this.windowNum = 6
    switch (this.options.window) {
      case 'bartlett':
        this.windowNum = 1
        break
      case 'bartletthann':
        this.windowNum = 2
        break
      case 'blackman':
        this.windowNum = 3
        break
      case 'cosine':
        this.windowNum = 4
        break
      case 'gauss':
        this.windowNum = 5
        break
      case 'hamming':
        this.windowNum = 6
        break
      case 'hann':
        this.windowNum = 7
        break
      case 'lanczos':
        this.windowNum = 8
        break
      case 'rectangular':
        this.windowNum = 9
        break
      case 'triangular':
        this.windowNum = 10
        break
      default:
        throw new Error('Unknown window type: ' + this.options.window)
    }

    this.createWrapper()
    this.createCanvas()

    //we reuse an image in memory and recreate it only of canvas size changes in the future
    this.imageData = this.spectrCc.createImageData(this.canvas.width, this.canvas.height)

    this.spectroWorker = new SpectroDrawingWorker()

    //we attempt to redraw the spectrogram at each animation frame, but do so only if requested,
    //eg. when waverufer redraws or scrolls
    this.update_needed = false

    //apart from updating only when wavesurfer emits certain events, we also check if anything
    //has changed - often the spectrogram won't change its start/end location while moving the
    //playhead, so we can also skip updating the graphics then
    this.old_sS = -1
    this.old_eS = -1

    // this flag will allow for killing the animation process
    this.terminated = false
  }

  onInit() {

    if (!this.wavesurfer) {
      throw Error('WaveSurfer is not initialized')
    }

    //we insert the the spectrogram to the appropriate container here
    if (this.options.container) {
      if (typeof this.options.container === 'string') {
        this.container = document.querySelector(this.options.container) as HTMLElement
      } else if (this.options.container instanceof HTMLElement) {
        this.container = this.options.container
      }
      this.container?.appendChild(this.wrapper)
    } else {
      this.container = this.wavesurfer.getWrapper().parentElement
      this.container?.insertAdjacentElement(this.options.insertPosition, this.wrapper)
    }


    //this is the location where the worker sends its calculated image back to us for displaying it on screen
    this.spectroWorker.says((event) => {

      //if the canvas size changed, recreate the imageData
      if (this.imageData.width != this.canvas.width || this.imageData.height != this.canvas.height)
        this.imageData = this.spectrCc.createImageData(this.canvas.width, this.canvas.height)

      //some data conversion neccessary
      let tmp = new Uint8ClampedArray(event.img)
      this.imageData.data.set(tmp)

      //put the image to screen
      this.spectrCc.putImageData(this.imageData, 0, 0)

      //request next animation frame
      window.requestAnimationFrame(() => { this.render() })
    })

    //these are the events that cause redrawing
    this.subscriptions.push(this.wavesurfer.on('redraw', () => { this.update_needed = true }))
    this.subscriptions.push(this.wavesurfer.on('scroll', () => { this.update_needed = true }))
    this.subscriptions.push(this.wavesurfer.on('ready', () => { this.update_needed = true }))

    //request initial animation frame
    window.requestAnimationFrame(() => { this.render() })
  }

  public destroy() {
    this.terminated = true
    this.unAll()
    this.wavesurfer = null
    this.util = null
    this.options = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    }
    this.spectroWorker.kill()
    this.spectroWorker = null
    super.destroy()
  }


  private createWrapper() {
    this.wrapper = createElement('div', {
      part: 'spectrogram-emu',
      style: {
        width: '100%',
        height: this.options.height + 'px'
      },
    })

    this.wrapper.addEventListener('click', this._onWrapperClick)
  }

  private createCanvas() {
    this.canvas = createElement(
      'canvas',
      {
        style: {
          position: 'relative',
          width: '100%',
          height: '100%',
        },
      },
      this.wrapper,
    )
    this.spectrCc = this.canvas.getContext('2d')
  }

  //used to calculate nFFT from windowSizeInSecs
  private calcClosestPowerOf2Gt(num) {
    var curExp = 0

    while (Math.pow(2, curExp) < num) {
      curExp = curExp + 1
    }

    return (Math.pow(2, curExp))

  }



  private render() {

    //this is only set while destroying the plugin
    if (this.terminated)
      return;

    //if no update is needed in this animation frame, request next one and exit without doing anything
    if (!this.update_needed) {
      window.requestAnimationFrame(() => { this.render() })
      return
    }

    //get the sizes of what is visiable in current scroll/zoom state
    const { scrollLeft, scrollWidth, clientWidth } = this.wavesurfer.renderer.scrollContainer
    const decodedData = this.wavesurfer.getDecodedData()

    //sometimes we get to this part before any data is yet available and we need to bail out
    if (!decodedData) {
      this.update_needed = false
      window.requestAnimationFrame(() => { this.render() })
      return
    }

    //get the number of samples as well as start and end sample
    let nS = decodedData.length
    let sS = Math.floor(scrollLeft / scrollWidth * nS)
    let eS = Math.floor((scrollLeft + clientWidth) / scrollWidth * nS)

    //if location of the spectrogram hasn't changed, exit instead of redrawing the same thing over again
    if (sS == this.old_sS && eS == this.old_eS) {
      this.update_needed = false
      window.requestAnimationFrame(() => { this.render() })
      return
    }

    this.update_needed = false
    this.old_sS = sS
    this.old_eS = eS

    //here we resize the canvas to the size of the wrapper
    //you should be able to resize the wrapper to change the size of the spectrogram
    this.canvas.height = this.wrapper.offsetHeight
    this.canvas.width = this.wrapper.offsetWidth

    //here we extract the chosen audio channel - normally, you would draw only one,
    //but you can add two plugin instances for stereo files, I suppose...
    let buffer = decodedData.getChannelData(this.options.channel)

    //sample rate is acquired from audio directly
    let sampleRate = decodedData.sampleRate
    let windowSizeInSecs = this.options.windowSizeInSecs
    var fftN = this.calcClosestPowerOf2Gt(sampleRate * windowSizeInSecs)
    // fftN must be greater than 512 (leads to better resolution of spectrogram)
    if (fftN < 512)
      fftN = 512
    let windowSizeInSamples = windowSizeInSecs * sampleRate
    let samplesPerPxl = (eS + 1 - sS) / this.canvas.width

    //here we acquire the requried signal from the audio buffer
    let data = buffer.subarray(sS, eS)
    let left_padding = []
    let right_padding = []

    if (sS > windowSizeInSamples / 2)
      left_padding = buffer.subarray(sS - windowSizeInSamples / 2, sS)

    if (eS + fftN / 2 - 1 < buffer.length)
      right_padding = buffer.subarray(eS, eS + fftN / 2 - 1)

    let paddedSamples = new Float32Array(left_padding.length + data.length + right_padding.length)
    paddedSamples.set(left_padding)
    paddedSamples.set(data, left_padding.length)
    paddedSamples.set(right_padding, left_padding.length + data.length)

    //if upper frequency isn't provided, use half sampling rate
    let upperFreq = sampleRate / 2
    if (this.options.upperFreq)
      upperFreq = this.options.upperFreq

    //this is where we sent a request to the background worker to make a spectrogram for us
    //after the worker is done drawing, it will call the "say" callback we defined in onInit above
    this.spectroWorker.tell({
      'windowSizeInSecs': windowSizeInSecs,
      'fftN': fftN,
      'alpha': this.options.alpha,
      'upperFreq': upperFreq,
      'lowerFreq': this.options.lowerFreq,
      'samplesPerPxl': samplesPerPxl,
      'window': this.windowNum,
      'imgWidth': this.canvas.width,
      'imgHeight': this.canvas.height,
      'dynRangeInDB': this.options.dynRangeInDB,
      'pixelRatio': window.devicePixelRatio,
      'sampleRate': sampleRate,
      'transparency': this.options.transparency,
      'audioBuffer': paddedSamples,
      'audioBufferChannels': 1,
      'drawHeatMapColors': this.options.drawHeatMapColors,
      'preEmphasisFilterFactor': this.options.preEmphasisFilterFactor,
      'heatMapColorAnchors': this.options.heatMapColorAnchors,
      'invert': this.options.invert,
    }, [paddedSamples.buffer])
  }
}

export default SpectrogramEmuPlugin
