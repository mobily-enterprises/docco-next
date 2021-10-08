// Docco Next
// =====
// [Docco Next](https://github.com/mobily-enterprises/docco-next) facilitates
// [literate programming](https://en.wikipedia.org/wiki/Literate_programming)
// in several languages. It's written in modern Javascript, and runs in Node.
//
// See the [generated documentation as HTML](https://mobily-enterprises.github.io/docco-next/)
//
// Install and use
// ---------------
// To use Docco Next run `npm install -g docco-next` and run it passing it a list of files
// (e.g. `docco src/*js`)
//
// By default, every file will be converted into formatted HTML and will be placed in the
// default destination directory (`docs` by default). It's also possible to
// convert files to Markdown, rather than HTML. Note that files will
// retain their original names and will change their extension to `html`.
//
// Is it literate programming?
// ---------------------------
// Formally speaking, literate programs put documentation strictly first.
//
// In simple words, a literate file will look like a Markdown file, and its
// code is whichever Markdown code is included in the file.
// This means that anything that is not Markdown code (and is therefore indented in) is
// considered documentation, and programs are organised so that the documentation
// actually makes sense.
//
// A notable example is CoffeeScript, which supports .litcoffee files natively.
//
// However, not many languages support literate programming. Most languages will
// need a proprocessor, for example to convert the `.js.md` file into `.js`.
// [lit](https://github.com/vijithassar/lit) is one of such tools. In Node, you
// can use Rich Harris's [lit-node](https://github.com/Rich-Harris/lit-node)
// to require .md files directly.
//
// Docco Next works with normal source code (such as `.js` or `.c`) as well as literate
// source code (such as literate CoffeeScript, `.litcoffee`, or `.js.md`).
//
// With pure literate style, all you have to do is add the .md extension to your
// source file.
//
// When processing source files (such as `.js` or `.c`), one line comments are considered
// documentation and are parsed using Markdown. The code (that is, anything that is
// not a one-line comment)  is processed by [Shiki](https://shiki.matsu.io/).
//
// In both cases, the end result is a set of HTML pages with your documentation.
//
// Similar projects
// ------------------
// Here is a list of _active_ projects which achieve similar goals:
//
// * [Docco](https://github.com/jashkenas/docco) by Jeremy Ashkenas (the same
// wise author of Underscore and Backbone). The program that
// inspired many others (including me) to use literate programming techniques and
// implement code that facilitates it
//
// * [pycco](https://github.com/pycco-docs/pycco) by Nick Fitzgerald. A Python
// implementation of literate programming
//
// * [Marginalia](https://github.com/gdeer81/marginalia) by Gary Deer. A **Clojure**
// implementation of literate programing. The project was originally started by Michael Fogus.
//
// This file is the full source code of Docco Next, and it explains how it works in
// pure literate style.
//
// Required files and starting configuration
// -----------------------------------------
// The following libraries are required by Docco Next:
// * `ejs`. Used to convert the layout master file into HTML
// * `fs-extra`. Used for all I/O operations
// * `marked`. Used to convert Markdown into HTML
// * `commander`. Used to interpret command line parameters
// * `shiki`. Used to highlight source code
//
// In Javascript terms, this becomes:
const path = require('path')
const ejs = require('ejs')
const fs = require('fs-extra')
const marked = require('marked')
const commander = require('commander')
const shiki = require('shiki')

// On startup, the `version` variable is worked out straight from the `package.json`
// file, which is loaded using `require`
const pkg = require('./package.json')
const version = pkg.version

// Docco Next manages several languages, stored in `layouts/languages.json`.
// Users can add more languages if desired. However, the list of default languages
// (and their relevant information) is stored in `layouts/languages.json`
const defaultLanguages = require('./layouts/languages.json')

// By default, `marked` is run with very basic options (basically, just turning
// `smartypants` on). Users can add more options, but this is the starting point
const defaultMarkedOptions = { smartypants: true }

// Configuration
// ---------------
// The `run` function is the entry point of the script when it's run by the
// command line (that is, it's not being used as a library).
// The `docco` command in `bin` simply runs `require('../docco.js').run()`.
//
// The package `commander` will be used to parse command-line parameters.
// Commander will generate a configuration object based on how it's configured
// using its `option` method.
//
// For example the line:
//
//     .option('-L, --languages [file]', 'use a custom languages.json')
//
// Means that if Docco Next is run with `--languages ./some/file.json`, the config
// object will include `{ languages: "./some/file.json"}`.
//
// Commander also provides the handy `helpInformation()` method, which will print
// out how the command is used.
//
// This is the full set of options available in Docco Next:
async function run (args = process.argv) {
  commander
    .name('docco')
    .version(version)
    .usage('[options] files')
    .option('-L, --languages [file]', 'use a custom languages.json')
    .option(
      '-l, --layout [name]',
      'choose a layout (default, parallel or classic)'
    )
    .option('-s, --shiki-theme [shikiTheme]', 'choose a shiki theme')
    .option('-o, --output [path]', 'output to a given folder')
    .option('-c, --css [file]', 'use a custom css file')
    .option('-p, --plugin [file]', 'use a custom plugin file')
    .option('-t, --template [file]', 'use a custom .ejs template')
    .option(
      '-e, --inputExtension [ext]',
      'assume a file extension for all inputs'
    )
    .option('-m, --marked [file]', 'use custom marked options')
    .option(
      '-x, --outputExtension [ext]',
      'set default file extension for all outputs'
    )
    .parse(args)
  if (commander.args.length) {
    const config = { ...commander.opts(), args: commander.args }
    await cmdLineNormalise(config)
    configure(config)
    await cmdLineSanityCheck(config)

    await documentAll(config)
  } else {
    return console.log(commander.helpInformation())
  }
}

// Three configuration functions are called:
//
// * `cmdLineNormalise()` -- expands some command line options to objects
// * `configure()` -- enriches configuration options with full paths etc.
// * `cmdLineSanityCheck()` -- checks that files and folders actually exist.
//
// Here is an explanation of what each one does, followed by their source code.
//
// ### **Step 1: `cmdLineNormalise()`**
//
// It's important to understand that Docco Next can be used as a library as well as
// a command line program.
// Two of the command line options, `marked` and `languages`, are external JSON
// files. When used as a library, Docco Next will expect `marked` and `languages` to be
// objects. However, when run as a command line program, those options will
// contain a string with a (JSON) file name instead.
//
// The `cmdLineNormalise()` function is used to convert those strings into
// Javascript objects which will depend on the contents of the corresponding
// JSON files
// The fuction also assigns `config.args` (which is the list of files to be
// converted) to `config.sources`.
//
// To sum up: when using Docco Next as a library, `config.languages` and `config.maked`
// will need to be objects. However, from the command line, they will be the paths of
// JSON files, and will be converted to objects by `cmdLineNormalise()`, which
// reads:

async function cmdLineNormalise (config) {
  if (config.languages) {
    if (!(await fileExists(config.languages))) {
      console.error('Languages file not found:', config.languages)
      process.exit(5)
    }
    const languages = await fs.readFile(config.languages)
    config.languages = JSON.parse(languages)
  }

  if (config.plugin) {
    if (!(await fileExists(config.plugin))) {
      console.error('Plugin file not found:', config.plugin)
      process.exit(5)
    }
    config.plugin = require(path.join(process.cwd(), config.plugin))
  } else {
    config.plugin = {}
  }

  if (!config.outputExtension) config.outputExtension = 'html'

  if (config.marked) {
    if (!(await fileExists(config.marked))) {
      console.error('Marked file not found:', config.marked)
      process.exit(6)
    }
    const marked = await fs.readFile(config.marked)
    config.marked = JSON.parse(marked)
  }

  config.sources = config.args
}

// ### **Step 2: `configure()`**

// This function is different to the other two `cmdLineNormalise()` and
// `cmdLineSanityCheck()`: rather than being a command line-only normalisation
// function, it's actually a function that is run _every time_ an API call is
// invoked. (Note that once it's run once, it sets the `config.configured`
// property in the `config` object, and will check this property so that it will
// ever do anything only the first time it's invoked)
//
// This function is responsible to set sane defaults in the `config` property,
// so that each function doesn't need to worry with wasteful checking.
//
// For example `config.output` will be set as `docs` by default.
//
// Also, for passed properties such as `languages` or `marked`, this function
// makes sure that the passed options are _added_ to sane defaults. For example
// by passing the `marked` property in the config object, this function makes
// sure that the default `smartypants: true` is on, and any configuration
// options are added on _top_ of what the user has passed. Or, that the
// config.languages contains the used-defined languages, _as well as_ the
// default ones.
//
// This function also sets some indirect configuration options that are not meant
// to be passed by the developer, but that are a result of the configuration.
//
// Finally, this function also makes sure that the passed config makes sense:
// `config.sources` is scanned and any source with an unknown language (that is,
// a language not in the `languages` array) is filtered out (with a warning).
//
// You can see this function as insurance that there is a solid, valid `config`
// object that every call can use. This is why every single function that uses
// `config` will call `configure` first.

function configure (config) {
  if (config.configured) return
  config.configured = true

  config.output = config.output || 'docs'

  config.languages = properObjectWithKeys(config.languages)
    ? { ...defaultLanguages, ...config.languages }
    : defaultLanguages

  config.marked = properObjectWithKeys(config.marked)
    ? { ...defaultMarkedOptions, ...config.marked }
    : defaultMarkedOptions

  config.layout = config.layout || 'default'
  if (config.layout.match(/^[a-zA-Z0-9]+$/)) {
    config.layout = path.join(__dirname, 'layouts', config.layout)
  }

  if (!config.css) config.css = path.join(config.layout, 'docco.css')

  config.public = path.join(config.layout, 'public')

  if (!config.template) {
    config.template = path.join(config.layout, 'docco.ejs')
  }

  config.sources = config.sources || {}

  config.sources = config.sources.filter((source) => {
    const there = getLanguage(source, config)
    if (!there) {
      console.warn(
        `docco: file not processed, language not supported: (${path.basename(
          source
        )})`
      )
    }
    return there
  })
}

// ### **Step 3: `cmdLineSanityCheck()`**

// The `cmdLineSanityCheck()` is a command line-only function, which
// is used to make sure that paths specified in the `config` object
// have corresponding files or directories.
//
// For example `config.output` represents the directory where all output files
// will be written. If that directory doesn't exist, Docco Next (as run from the command
// line) will refuse to work.
// The same applies to `config.layout` (the path to the layout, which is effectively
// the "theme" used), `config.css` (the alternative CSS file used), and all files
// specified in the `sources` array.
//
async function cmdLineSanityCheck (config) {
  if (config.output && !(await dirExists(config.output))) {
    console.error('Output directory not found:', config.output)
    process.exit(1)
  }
  if (config.layout && !(await dirExists(config.layout))) {
    console.error('Layout directory not found:', config.layout)
    process.exit(2)
  }

  /*
  if (config.css && !await fileExists(config.css)) {
    console.error('CSS file not found:', config.css)
    process.exit(3)
  }
  */

  if (config.sources) {
    for (const source of config.sources) {
      if (source && !(await fileExists(source))) {
        console.error('source file not found:', source)
        process.exit(5)
      }
    }
  }
}

// Going through each file via documentOne() and documentAll()
// -----------------------------------------------------------
// Up to this point, it's all been about preparing the ground for the program
// to run: processing of command line options, sanitising the configuration object,
// and so on.
//
// It's time to get to the actual work: scanning the `sources` array, and actually
// get the documentation create and copied, which happens thanks to the
// calls `documentAll()` and `documentOne()`.
//
// First of all, some important file-related utility functions are created -- some
// of them are very generic, while some others are very specific to Docco Next.
//
// The functions are:
//
// * `dirExists()` -- checks if a directory exists
// * `fileExists()` -- checks if a file exists
// * `finalPath()` -- works out the final path of a file, depeding of `config.output`
//   and allowing a change of extension
// * `copyAsset()` -- copies a file or a directory into `config.output`, preserving
//   the path relative to the destination. So `some/other/file.html` will be copied
//   to `docs/some/other/file.html`
// * `write()` -- simply writes a file to its destination
//
// There are also some utility functions that are not file-related:
//
// * `properObjectWithKeys()` -- returns `true` if the passed variable
//   is an proper (not-null) object that is not empty
// * `getLanguage(source, config)` - TODO: explain what it actually does

// Here is the code for those functions:

async function dirExists (dir) {
  if (await fs.pathExists(dir)) {
    const stat = await fs.lstat(dir)
    return stat.isDirectory()
  }
  return false
}

async function fileExists (dir) {
  if (await fs.pathExists(dir)) {
    const stat = await fs.lstat(dir)
    return stat.isFile() || stat.isSymbolicLink()
  }
  return false
}

function finalPath (source, config) {
  const ext = config.outputExtension
  return path.join(
    config.output,
    path.dirname(source),
    path.basename(source, path.extname(source)) + '.' + ext
  )
}

async function copyAsset (file, type, config = {}) {
  configure(config)
  if (!file) return
  if (type === 'file' && !(await fileExists(file))) return
  if (type === 'directory' && !(await dirExists(file))) return
  return fs.copy(file, path.join(config.output, path.basename(file)))
}

async function write (source, path, contents) {
  console.log(`docco: ${source} -> ${path}`)
  await fs.outputFile(path, contents)
}

function properObjectWithKeys (o) {
  return typeof o === 'object' && o !== null && Object.keys(o).length
}

function getLanguage (source, config = {}) {
  configure(config)

  let codeExt, codeLang, lang

  const ext =
    config.inputExtension || path.extname(source) || path.basename(source)
  lang = config.languages[ext]
  if (!lang) return
  if (lang.name === 'markdown') {
    codeExt = path.extname(path.basename(source, ext))
    if (codeExt) {
      codeLang = config.languages[codeExt]
      if (codeLang) {
        lang = { ...codeLang, literate: true }
      }
    }
  }
  /* Add commentMatcher */
  lang.commentMatcher = RegExp(`^\\s*${lang.symbol}\\s?`)
  /* Add commentFilter */
  /* Ignore [hashbangs](http://en.wikipedia.org/wiki/Shebang_%28Unix%29) and interpolations... */
  lang.commentFilter = /(^#![/]|^\s*#\{)/

  return lang
}

// Now that everything _really is_ ready, it's time to (finally!) go through
// the `source` array and run `documentOne()` on each one of them. Also,
// if the sources are being converted to HTML, the `css` file and the `public` directory
// for that layout are copied over using the `copyAsset` utility function
//
// Note that `configure()` is run. Since `configure()` only ever does anything
// the first time it's run, and since it was already run in the `run()` function,
// it may seem superfluous to run it again. However, keep in mind that
// Docco Next exports an API. So, every call that receives `config` will always
// run `configure(config)` to make sure that sane defaults are set.

async function documentAll (config = {}) {
  configure(config)
  await fs.mkdirs(config.output)

  for (const source of config.sources) {
    await documentOne(source, config)
  }

  await copyAsset(config.css, 'file', config)
  await copyAsset(config.public, 'directory', config)
}

// `documentOne` is the centrepiece of the program: it uses the important
// parsing and manipulation functions (which are also available as API) to
// write the HTML file to the specified output path (`docs` by default)
// This function will:
//
// * Read a file
// * figures out which language it's written in
// * If a language is literate (see: `.litcoffee` or `.md`), convert it to
//   code first using `litToCode()`. This is to ensure that `parse()` (the next
//   call) always receives "normal", runnable code (which is what it expects)
// * Run `parse()` which will parse the file into an array of `sections`, where
//   each element has the properties `docsText` and `codeText`
// * Run `formatAsHtml()` which  returns a formatted, finalised, ready-to-go
//   HTML string based on the array of sections passed
// * Write the file to its destination directory
//
// Here is the source code:

async function documentOne (source, config = {}) {
  configure(config)
  /* console.log(source) */

  const buffer = await fs.readFile(source)
  let lines = buffer.toString().split('\n')
  const path = finalPath(source, config)

  config.lang = getLanguage(source, config)
  if (!config.lang) {
    console.warn(
      `docco: file not processed, language not supported: (${path.basename(
        source
      )})`
    )
    return
  }
  if (config.lang.literate) {
    lines = litToCode(lines, config)
  }
  const sections = parse(source, lines, config)

  const result = await formatAsHtml(source, sections, config)

  await write(source, path, result)
}

// The actual parsing and manipulation
// -------------------------------------
//
// As explained above, `documentOne()` is Docco Next's centrepiece, calling
// `litToCode()`, `parse()`, `formatAsHtml`, and finally `write()`.
//
// These functions are indeed the core functionalities of Docco Next.
//
// ## litToCode()
//
// This function takes literal code and returns "proper" source code that is
// ready to be executed. It does this by simply de-intending Markdown-indented
// code, and adding a comment marker to any other line. So, for example:
//
//     This is a literate .md file that contains code. This is the full
//     extent of the program:
//
//         console.log("Hello world!")
//
//     This is it!
//
// Is transformed into actually executable code:
//
//     # This is a literate .md file that contains code. This is the full
//     # extent of the program:
//
//     console.log("Hello world!")
//
//     # This is it!
//
// This step will only be taken in cases where the input file is
// literate code, which is true for those languages in `languages.json` where
// the flag `literate` is set to true, _or_ when the file is
// for example `something.js.md` -- that is, a Markdown file that
// contains Javascript

function litToCode (lines, config) {
  configure(config)

  const lang = config.lang
  const retLines = []
  const markdownIndented = /^([ ]{4}|[ ]{0,3}\t)/
  let inCode = lines[0] && markdownIndented.exec(lines[0])

  /** Remembering that a source code line are those without leading "   ":
   * add a comment marker at the beginning of each non-code line
   * Take out the leading "    " from every code line
   **/
  for (const [i, line] of lines.entries()) {
    /**
      Empty lines are a special case:
        - in code, they must stay blank.
        - In doc, they myst include the comment marker
    **/
    const emptyLine = /^\s*$/.test(line)
    /* Non-empty lines are added depending on them being code or doc. */
    if (!emptyLine) {
      inCode = markdownIndented.exec(line)
      retLines[i] = inCode
        ? line.slice(inCode[0].length)
        : lang.symbol + ' ' + line
      /* The concept of "empty" changes whether we are in code or not */
    } else {
      retLines[i] = inCode ? '' : lang.symbol
    }
  }
  return retLines
}

// ## parse()
//
// This function takes a string representing the source code, and returns
// an array of `sections`. Each section has two properties: `docsText` (the
// documentation text, formatted with Markdown) and `codeText` (the code
// displayed underneath the text in `docsText`).
//
// Basically, each "section" is made up of two chunks: one formatted as
// Markdown, _followed_ by a piece of code.
//
// There are two main cases: one for non-empty lines, and one for empty lines.
//
// Non-empty lines can be either "comments" (which will end up in `docsText`) or
// code (which will end up in `codeText`). It's crucial to understand that
// the flow works by adding comment lines to `docsText`, then (once a code line
// is found) adding code lines to `codeText`, and when a comment line is
// found again a new section is created, the two variables are reset, and everythig
// starts again.
//
// In more technical terms, the flow starts with empty `docsText` and
// `codeText`; the function will append comment lines to `docsText` (with
// `codeText` being empty) until a code line is encountered.
// At that point it will append to `codeText`; however, when the next
// comment line (destined to `docsText`) is encountered, since `codeText` is
// _not_ empty, a new section containing `docsText` and `codeText` is created
// and both those variables are cleared; the commented line that triggered the
// new section is then added to `docsText` (with a now empty `codeText`),
// and everything starts again. Basically, in the flow _you know if you are in the
// middle of code if `codeText` is empty_.
//
// Empty lines are... empty, both for doc and code. To know where to add
// the empty line (`codeText` or `docsText`), the same assumption as above is
// used: if there is anything in `codeText`, it means that the parser is
// in the middle of a code section, and therefore the empty line will be
// added to that code section.
function parse (source, lines, config = {}) {
  let codeText, docsText
  const sections = []

  configure(config)

  const lang = config.lang
  docsText = codeText = ''
  let lineNumber = 0
  let startLineNumber = 1
  for (let line of lines) {
    lineNumber++
    /* If the line is not empty, it will either go in the code section */
    /* or the docs section, depending on whether the comment character was */
    /* found at the beginning of the line */
    if (line) {
      /* Case #1: it's a "comment" */
      /*  Text will go in docsText as documentation */
      if (line.match(lang.commentMatcher) && !line.match(lang.commentFilter)) {
        /*
          DETOUR: If there is code in codeText already, close off that section
          the section by pushing it into `sections` and zeroing
         `docsText` and `codeText`
        */
        if (codeText) {
          sections.push({ docsText, codeText, startLineNumber })
          docsText = codeText = ''
        }

        /* Add the line to the documentation (docsText) taking out the leading */
        /* comment marker */
        if (lang.symbol) {
          line = line.replace(lang.commentMatcher, '')
        }
        docsText += line + '\n'

        /* If the line was a new markdown section (`===`,  `---` or `##`), */
        /* close off that section */
        if (/^(---+|===+|#+.*)$/.test(line)) {
          sections.push({ docsText, codeText })
          docsText = codeText = ''
        }
        /* Case #2: it's not a comment */
        /* Note that from this moment on `codeText` is no longer empty, */
        /* which means that the next comment line (destined to docsText) will */
        /* trigger a new section */
      } else {
        if (codeText === '') {
          startLineNumber = lineNumber
        }
        codeText += line + '\n'
      }
      /* If it's an empty line, it will go either in the */
      /* code section or in the docs section. */
      /* We know we are in the code section by checking if */
      /* there is any code in codeText yet */
    } else {
      if (codeText) codeText += line + '\n'
      else docsText += line + '\n'
    }
  }
  sections.push({ docsText, codeText, startLineNumber })

  return sections
}

function codeToHtml (highlighter, code, language, lineNumber) {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }

  function escapeHtml (html) {
    return html.replace(/[&<>"']/g, (chr) => htmlEscapes[chr])
  }

  const FontStyle = {
    NotSet: -1,
    None: 0,
    Italic: 1,
    Bold: 2,
    Underline: 4
  }

  /* See: https://github.com/shikijs/shiki/blob/f322a2b97470b25b26a4d8c1cf4892b059eb69db/packages/shiki/src/renderer.ts */
  function renderToHtml (lines, options = {}) {
    const bg = options.bg || 'transparent'

    const hasLineNumbers = typeof options.lineNumber === 'number'
    const lineNumber = options.lineNumber ?? 1

    const numberOfNonEmptyLines = lines.filter((l) => l.length > 0).length
    if (numberOfNonEmptyLines === 0) {
      return ''
    }

    let html = ''

    html += `<pre class="shiki" style="background-color: ${bg}">`
    if (options.langId) {
      html += `<div class="language-id">${options.langId}</div>`
    }
    html +=
      '<code ' +
      (hasLineNumbers ? `style="--line-start-number: ${lineNumber};"` : '') +
      '>'

    lines.forEach((l, idx) => {
      const lineClasses = ['line', l.length > 0 ? undefined : 'empty-line']
        .filter(Boolean)
        .join(' ')
      const currentLineId = `L${lineNumber + idx}`

      html +=
        `<span class="${lineClasses}"` +
        (hasLineNumbers ? ` id="${currentLineId}"` : '') +
        '>'

      l.forEach((token) => {
        const cssDeclarations = [`color: ${token.color || options.fg}`]
        if (token.fontStyle & FontStyle.Italic) {
          cssDeclarations.push('font-style: italic')
        }
        if (token.fontStyle & FontStyle.Bold) {
          cssDeclarations.push('font-weight: bold')
        }
        if (token.fontStyle & FontStyle.Underline) {
          cssDeclarations.push('text-decoration: underline')
        }
        html += `<span style="${cssDeclarations.join('; ')}">${escapeHtml(
          token.content
        )}</span>`
      })
      html += '</span>\n'
    })
    html = html.replace(/\n*$/, '') // Get rid of final new lines
    html += '</code></pre>'

    return html
  }

  const tokens = highlighter.codeToThemedTokens(code, language)

  return renderToHtml(tokens, { lineNumber })
}

// ## formatAsHtml()
//
// This function takes the sections and format them as
// HTML, alternating `docsText` and (Markdown-indented) `codeText`
//
// This function is essentially split into two subfunctions; they are both
// run passing on all of the parameters:
//
// * `formatSections()`
// * `makeHtmlBlob()`
//
// The first one, `formatSections()`, will take the `sections` array; remember:
// each element has two properties, the leading `docsText` and the trailing
// `codeText`. After running `formatSections()`, each element will also have
// `docsHtml` and `codeHtml` (their respective HTML versions). This is done using
// `markdown` for the docs, and `shiki` for the code. If a plugin was
// specified, the filter `plugin.beforeMarked` will be run before feeding the text
// to Marked. This allows users to extend Markdown as neeed.
//
// Since Markdown documentation can _also_ contain code (by indenting 4 spaces),
// the `shiki` option is set for Markdown, instructing it what to do when
// a code block is encountered: obviously, the `shiki` library
// will be used to format it.
//
// The second functtion, `makeHtmlBlob()`, actually creates the final HTML code
// using the formatted sections as a starting point. The conversion is done
// by using the EJS template provided, and passing it important variables:
//
// * `sources` -- it's the list of sources, useful to create table of contents
// * `css` -- it's the path to the CSS file, relative to the processed file.
// * `title` -- the title of the file. If the file starts with a markdown
//   heading, this variable will have the contents of that heading; otherwise,
//   it will have the file name.
// * `firstSectionIsTitle` -- if true, the `title` variable is indeed the first
//   section's markdown heading. Templates can use this information to write
//   the logic around the title.
// * `sections` -- array of the various sections, which include `docsHtml` and `codeHtml`.
//   This array is used by the EJS template to know what the file actually
//   contains
// * `finalPath` and `relativeToThisFile` -- two functions often used together
//   in templates to know how to (HTML) link to another file in sources. For
//   example `relativeToThisFile(finalPath(source))`.
//
// One note about the `_getTemplate()` function. The aim of the function is
// to load the template file, and return an EJS compiler. The file itself
// is memoized, so that calling `_getTemplate()` doesn't result in multiple
// reloading of the same file (since `formatAsHtml()` is potentially called
// multiple times, once for each passed file). Memoization avoids using a
// global variable.
//
async function formatAsHtml (source, sections, config = {}) {
  configure(config)

  const lang = config.lang

  /* Format sections, as HTML (from Markdown) or as highlighted code */
  await formatSections(source, sections, config, lang)

  /* return the HTML blob */
  return makeHtmlBlob(source, sections, config, lang)

  /* Format and highlight the various section of the code, using */
  async function formatSections (source, sections, config = {}, lang) {
    const highlighter = await shiki.getHighlighter({
      theme: config.shikiTheme ?? 'min-light'
    })

    /* [Markdown](https://github.com/markedjs/marked) and Shiki */
    /* Set options specified by the user, using to `smartypants: true` */
    /* as a starting point */
    marked.setOptions(config.marked)

    /* Code might happen within the markdown documentation as well! If that */
    /* is the case, it will highlight code either using the language specified */
    /* within the Markdown codeblock, or the default language used for the processes */
    /* file */
    marked.setOptions({
      highlight: function (code, language) {
        if (!language) language = lang.name

        try {
          return codeToHtml(highlighter, code, language, undefined)
        } catch (error) {
          console.warn(
            `${source}: language '${language}' not recognised, code block not highlighted`
          )
          return code
        }
      }
    })

    for (const section of sections) {
      let code = codeToHtml(
        highlighter,
        section.codeText,
        lang.name,
        section.startLineNumber
      )

      code = code.replace(/\s+$/, '')
      if (code !== '') section.codeHtml = `${code}`
      else section.codeHtml = ''
      if (config.plugin.beforeMarked) {
        const newText = await config.plugin.beforeMarked(section.docsText)
        section.docsText = newText
      }
      section.docsHtml = marked(section.docsText)

      if (config.plugin.afterHtml) {
        const newHtml = await config.plugin.afterHtml(section.docsHtml)
        section.docsHtml = newHtml
      }
    }
  }

  /* Once all of the code has finished highlighting, we can **write** the resulting */
  /* documentation file by passing the completed HTML sections into the template, */
  /* and rendering it to the specified output path. */
  async function makeHtmlBlob (source, sections, config = {}) {
    let first

    async function _getTemplate (template) {
      if (formatAsHtml._template) return formatAsHtml._template

      template = (await fs.readFile(template)).toString()
      template = formatAsHtml._template = ejs.compile(template)
      return template
    }

    function relativeToThisFile (file) {
      const from = path.resolve(path.dirname(thisFile))
      const to = path.resolve(path.dirname(file))
      return path.join(path.relative(from, to), path.basename(file))
    }

    function includeText (source) {
      return (s, silentFail) => {
        let contents
        let file
        if (path.isAbsolute(s)) {
          file = s
        } else {
          file = s
        }
        try {
          contents = fs.readFileSync(file)
          return contents
        } catch (e) {
          if (silentFail && e.code === 'ENOENT') return ''
          if (e.code === 'ENOENT') {
            console.error('Could not load included file:', file)
          } else {
            console.log(e)
          }
          process.exit(100)
        }
      }
    }

    const thisFile = finalPath(source, config)

    /* Work out `title`, which will be either the first heading in the */
    /* documentation, or (as a last resort) the file name */
    const firstSection = sections.find((s) => {
      return s.docsText.length > 0
    })
    let lexed
    if (firstSection) {
      lexed = marked.lexer(firstSection.docsText)
      first = lexed[0]
    }
    const maybeTitle = first && first.type === 'heading' && first.depth === 1
    const title = maybeTitle ? first.text : path.basename(source)
    const firstSectionIsTitle = maybeTitle && lexed.length === 1

    /* If the first section is the title, then get rid of it  */
    /* since the title is already being displayed by the template anyway */
    if (firstSectionIsTitle) {
      sections.shift()
    }

    /* The `css` variable will be available in the template as a relative */
    /* link to the CSS file */
    const css = relativeToThisFile(
      path.join(config.output, path.basename(config.css))
    )

    const template = await _getTemplate(config.template)

    /* Make up the HTML based on the template */
    const html = template({
      lang,
      includeText: includeText(source),
      source,
      sources: config.sources,
      css,
      firstSectionIsTitle,
      title,
      sections,
      finalPath: (path) => finalPath(path, config),
      relativeToThisFile,

      hasTitle: firstSectionIsTitle, // compatibility to Docco's original API
      destination: (path) => finalPath(path, config), // compatibility to Docco's original API
      relative: relativeToThisFile // compatibility to Docco's original API
    })
    return html
  }
}

// Public API
// ----------
// These functions are available once the module is `required()`. They are
// self contained and can be used to take Docco Next to different directions.
exports = module.exports = {
  copyAsset,
  run,
  parse,
  formatAsHtml,
  litToCode,
  documentOne,
  documentAll,
  version
}

/*
`rm -rf dir2/*; node --inspect-brk bin/docco  -o dir2 ./doccoOrig.js sub/doccoOrig.js`
`rm -rf dir2/*; node bin/docco  -l default -L /tmp/extras.json -o dir2 ./docco.js
docco: ./docco.js -> dir2/docco.html
*/
