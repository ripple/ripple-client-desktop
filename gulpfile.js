'use strict';

var gulp = require('gulp'),
  shell = require('gulp-shell'),
  merge = require('merge-stream'),
  modRewrite = require('connect-modrewrite'),
  BannerPlugin = require('gulp-webpack/node_modules/webpack/lib/BannerPlugin'),
  UglifyJsPlugin = require('gulp-webpack/node_modules/webpack/lib/optimize/UglifyJsPlugin'),
  jade = require('jade'),
  jadeL10n = require('jade-l10n'),
  NwBuilder = require('nw-builder'),
  runSequence = require('run-sequence'),

  meta = require('./package.json');
  //languages = require('./l10n/languages.json').active;

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del', 'browser-sync']
});

var BUILD_DIR = '.build/';
var TMP_DIR = '.tmp/';
var PACKAGES_FOLDER = 'packages/';

require('events').EventEmitter.prototype._maxListeners = 100;

// Clean the build folder
gulp.task('clean:dev', function () {
  $.del.sync([
    TMP_DIR + 'js',
    TMP_DIR + 'templates',
    TMP_DIR + 'main.css',
    TMP_DIR + 'index.html'
  ]);
});

gulp.task('clean:dist', function () {
  $.del.sync([BUILD_DIR + '*']);
});

// Webpack
gulp.task('webpack:vendor:dev', function() {
  return gulp.src('src/js/entry/vendor.js')
    .pipe($.webpack({
      output: {
        filename: 'vendor.js'
      },
      module: {
        loaders: [
          {test: /\.json$/, loader: 'json-loader'},
          {test: /\.js$/, exclude: /node_modules/, loader: 'babel-loader?optional=runtime'}
        ]
      },
      target: 'node-webkit',
      cache: true,
      debug: true
    }))
    .pipe(gulp.dest(TMP_DIR + 'js/'))
    .pipe($.browserSync.reload({stream:true}));
});

gulp.task('webpack:vendor:dist', function() {
  return gulp.src('src/js/entry/vendor.js')
    .pipe($.webpack({
      output: {
        filename: "vendor.js"
      },
      module: {
        loaders: [
          {test: /\.json$/, loader: 'json-loader'},
          {test: /\.js$/, exclude: /node_modules/, loader: 'babel-loader?optional=runtime'}
        ]
      },
      target: 'node-webkit',
      debug: false
    }))
    .pipe(gulp.dest(BUILD_DIR + 'js/'))
});

gulp.task('webpack:dev', function() {
  // TODO jshint
  // TODO move to js/entry.js
  return gulp.src('src/js/entry/entry.js')
    .pipe($.webpack({
      module: {
        loaders: [
          { test: /\.jade$/, loader: "jade-loader" },
          { test: /\.json$/, loader: "json-loader" }
        ]
      },
      output: {
        filename: "app.js"
      },
      target: 'node-webkit',
      cache: true,
      debug: true
    }))
    .pipe(gulp.dest(TMP_DIR + 'js/'))
    .pipe($.browserSync.reload({stream:true}));
});

gulp.task('webpack:dist', function() {
  return gulp.src('src/js/entry/entry.js')
    .pipe($.webpack({
      module: {
        loaders: [
          { test: /\.jade$/, loader: "jade-loader" },
          { test: /\.json$/, loader: "json-loader" }
        ]
      },
      output: {
        filename: "app.js"
      },
      plugins: [
        new BannerPlugin('Ripple Admin Console v' + meta.version + '\nCopyright (c) ' + new Date().getFullYear() + ' ' + meta.author.name + '\nLicensed under the ' + meta.license + ' license.'),
        new UglifyJsPlugin({
          compress: {
            warnings: false
          }
        })
      ],
      target: 'node-webkit',
      debug: false
    }))
    .pipe(gulp.dest(BUILD_DIR + 'js/'));
});

// TODO SASS
// Less
gulp.task('less', function () {
  return gulp.src('src/less/ripple/main.less')
    .pipe($.less({
      paths: ['src/less']
    }))
    .pipe(gulp.dest(TMP_DIR))
    .pipe($.browserSync.reload({stream:true}));
});

// Extracts l10n strings from template files
gulp.task('l10nExtract', function () {
  return gulp.src('src/templates/**/*.jade')
    .pipe($.jadeL10nExtractor({
      filename: 'messages.pot'
    }))
    .pipe(gulp.dest('./l10n/templates'))
});

// Static server
gulp.task('serve', function() {
  $.browserSync({
    open: false,
    server: {
      baseDir: [".", TMP_DIR, "./res", "./deps/js", ''],
      middleware: [
        modRewrite([
          '!\\.html|\\.js|\\.css|\\.png|\\.jpg|\\.gif|\\.svg|\\.txt|\\.eot|\\.woff|\\.woff2|\\.ttf$ /index.html [L]'
        ])
      ]
    }
  });
});

// Launch node-webkit
gulp.task('nwlaunch', shell.task(['node_modules/.bin/nw']));

// Static files
gulp.task('static', function() {
  // package.json
  var pkg = gulp.src(['src/package.json'])
    .pipe(gulp.dest(BUILD_DIR));

  var icons = gulp.src(['icons/**/*'])
    .pipe(gulp.dest(BUILD_DIR + 'icons/'));

  var res = gulp.src(['res/**/*'])
    .pipe(gulp.dest(BUILD_DIR));

  var fonts = gulp.src(['fonts/**/*', 'node_modules/font-awesome/fonts/**/*'])
    .pipe(gulp.dest(BUILD_DIR + 'fonts/'));

  // Images
  var images = gulp.src('img/**/*')
    .pipe(gulp.dest(BUILD_DIR + 'img/'));

  return merge(pkg, icons, res, fonts, images);
});

// Version branch
gulp.task('gitVersion', function (cb) {
  require('child_process').exec('git rev-parse --abbrev-ref HEAD', function(err, stdout) {
    meta.gitVersionBranch = stdout.replace(/\n$/, '');

    require('child_process').exec('git describe --tags --always', function(err, stdout) {
      meta.gitVersion = stdout.replace(/\n$/, '');

      cb(err)
    })
  })
});

// Preprocess
gulp.task('preprocess:dev', function() {
  return gulp.src(TMP_DIR + 'templates/en/index.html')
    .pipe($.preprocess({
      context: {
        MODE: 'dev',
        VERSION: meta.gitVersion,
        VERSIONBRANCH: meta.gitVersionBranch,
        VERSIONFULL: meta.gitVersion + '-' + meta.gitVersionBranch
      }
    }))
    .pipe(gulp.dest(TMP_DIR))
});

gulp.task('preprocess:dist', function() {
  return gulp.src(BUILD_DIR + 'templates/en/index.html')
    .pipe($.preprocess({
      context: {
        MODE: 'dist',
        VERSION: meta.gitVersion,
        VERSIONBRANCH: meta.gitVersionBranch,
        VERSIONFULL: meta.gitVersion
      }
    }))
    .pipe(gulp.dest(BUILD_DIR))
});

// Languages
gulp.task('templates:dev', function () {
  return gulp.src('src/templates/**/*.jade')
    // filter out unchanged partials
    .pipe($.cached('jade'))

    // find files that depend on the files that have changed
    .pipe($.jadeInheritance({basedir: 'src/templates'}))

    // filter out partials (folders and files starting with "_" )
    .pipe($.filter(function (file) {
      return !/\/_/.test(file.path) && !/^_/.test(file.relative);
    }))

    .pipe($.jade({
      jade: jade,
      pretty: true
    }))
    .pipe(gulp.dest(TMP_DIR + 'templates/en'))
});

//var languageTasks = [];

//languages.forEach(function(language){
//  gulp.task('templates:' + language.code, function(){
//    return gulp.src('src/templates/**/*.jade')
//      .pipe($.jade({
//        jade: jadeL10n,
//        languageFile: 'l10n/' + language.code + '/messages.po',
//        pretty: true
//      }))
//      .pipe(gulp.dest(BUILD_DIR + 'templates/' + language.code));
//  });

  //languageTasks.push('templates:' + language.code);
//});

//gulp.task('templates:dist', function(){
//  runSequence(languageTasks)
//});

gulp.task('templates:dist', function() {
  return gulp.src('src/templates/**/*.jade')
    .pipe($.jade({
      jade: jadeL10n,
      languageFile: 'l10n/en/messages.po',
      pretty: true
    }))
    .pipe(gulp.dest(BUILD_DIR + 'templates/en'));
});

// Default Task (Dev environment)
gulp.task('default', function() {
  runSequence(
    ['clean:dev', 'webpack:dev', 'webpack:vendor:dev', 'less', 'templates:dev',  'gitVersion'],
    'preprocess:dev',
    'serve',
    'nwlaunch'
  );

  // Webpack
  gulp.watch(['src/js/**/*.js', 'config.js', '!src/js/entry/vendor.js'], ['webpack:dev']);

  // Webpack for vendor files
  gulp.watch(['src/js/entry/vendor.js'], ['webpack:vendor:dev']);

  // Templates
  gulp.watch(['src/templates/**/*.jade'], ['templates:dev']);

  // index.html preprocessing
  $.watch(TMP_DIR + 'templates/en/*.html', function(){
    gulp.start('preprocess:dev');
  });

  // Reload
  $.watch(TMP_DIR + 'templates/**/*', $.browserSync.reload);

  gulp.watch('src/less/**/*', ['less']);
});

gulp.task('deps', function () {
  var assets = $.useref.assets();

  return gulp.src([BUILD_DIR + 'index.html'])
    // Concatenates asset files from the build blocks inside the HTML
    .pipe(assets)
    // Appends hash to extracted files app.css → app-098f6bcd.css
    .pipe($.rev())
    // Adds AngularJS dependency injection annotations
    // We don't need this, cuz the app doesn't go thru this anymore
    //.pipe($.if('*.js', $.ngAnnotate()))
    // Uglifies js files
    .pipe($.if('*.js', $.uglify()))
    // Minifies css files
    .pipe($.if('*.css', $.csso()))
    // Brings back the previously filtered HTML files
    .pipe(assets.restore())
    // Parses build blocks in html to replace references to non-optimized scripts or stylesheets
    .pipe($.useref())
    // Rewrites occurences of filenames which have been renamed by rev
    .pipe($.revReplace())
    // Minifies html
    .pipe($.if('*.html', $.minifyHtml({
      empty: true,
      spare: true,
      quotes: true
    })))
    // Creates the actual files
    .pipe(gulp.dest(BUILD_DIR))
    // Print the file sizes
    .pipe($.size({ title: BUILD_DIR, showFiles: true }));
});

// Build packages
gulp.task('build', function() {
  var nw = new NwBuilder({
    files: [BUILD_DIR + '**/**'],
    platforms: ['win', 'osx', 'linux'],
    // TODO: Use these instead of the nested app/package.json values
    appName: meta.name + '-' + meta.version,
    appVersion: meta.version,
    buildDir: PACKAGES_FOLDER,
    macZip: true,
    cacheDir: TMP_DIR,
    version: '0.12.3',
    // TODO: timestamped versions
    macIcns: './res/dmg/xrp_ripple_logo.icns'
    // TODO: winIco
  });

  return nw.build()
    .catch(function (error) {
      console.error(error);
    });
});

// Zip packages
gulp.task('zip', function() {
  // Zip the packages
  var linux32 = gulp.src(PACKAGES_FOLDER + meta.name + '/linux32/**/*')
    .pipe($.zip('linux32.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  var linux64 = gulp.src(PACKAGES_FOLDER + meta.name + '/linux64/**/*')
    .pipe($.zip('linux64.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  var osx32 = gulp.src(PACKAGES_FOLDER + meta.name + '/osx32/**/*')
    .pipe($.zip('osx32.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  var osx64 = gulp.src(PACKAGES_FOLDER + meta.name + '/osx64/**/*')
    .pipe($.zip('osx64.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  var win32 = gulp.src(PACKAGES_FOLDER + meta.name + '/win32/**/*')
    .pipe($.zip('win32.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  var win64 = gulp.src(PACKAGES_FOLDER + meta.name + '/win64/**/*')
    .pipe($.zip('win64.zip'))
    .pipe(gulp.dest(PACKAGES_FOLDER + meta.name));

  return merge(linux32, linux64, osx32, osx64, win32, win64);
});

// Final product
gulp.task('packages', function() {
  return runSequence(
    ['clean:dist', 'webpack:dist', 'webpack:vendor:dist', 'less', 'templates:dist', 'static', 'gitVersion'],
    'preprocess:dist',
    'deps',
    'build',
    'zip'
  )
});
