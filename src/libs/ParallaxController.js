import { getParallaxOffsets, isElementInView, parseValueAndUnit, testForPassiveScroll } from '../utils/index'

/**
 * -------------------------------------------------------
 * Parallax Controller
 * -------------------------------------------------------
 *
 * The global controller for setting up window scroll/resize
 * listeners, managing and caching parallax element positions,
 * determining which elements are inside the viewport based on
 * scroll position, and then updating parallax element styles
 * based on min/max offsets and current scroll position.
 *
 */
function ParallaxController (options = {}) {

  // All parallax elements to be updated
  let elements = []

  // Tracks current scroll y distance
  let scrollY = 0

  // Window inner height
  let windowHeight = 0

  // ID to increment for elements
  let id = 0

  // Ticking
  let ticking = false

  // Scroll direction
  // let scrollDown = null

  // Passive support
  const supportsPassive = testForPassiveScroll()

  const eventEmitter = options.eventEmitter
  const hasEventEmitter = eventEmitter && eventEmitter.on && eventEmitter.off && typeof eventEmitter.on === 'function' && typeof eventEmitter.off === 'function' && true || false

  function _addListeners () {
    if (hasEventEmitter) {
      eventEmitter.on('scroll', _handleScroll)
      eventEmitter.on('resize', _handleResize)
    } else {
      window.addEventListener(
        'scroll',
        _handleWindowScroll,
        supportsPassive ? { passive: true } : false
      )
      window.addEventListener('resize', _handleWindowResize, false)
    }
  }

  function _removeListeners () {
    if (hasEventEmitter) {
      eventEmitter.off('scroll', _handleScroll)
      eventEmitter.off('resize', _handleResize)
    } else {
      window.removeEventListener(
        'scroll',
        _handleWindowScroll,
        supportsPassive ? { passive: true } : false
      )
      window.removeEventListener('resize', _handleWindowResize, false)
    }
  }

  _addListeners()

  function _handleScroll (offset) {
    // reference to prev scroll y
    // const prevScrollY = scrollY

    // Save current scroll
    scrollY = offset

    // direction
    // scrollDown = scrollY > prevScrollY

    // Only called if the last animation request has been
    // completed and there are parallax elements to update
    if (!ticking && elements.length > 0) {
      ticking = true
      window.requestAnimationFrame(_updateElementPositions)
    }
  }

  /**
   * Window scroll handler. Sets the 'scrollY'
   * and then calls '_updateElementPositions()'.
   */
  function _handleWindowScroll () {
    _handleScroll(window.pageYOffset) // Supports IE 9 and up.
  }

  function getWindowHeight () {
    if (eventEmitter) {
      if (typeof eventEmitter.getWindowHeight === 'function') {
        return eventEmitter.getWindowHeight()
      }
    } else {
      const html = document.documentElement
      return window.innerHeight || html.clientHeight
    }
    return 0
  }

  /**
   * Window resize handler. Sets the new window inner height
   * then updates parallax element attributes and positions.
   */
  function _handleWindowResize () {
    _handleResize(getWindowHeight())
  }

  function _handleResize (height) {
    windowHeight = height
    _updateElementAttributes()
    _updateElementPositions()
  }

  /**
   * Creates a unique id to distinguish parallax elements.
   * @return {Number}
   */
  function _createID () {
    ++id
    return id
  }

  /**
   * Update element positions.
   * Determines if the element is in view based on the cached
   * attributes, if so set the elements parallax styles.
   */
  function _updateElementPositions () {
    elements.forEach(element => {
      if (element.props.disabled) return

      // check if the element is in view then
      const isInView = isElementInView(element, windowHeight, scrollY)

      // set styles if it is
      if (isInView) _setParallaxStyles(element)

      // reset ticking so more animations can be called
      ticking = false
    })
  }

  /**
   * Update element attributes.
   * Sets up the elements offsets based on the props passed from
   * the component then caches the elements current position and
   * other important attributes.
   */
  function _updateElementAttributes () {
    elements.forEach(element => {
      if (element.props.disabled) return

      _setupOffsets(element)

      _cacheAttributes(element)
    })
  }

  /**
   * Remove parallax styles from all elements.
   */
  function _removeParallaxStyles () {
    elements.forEach(element => {
      _resetStyles(element)
    })
  }

  /**
   * Takes a parallax element and caches important values that
   * cause layout reflow and paints. Stores the values as an
   * attribute object accesible on the parallax element.
   * @param {object} element
   */
  function _cacheAttributes (element) {
    const { yMin, yMax, xMax, xMin } = element.offsets

    const { slowerScrollRate } = element.props

    // NOTE: Many of these cause layout and reflow so we're not
    // calculating them on every frame -- instead these values
    // are cached on the element to access later when determining
    // the element's position and offset.
    const el = element.elOuter
    const rect = el.getBoundingClientRect()
    const elHeight = el.offsetHeight
    const elWidth = el.offsetWidth

    let scrollY = 0
    if (eventEmitter) {
      if (typeof eventEmitter.getVerticalOffset === 'function') {
        scrollY = eventEmitter.getVerticalOffset()
      }
    } else {
      scrollY = window.pageYOffset
    }

    // NOTE: offsetYMax and offsetYMin are percents
    // based of the height of the element. They must be
    // calculated as px to correctly determine whether
    // the element is in the viewport.
    const yPercent = yMax.unit === '%' || yMin.unit === '%'
    const xPercent = xMax.unit === '%' || xMin.unit === '%'

    // X offsets
    let yMinPx = yMin.value
    let yMaxPx = yMax.value

    if (yPercent) {
      const h100 = elHeight / 100
      yMaxPx = yMax.value * h100
      yMinPx = yMin.value * h100 // negative value
    }

    // Y offsets
    let xMinPx = xMax.value
    let xMaxPx = xMin.value

    if (xPercent) {
      const w100 = elWidth / 100
      xMaxPx = xMax.value * w100
      xMinPx = xMin.value * w100 // negative value
    }

    // NOTE: must add the current scroll position when the
    // element is checked so that we get its absolute position
    // relative to the document and not the viewport then
    // add the min/max offsets calculated above.
    let top = 0
    let bottom = 0

    if (slowerScrollRate) {
      top = rect.top + scrollY + yMinPx
      bottom = rect.bottom + scrollY + yMaxPx
    } else {
      top = rect.top + scrollY + yMaxPx * -1
      bottom = rect.bottom + scrollY + yMinPx * -1
    }

    // NOTE: Total distance the element will move from when
    // the top enters the view to the bottom leaving
    // accounting for elements height and max/min offsets.
    const totalDist = windowHeight + (elHeight + Math.abs(yMinPx) + yMaxPx)

    element.attributes = {
      top,
      bottom,
      elHeight,
      elWidth,
      yMaxPx,
      yMinPx,
      xMaxPx,
      xMinPx,
    totalDist}
  }

  /**
   * Takes a parallax element and parses the offset props to get the value
   * and unit. Sets these values as offset object accessible on the element.
   * @param {object} element
   */
  function _setupOffsets (element) {
    const {offsetYMin, offsetYMax, offsetXMax, offsetXMin} = element.props

    const yMin = parseValueAndUnit(offsetYMin)
    const yMax = parseValueAndUnit(offsetYMax)
    const xMin = parseValueAndUnit(offsetXMax)
    const xMax = parseValueAndUnit(offsetXMin)

    if (xMin.unit !== xMax.unit || yMin.unit !== yMax.unit) {
      throw new Error(
        'Must provide matching units for the min and max offset values of each axis.'
      )
    }

    const xUnit = xMin.unit || '%'
    const yUnit = yMin.unit || '%'

    element.offsets = {
      xUnit,
      yUnit,
      yMin,
      yMax,
      xMin,
    xMax}
  }

  /**
   * Takes a parallax element and set the styles based on the
   * offsets and percent the element has moved though the viewport.
   * @param {object} element
   */
  function _setParallaxStyles (element) {
    const top = element.attributes.top - scrollY
    const { totalDist } = element.attributes

    // Percent the element has moved based on current and total distance to move
    const percentMoved = (top * -1 + windowHeight) / totalDist * 100

    // Scale percentMoved to min/max percent determined by offset props
    const { slowerScrollRate } = element.props

    // Get the parallax X and Y offsets
    const offsets = getParallaxOffsets(
      element.offsets,
      percentMoved,
      slowerScrollRate
    )

    // Apply styles
    const el = element.elInner

    // prettier-ignore
    el.style.transform = `translate3d(${offsets.x.value}${offsets.x.unit}, ${offsets.y.value}${offsets.y.unit}, 0)`
  }

  /**
   * Takes a parallax element and removes parallax offset styles.
   * @param {object} element
   */
  function _resetStyles (element) {
    const el = element.elInner
    el.style.transform = ''
  }

  /**
   * -------------------------------------------------------
   * Public methods
   * -------------------------------------------------------
   */

  /**
   * Gets the parallax elements in the controller
   * @return {array} parallax elements
   */
  this.getElements = function () {
    return elements
  }

  /**
   * Creates a new parallax element object with new id
   * and options to store in the 'elements' array.
   * @param {object} options
   * @return {object} element
   */
  this.createElement = function (options) {
    const id = _createID()
    const newElement = {
      id,
      ...options
    }

    const updatedElements = [...elements, newElement]
    elements = updatedElements
    this.update()

    return newElement
  }

  /**
   * Creates a new parallax element object with new id
   * and options to store in the 'elements' array.
   * @param {object} element
   */
  this.removeElement = function (element) {
    const updatedElements = elements.filter(el => el.id !== element.id)
    elements = updatedElements
  }

  /**
   * Updates an existing parallax element object with new options.
   * @param {object} element
   * @param {object} options
   */
  this.updateElement = function (element, options) {
    const updatedElements = elements.map(el => {
      // create element with new options and replaces the old
      if (el.id === element.id) {
        // update props
        el.props = options.props
      }
      return el
    })

    elements = updatedElements

    // call update to set attributes and positions based on the new options
    this.update()
  }

  /**
   * Remove element styles.
   * @param {object} element
   */
  this.resetElementStyles = function (element) {
    _resetStyles(element)
  }

  /**
   * Updates all parallax element attributes and postitions.
   */
  this.update = function () {
    windowHeight = getWindowHeight()
    _updateElementAttributes()
    _updateElementPositions()
  }

  /**
   * Removes listeners, reset all styles then nullifies the global ParallaxController.
   */
  this.destroy = function () {
    _removeListeners()
    _removeParallaxStyles()
    window.ParallaxController = null
  }
}

/**
 * Static method to instantiate the ParallaxController.
 * Returns a new or existing instance of the ParallaxController.
 * @returns {Object} ParallaxController
 */
ParallaxController.init = function (options) {
  const hasWindow = typeof window !== 'undefined'

  if (!hasWindow) {
    throw new Error(
      'Looks like ParallaxController.init() was called on the server. This method must be called on the client.'
    )
  }

  const controller = new ParallaxController(options)

  // Keep global reference for legacy versions <= 1.1.0
  if (hasWindow && !window.ParallaxController) {
    window.ParallaxController = controller
  }

  return controller
}

export default ParallaxController
