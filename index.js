const fs = require('fs');
const path = require('path');

const pkgDir = require('pkg-dir');
const $ = require('cheerio');
const Lipo = require('lipo');
const TextToSvg = require('text-to-svg');
const _ = require('lodash');
const isSANB = require('is-string-and-not-blank');
const levenshtein = require('fast-levenshtein');
const osFonts = require('os-fonts');

const useTypes = ['user', 'local', 'network', 'system'];

const fontExtensions = ['otf', 'OTF', 'ttf', 'TTF', 'woff', 'WOFF'];

let defaults = {
  text: '',
  fontNameOrPath: 'Arial',
  fontSize: '24px',
  fontColor: '#000',
  backgroundColor: 'transparent',
  supportsFallback: true,
  resizeToFontSize: false,
  trim: false,
  trimTolerance: 10,
  attrs: {},
  textToSvg: {
    x: 0,
    y: 0,
    anchor: 'left top',
    attributes: {
      stroke: 'none'
    }
  }
};

function setDefaults(options) {
  defaults = _.defaultsDeep(options, defaults);
  return defaults;
}

// eslint-disable-next-line complexity
function setOptions(options) {
  // Clone to prevent interference
  options = _.cloneDeep(options);

  // Set deep defaults
  options = _.defaultsDeep(options, defaults);

  // Ensure `text` is a string
  if (!_.isString(options.text)) throw new Error('`text` must be a String');

  // Ensure `fontNameOrPath` is a string and not blank
  if (!isSANB(options.fontNameOrPath))
    throw new Error('`fontNameOrPath` must be a String and not blank');

  // Convert font size in pixels to number
  // and remove px, so we just convert to digits only
  if (_.isString(options.fontSize))
    options.fontSize = parseFloat(options.fontSize);

  // Round to nearest whole pixel
  options.fontSize = Math.round(options.fontSize);

  // Ensure it's a number greater than 0
  if (!_.isNumber(options.fontSize) || options.fontSize <= 0)
    throw new Error(
      '`fontSize` must be a Number or String that is a valid number > than 0'
    );

  // Ensure `fontColor` is a string
  if (!isSANB(options.fontColor))
    throw new Error('`fontColor` must be a String and not blank');

  // Ensure `backgroundColor` is a string
  if (!isSANB(options.backgroundColor))
    throw new Error('`backgroundColor` must be a String and not blank');

  // Ensure supportsFallback is a boolean else true
  if (!_.isBoolean(options.supportsFallback))
    throw new Error('`supportsFallback` must be a Boolean');

  // Ensure resizeToFontSize is a boolean else true
  if (!_.isBoolean(options.resizeToFontSize))
    throw new Error('`resizeToFontSize` must be a Boolean');

  // Ensure trim is a boolean else true
  if (!_.isBoolean(options.trim)) throw new Error('`trim` must be a Boolean');

  // Ensure trimTolerance is a number else 10
  if (
    !_.isNumber(options.trimTolerance) ||
    options.trimTolerance < 1 ||
    options.trimTolerance > 99
  )
    throw new Error(
      '`trimTolerance` must be a Number between 1 and 99 inclusive'
    );

  // If `textToSvg.attributes.fill` is not set
  // then set it equal to `fontColor`
  if (!_.isString(options.textToSvg.attributes.fill))
    options.textToSvg.attributes.fill = options.fontColor;

  // If `textToSvg.fontSize` not set, then we will calculate
  // what the `fontSize` should be based off height of font
  if (!_.isNumber(options.textToSvg.fontSize))
    options.textToSvg.fontSize = options.fontSize;

  // If `fontNameOrPath` was not a valid font path (with smart detection)
  // then result to use `getClosestFontName` and `getFontPathByName`
  try {
    const ext = path.extname(options.fontNameOrPath);
    const fontName = path.basename(options.fontNameOrPath, ext);

    if (_.includes(fontExtensions, ext)) {
      const stats = fs.statSync(path.resolve(options.fontNameOrPath));
      if (!stats.isFile())
        throw new Error(
          `${path.resolve(options.fontNameOrPath)} was not a valid file`
        );

      options.fontPath = path.resolve(options.fontNameOrPath);
      options.fontName = fontName;
    } else {
      const fontDir = path.dirname(path.resolve(options.fontNameOrPath));

      let data = _.map(fontExtensions, ext => {
        const filePath = `${fontDir}/${fontName}.${ext}`;
        try {
          const stats = fs.statSync(filePath);
          return stats.isFile() ? filePath : false;
        } catch (err) {
          return false;
        }
      });

      // Remove false matches
      data = _.compact(data);

      // If this was a directory path then throw an error that it was not found
      if (options.fontNameOrPath.indexOf(path.sep) !== -1 && data.length === 0)
        throw new Error(
          `\`fontNameOrPath\` "${options.fontNameOrPath}" file was not found`
        );

      if (data.length > 0) {
        options.fontName = fontName;
        options.fontPath = data[0];
      } else {
        options.fontName = getClosestFontName(options.fontNameOrPath);
        options.fontPath = getFontPathByName(options.fontName);
      }
    }

    return options;
  } catch (err) {
    throw err;
  }
}

// eslint-disable-next-line max-params
function renderFallback(text, fontSize, fontColor, backgroundColor, attrs) {
  attrs.title = text;
  attrs.alt = text;
  attrs.style = attrs.style || '';
  attrs.style += `color: ${fontColor};`;
  attrs.style += `font-size: ${fontSize / 2}px;`;
  attrs.style += `line-height: ${fontSize}px;`;
  attrs.style += 'text-align: center;';
  attrs.style += `background-color: ${backgroundColor};`;
  return attrs;
}

function applyAttributes($el, attrs) {
  _.each(_.keys(attrs), key => {
    $el.attr(key, attrs[key]);
  });
  return $el;
}

function svg(options) {
  try {
    options = setOptions(options);
    const textToSvg = TextToSvg.loadSync(options.fontPath);
    const str = textToSvg.getSVG(options.text, options.textToSvg);
    let $svg = $(str);
    const $rect = $('<rect>');
    $rect.attr('width', $svg.attr('width'));
    $rect.attr('height', $svg.attr('height'));
    $rect.attr('fill', options.backgroundColor);
    $svg.prepend($rect);
    $svg.attr('width', Math.round(parseFloat($svg.attr('width'))));
    $svg.attr('height', Math.round(parseFloat($svg.attr('height'))));
    $svg.attr('viewBox', `0 0 ${$svg.attr('width')} ${$svg.attr('height')}`);
    $svg = applyAttributes($svg, options.attrs);
    return $.html($svg);
  } catch (err) {
    throw err;
  }
}

function img(options) {
  try {
    options = setOptions(options);
    const str = svg(options);
    const $svg = $(str);
    let $img = $('<img>');
    $img.attr('width', $svg.attr('width'));
    $img.attr('height', $svg.attr('height'));
    $img.attr(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(str, 'utf8').toString('base64')}`
    );
    if (options.supportsFallback)
      options.attrs = renderFallback(
        options.text,
        $svg.attr('height'),
        options.fontColor,
        options.backgroundColor,
        options.attrs
      );
    $img = applyAttributes($img, options.attrs);
    return $.html($img);
  } catch (err) {
    throw err;
  }
}

function png(options, scale) {
  // Default scale it 1
  scale = scale || 1;

  if (!_.isNumber(scale)) throw new Error('`scale` must be a Number');

  try {
    options = setOptions(options);

    //
    // initially I tried to use the package `svgo`
    // to optimize the image and remove invisible whitespace
    // but this feature isn't available yet
    // https://github.com/svg/svgo/issues/67
    //
    // also I used Sharp directly, but then created Lipo
    // to alleviate the need for developers to install libvips or worry
    // about installing extra dependencies on their system
    // but still allow them to use the brilliance of Sharp
    //

    const { fontSize } = options;
    options.fontSize = Math.round(fontSize * scale);
    options.textToSvg.fontSize = options.fontSize;

    const str = svg(options);
    const buf = Buffer.from(str, 'utf8');

    const getImage = new Lipo()(buf);

    if (options.trim) getImage.trim(options.trimTolerance);

    if (options.resizeToFontSize)
      getImage.resize(null, Math.round(fontSize * scale));

    const imageBuffer = getImage.png().toBufferSync();

    const metadata = new Lipo()(imageBuffer).metadataSync();

    let $img = $('<img>');
    $img.attr('width', Math.round(metadata.width / scale));
    $img.attr('height', Math.round(metadata.height / scale));
    $img.attr('src', `data:image/png;base64,${imageBuffer.toString('base64')}`);
    if (options.supportsFallback)
      options.attrs = renderFallback(
        options.text,
        Math.round(metadata.height / scale),
        options.fontColor,
        options.backgroundColor,
        options.attrs
      );
    $img = applyAttributes($img, options.attrs);

    return $.html($img);
  } catch (err) {
    throw err;
  }
}

function png2x(options) {
  try {
    const str = png(options, 2);
    return str;
  } catch (err) {
    throw err;
  }
}

function png3x(options) {
  try {
    const str = png(options, 3);
    return str;
  } catch (err) {
    throw err;
  }
}

function getClosestFontName(fontNameOrPath) {
  try {
    const fontNames = getAvailableFontNames();
    const fontNamesByDistance = _.sortBy(
      _.map(fontNames, name => {
        return {
          name,
          distance: levenshtein.get(
            fontNameOrPath.toLowerCase(),
            name.toLowerCase()
          )
        };
      }),
      ['distance', 'name']
    );
    // If there were no matches or if the distance
    // of character difference is 50% different
    // than actual length of the font name, then reject it
    if (
      fontNamesByDistance.length === 0 ||
      fontNamesByDistance[0].distance > fontNameOrPath.length / 2
    )
      throw new Error(
        `"${fontNameOrPath}" was not found, did you forget to install it?`
      );
    return fontNamesByDistance[0].name;
  } catch (err) {
    throw err;
  }
}

function getFontPathByName(name) {
  try {
    const fontPathsByName = getFontPathsByName();
    return fontPathsByName[name];
  } catch (err) {
    throw err;
  }
}

function getFontPathsByName() {
  try {
    const fontNames = getAvailableFontNames();
    const fontPaths = getAvailableFontPaths();
    return _.zipObject(fontNames, fontPaths);
  } catch (err) {
    throw err;
  }
}

function getAvailableFontPaths() {
  try {
    let fonts = _.map(useTypes, osFonts.getAllSync);
    fonts = _.flatten(fonts);
    const arr = [];
    // add fonts from system
    for (let i = 0; i < fonts.length; i++) {
      let ext = path.extname(fonts[i]);
      if (ext.indexOf('.') === 0) ext = ext.substring(1);
      if (fontExtensions.includes(ext)) arr.push(fonts[i]);
    }

    // add node_modules folder
    const nodeModuleFonts = osFonts.getFontsInDirectorySync(
      path.join(pkgDir.sync(__dirname), 'node_modules')
    );
    for (let i = 0; i < nodeModuleFonts.length; i++) {
      let ext = path.extname(nodeModuleFonts[i]);
      if (ext.indexOf('.') === 0) ext = ext.substring(1);
      if (fontExtensions.includes(ext)) arr.push(nodeModuleFonts[i]);
    }

    // Sort the fonts A-Z
    return arr.sort();
  } catch (err) {
    throw err;
  }
}

function getAvailableFontNames() {
  try {
    const fontPaths = getAvailableFontPaths();
    return _.map(fontPaths, fontPath =>
      path.basename(fontPath, path.extname(fontPath))
    );
  } catch (err) {
    throw err;
  }
}

module.exports = {
  setDefaults,
  setOptions,
  svg,
  img,
  png,
  png2x,
  png3x,
  getClosestFontName,
  getFontPathsByName,
  getFontPathByName,
  getAvailableFontPaths,
  getAvailableFontNames
};
